// apps/web/src/reader/ReaderViewport.tsx
// Biblia Populi — Reader Viewport (TanStack Virtual + smart chunked prefetching)
//
// Freeze killers (why it was locking up):
// • The scroll container MUST remain sx.scroll (position:absolute; inset:0). Do NOT override to position:relative.
//   Overriding causes massive layout (millions of px) + virtualizer instability.
//
// Upgrades / bulletproofing:
// • Real request cancellation via AbortController (abort on spine-change + unmount).
// • Stable prefetch deps (first/last index; not virtualItems identity).
// • Measuring is allowed again when dataTick bumps (skeleton -> real text) but limited to once/element/tick.
// • Book-gate will NOT trigger at verseOrdMin (no “gate at Genesis 1:1”).

import React, {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { apiGetSlice, type BookRow } from "../api";
import type { ReaderPosition, SliceVerse, SpineStats } from "./types";
import { VerseRow } from "./VerseRow";
import { sx } from "./sx";
import { BookTitlePage } from "./BookTitlePage";

const CHUNK = 240;
const PREFETCH_CHUNKS_AHEAD = 2;
const PREFETCH_CHUNKS_BEHIND = 1;

const MAX_CHUNKS_IN_MEMORY = 10;
const EST_ROW_PX = 56;

function chunkStart(ord: number): number {
    return Math.floor((ord - 1) / CHUNK) * CHUNK + 1;
}
function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

/* ------------------------------ Public API ------------------------------ */
export type ReaderViewportHandle = {
    jumpToOrd: (ord: number, behavior?: "auto" | "smooth") => void;
    getCurrentOrd: () => number;
};

/* ------------------------------- Props -------------------------------- */
type Props = {
    spine: SpineStats;
    bookById: Map<string, BookRow>;
    topContent?: React.ReactNode;
    onPosition: (pos: ReaderPosition) => void;
    onError?: (msg: string) => void;
    onReady?: () => void;
};

/* --------------------------- Internal types ---------------------------- */
type PendingJump = { ord: number; behavior: "auto" | "smooth" };
type BookGateState = { ord: number; bookId: string };

/* ----------------------------- Book Gate UI ---------------------------- */
function BookGate(props: { book: BookRow | null; bookId: string; onContinue: () => void }) {
    const { book, bookId, onContinue } = props;
    const btnRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        queueMicrotask(() => btnRef.current?.focus());
    }, []);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={`Book: ${book?.name ?? bookId}`}
            tabIndex={-1}
            style={{
                position: "absolute",
                inset: 0,
                zIndex: 30,
                display: "grid",
                placeItems: "center",
                padding: 18,
                background: "color-mix(in oklab, var(--bg) 72%, rgba(0,0,0,0.55))",
                backdropFilter: "blur(10px)",
            }}
            onKeyDown={(e) => {
                const block = new Set([" ", "PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End"]);
                if (block.has(e.key)) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                if (e.key === "Escape" || e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    onContinue();
                }
            }}
        >
            <div
                style={{
                    width: "min(860px, 100%)",
                    borderRadius: 18,
                    border: "1px solid color-mix(in oklab, var(--hairline) 92%, transparent)",
                    background: "color-mix(in oklab, var(--bg) 82%, var(--panel))",
                    boxShadow: "0 34px 110px rgba(0,0,0,0.34)",
                    overflow: "hidden",
                }}
            >
                <BookTitlePage book={book} bookId={bookId} />

                <div
                    style={{
                        display: "flex",
                        justifyContent: "center",
                        padding: "14px 14px 18px",
                        background:
                            "linear-gradient(to bottom, transparent, color-mix(in oklab, var(--bg) 88%, var(--panel)))",
                    }}
                >
                    <button
                        ref={btnRef}
                        type="button"
                        onClick={onContinue}
                        style={{
                            height: 40,
                            padding: "0 16px",
                            borderRadius: 12,
                            border: "1px solid color-mix(in oklab, var(--focus) 70%, var(--hairline))",
                            background: "var(--focus)",
                            color: "var(--fg)",
                            fontSize: 12.6,
                            fontWeight: 820,
                            letterSpacing: "-0.01em",
                            cursor: "pointer",
                            boxShadow: "0 14px 34px color-mix(in oklab, var(--focus) 20%, transparent)",
                        }}
                    >
                        Continue
                    </button>
                </div>
            </div>
        </div>
    );
}

/* -------------------------- Chunk cache state -------------------------- */
type ChunkState = {
    verseMap: Map<number, SliceVerse>;
    loadedChunks: Set<number>;
    loadingChunks: Set<number>;
    loadedOrder: number[];
};

function createChunkState(): ChunkState {
    return {
        verseMap: new Map(),
        loadedChunks: new Set(),
        loadingChunks: new Set(),
        loadedOrder: [],
    };
}

/* ----------------------------- Main Component --------------------------- */
export const ReaderViewport = forwardRef<ReaderViewportHandle, Props>(function ReaderViewport(props, ref) {
    const { spine, bookById, topContent, onPosition, onError, onReady } = props;

    const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

    // All heavy data lives in a ref (prevents massive re-renders)
    const chunkRef = useRef<ChunkState>(createChunkState());
    const [dataTick, setDataTick] = useState(0); // triggers virtualizer refresh (and re-measure pass)

    // Measure thrash breaker:
    // - we allow measuring again when dataTick changes (skeleton -> real text)
    // - but never more than once per element per tick
    const measuredAtRef = useRef<WeakMap<Element, number>>(new WeakMap());

    const bumpTick = useCallback(() => setDataTick((t) => t + 1), []);

    // spine sanity: derive count from range (trust ord bounds more than verseCount)
    const derivedCount = useMemo(() => {
        const min = spine.verseOrdMin;
        const max = spine.verseOrdMax;
        const c = max >= min ? max - min + 1 : 0;
        return c;
    }, [spine.verseOrdMin, spine.verseOrdMax]);

    const count = useMemo(() => {
        const c = Number.isFinite(spine.verseCount) ? spine.verseCount : 0;
        if (c <= 0) return derivedCount;
        if (derivedCount > 0 && c !== derivedCount) return derivedCount;
        return c;
    }, [spine.verseCount, derivedCount]);

    const initialOrd = useMemo(() => clamp(1, spine.verseOrdMin, spine.verseOrdMax), [spine.verseOrdMin, spine.verseOrdMax]);

    const [posOrd, setPosOrd] = useState<number>(initialOrd);
    const posOrdRef = useRef<number>(initialOrd);

    const pendingJumpRef = useRef<PendingJump | null>(null);
    const readyOnceRef = useRef(false);

    // Invalidate in-flight requests when spine changes
    const runIdRef = useRef(0);

    // Real cancellation (prevents late commits + reduces network spam)
    const inFlightRef = useRef<Map<number, AbortController>>(new Map());
    const abortAllInFlight = useCallback(() => {
        for (const c of inFlightRef.current.values()) c.abort();
        inFlightRef.current.clear();
    }, []);

    // Book-boundary gate
    const [gate, setGate] = useState<BookGateState | null>(null);
    const gateRef = useRef<BookGateState | null>(null);
    const lastGatedBookIdRef = useRef<string | null>(null);
    const gateCooldownRef = useRef<number>(0);

    /* -------------------------- Sync refs -------------------------- */
    useEffect(() => {
        posOrdRef.current = posOrd;
    }, [posOrd]);

    useEffect(() => {
        gateRef.current = gate;
    }, [gate]);

    /* ------------------------- Eviction ------------------------- */
    const evictFarChunks = useCallback(
        (keepOrd: number): void => {
            const state = chunkRef.current;
            const keepChunk = chunkStart(clamp(keepOrd, spine.verseOrdMin, spine.verseOrdMax));
            const list = state.loadedOrder;

            while (list.length > MAX_CHUNKS_IN_MEMORY) {
                let farIdx = 0;
                let farDist = -1;

                for (let i = 0; i < list.length; i++) {
                    const c = list[i]!;
                    const d = Math.abs(c - keepChunk);
                    if (d > farDist) {
                        farDist = d;
                        farIdx = i;
                    }
                }

                const victim = list.splice(farIdx, 1)[0]!;
                state.loadedChunks.delete(victim);

                // Remove all verses within victim chunk
                const startOrd = victim;
                const end = Math.min(victim + CHUNK - 1, spine.verseOrdMax);
                for (let ord = startOrd; ord <= end; ord++) state.verseMap.delete(ord);
            }
        },
        [spine.verseOrdMin, spine.verseOrdMax],
    );

    /* ------------------------- Load chunk ------------------------- */
    const ensureChunk = useCallback(
        async (startOrd: number, keepOrd?: number): Promise<void> => {
            const s = clamp(startOrd, spine.verseOrdMin, spine.verseOrdMax);
            const chunk = chunkStart(s);

            const state = chunkRef.current;
            if (state.loadedChunks.has(chunk) || state.loadingChunks.has(chunk)) return;

            const myRunId = runIdRef.current;

            state.loadingChunks.add(chunk);
            const ctrl = new AbortController();
            inFlightRef.current.set(chunk, ctrl);

            try {
                const res = await apiGetSlice(chunk, CHUNK, { signal: ctrl.signal });
                if (runIdRef.current !== myRunId) return;
                if (ctrl.signal.aborted) return;

                for (const v of res.verses) state.verseMap.set(v.verseOrd, v);

                state.loadedChunks.add(chunk);
                state.loadedOrder.push(chunk);

                evictFarChunks(keepOrd ?? posOrdRef.current);
                bumpTick();
            } catch (e: unknown) {
                if (runIdRef.current !== myRunId) return;
                if (ctrl.signal.aborted) return;
                onError?.(e instanceof Error ? e.message : String(e));
            } finally {
                state.loadingChunks.delete(chunk);
                inFlightRef.current.delete(chunk);
            }
        },
        [bumpTick, evictFarChunks, onError, spine.verseOrdMin, spine.verseOrdMax],
    );

    /* ------------------------- Reset on spine change ------------------------- */
    useEffect(() => {
        // New run: abort in-flight requests and invalidate late results
        abortAllInFlight();
        runIdRef.current++;

        chunkRef.current = createChunkState();
        measuredAtRef.current = new WeakMap(); // reset measured cache per run

        setPosOrd(initialOrd);
        posOrdRef.current = initialOrd;

        setGate(null);
        gateRef.current = null;
        lastGatedBookIdRef.current = null;
        gateCooldownRef.current = 0;

        pendingJumpRef.current = null;
        readyOnceRef.current = false;

        // Kick initial chunk
        void ensureChunk(chunkStart(initialOrd), initialOrd);
        bumpTick();
    }, [initialOrd, ensureChunk, bumpTick, abortAllInFlight]);

    // Abort any in-flight fetches on unmount
    useEffect(() => {
        return () => abortAllInFlight();
    }, [abortAllInFlight]);

    /* ------------------------- Scroll element ready ------------------------- */
    useEffect(() => {
        if (!scrollEl) return;
        void ensureChunk(chunkStart(initialOrd), initialOrd);
    }, [scrollEl, ensureChunk, initialOrd]);

    /* ------------------------- Virtualizer ------------------------- */
    const rowVirtualizer = useVirtualizer({
        count,
        getScrollElement: () => scrollEl,
        estimateSize: () => EST_ROW_PX,
        overscan: 18,
        getItemKey: (index) => String(spine.verseOrdMin + index),
    });

    const virtualItems = rowVirtualizer.getVirtualItems();
    const firstIndex = virtualItems[0]?.index ?? 0;
    const lastIndex = virtualItems.length ? virtualItems[virtualItems.length - 1]!.index : 0;

    /* ------------------------- Public jump API ------------------------- */
    const jumpToOrd = useCallback(
        (ord: number, behavior: "auto" | "smooth" = "auto") => {
            const targetOrd = clamp(ord, spine.verseOrdMin, spine.verseOrdMax);
            const idx = targetOrd - spine.verseOrdMin;

            void ensureChunk(chunkStart(targetOrd), targetOrd);

            if (!scrollEl) {
                pendingJumpRef.current = { ord: targetOrd, behavior };
                return;
            }

            requestAnimationFrame(() => {
                rowVirtualizer.scrollToIndex(idx, { align: "start", behavior });
            });
        },
        [ensureChunk, rowVirtualizer, scrollEl, spine.verseOrdMin, spine.verseOrdMax],
    );

    useImperativeHandle(
        ref,
        () => ({
            jumpToOrd,
            getCurrentOrd: () => posOrdRef.current,
        }),
        [jumpToOrd],
    );

    /* ------------------------- Ready + pending jump ------------------------- */
    useEffect(() => {
        if (!scrollEl) return;

        if (!readyOnceRef.current) {
            readyOnceRef.current = true;
            void ensureChunk(chunkStart(initialOrd), initialOrd);
            onReady?.();
        }

        const p = pendingJumpRef.current;
        if (p) {
            pendingJumpRef.current = null;
            jumpToOrd(p.ord, p.behavior);
        }
    }, [scrollEl, jumpToOrd, onReady, ensureChunk, initialOrd]);

    /* ------------------------- Prefetch logic ------------------------- */
    useEffect(() => {
        if (!virtualItems.length) return;

        const firstOrd = spine.verseOrdMin + firstIndex;
        const lastOrd = spine.verseOrdMin + lastIndex;

        const start = chunkStart(firstOrd);
        const end = chunkStart(lastOrd);

        // current viewport
        for (let c = start; c <= end; c += CHUNK) void ensureChunk(c, firstOrd);

        // ahead
        for (let k = 1; k <= PREFETCH_CHUNKS_AHEAD; k++) {
            const ahead = end + k * CHUNK;
            if (ahead <= spine.verseOrdMax) void ensureChunk(ahead, lastOrd);
        }

        // behind
        for (let k = 1; k <= PREFETCH_CHUNKS_BEHIND; k++) {
            const behind = start - k * CHUNK;
            if (behind >= spine.verseOrdMin) void ensureChunk(behind, firstOrd);
        }
    }, [
        firstIndex,
        lastIndex,
        ensureChunk,
        spine.verseOrdMin,
        spine.verseOrdMax,
        virtualItems.length,
    ]);

    /* ------------------------- Gate scroll lock ------------------------- */
    useEffect(() => {
        if (!scrollEl) return;

        const prevOverflowY = scrollEl.style.overflowY;
        const prevOverscroll = (scrollEl.style as any).overscrollBehavior;
        const prevScrollBehavior = scrollEl.style.scrollBehavior;

        if (gate) {
            scrollEl.style.overflowY = "hidden";
            (scrollEl.style as any).overscrollBehavior = "contain";
            scrollEl.style.scrollBehavior = "auto";
        } else {
            scrollEl.style.overflowY = prevOverflowY;
            (scrollEl.style as any).overscrollBehavior = prevOverscroll;
            scrollEl.style.scrollBehavior = prevScrollBehavior;
        }

        return () => {
            scrollEl.style.overflowY = prevOverflowY;
            (scrollEl.style as any).overscrollBehavior = prevOverscroll;
            scrollEl.style.scrollBehavior = prevScrollBehavior;
        };
    }, [scrollEl, gate]);

    /* ------------------------- Track top verse (layout) ------------------------- */
    useLayoutEffect(() => {
        if (!scrollEl || !virtualItems.length || gateRef.current) return;

        const st = scrollEl.scrollTop;

        // virtualItems are sorted by start.
        let topItem = virtualItems[0]!;
        for (let i = 0; i < virtualItems.length; i++) {
            const it = virtualItems[i]!;
            if (it.start + it.size > st + 1) {
                topItem = it;
                break;
            }
        }

        const ord = spine.verseOrdMin + topItem.index;

        if (posOrdRef.current !== ord) {
            posOrdRef.current = ord;
            setPosOrd(ord);
        }

        void ensureChunk(chunkStart(ord), ord);
    }, [scrollEl, virtualItems.length, firstIndex, lastIndex, ensureChunk, spine.verseOrdMin]);

    /* ------------------------- Emit position ------------------------- */
    const lastSentRef = useRef<{ ord: number; hasVerse: boolean }>({ ord: -1, hasVerse: false });

    useEffect(() => {
        const effectiveOrd = posOrdRef.current ?? initialOrd;
        const verse = chunkRef.current.verseMap.get(effectiveOrd) ?? null;
        const book = verse ? bookById.get(verse.bookId) ?? null : null;

        const next = { ord: effectiveOrd, hasVerse: !!verse };
        const prev = lastSentRef.current;

        if (prev.ord === next.ord && prev.hasVerse === next.hasVerse) return;

        lastSentRef.current = next;
        onPosition({ ord: effectiveOrd, verse, book });
    }, [posOrd, dataTick, bookById, onPosition, initialOrd]);

    /* ------------------------- Book-boundary gate detection ------------------------- */
    useEffect(() => {
        if (!scrollEl || gateRef.current) return;
        if (gateCooldownRef.current > 0) {
            gateCooldownRef.current--;
            return;
        }

        const ord = posOrdRef.current;
        const cur = chunkRef.current.verseMap.get(ord) ?? null;
        if (!cur) return;

        // Gate only when we *enter* a new book from the previous verse.
        // (Never gate at the very first verse of the canon.)
        if (ord === spine.verseOrdMin) return;
        const prev = chunkRef.current.verseMap.get(ord - 1) ?? null;
        if (!prev) return;
        if (prev.bookId === cur.bookId) return;

        const bookId = cur.bookId;
        if (lastGatedBookIdRef.current === bookId) return;
        lastGatedBookIdRef.current = bookId;

        const idx = ord - spine.verseOrdMin;
        requestAnimationFrame(() => {
            rowVirtualizer.scrollToIndex(idx, { align: "start", behavior: "auto" });
            requestAnimationFrame(() => setGate({ ord, bookId }));
        });
    }, [scrollEl, posOrd, dataTick, rowVirtualizer, spine.verseOrdMin]);

    /* ------------------------- Rendering ------------------------- */
    const totalSize = rowVirtualizer.getTotalSize();

    const renderRow = useCallback(
        (verseOrd: number) => {
            const row = chunkRef.current.verseMap.get(verseOrd) ?? null;
            if (!row) {
                return (
                    <div style={sx.skelRow}>
                        <div style={sx.verseNum}>…</div>
                        <div style={sx.skelText} />
                    </div>
                );
            }
            return <VerseRow row={row} book={bookById.get(row.bookId) ?? null} />;
        },
        [bookById],
    );

    // Stable measurement ref (critical for TanStack Virtual stability)
    // Measure at most once per element per dataTick (skeleton -> real text).
    const measureRowEl = useCallback(
        (el: HTMLDivElement | null) => {
            if (!el) return;
            const wm = measuredAtRef.current;
            const last = wm.get(el);
            if (last === dataTick) return;
            wm.set(el, dataTick);
            rowVirtualizer.measureElement(el);
        },
        [rowVirtualizer, dataTick],
    );

    return (
        <div style={sx.body}>
            {/* IMPORTANT: do NOT override sx.scroll positioning (it must stay absolute+inset:0). */}
            <div ref={setScrollEl} style={sx.scroll}>
                <div className="container" style={sx.container}>
                    {topContent}

                    <div
                        style={{
                            height: totalSize,
                            position: "relative",
                            contain: "layout paint",
                        }}
                    >
                        {virtualItems.map((v) => {
                            const verseOrd = spine.verseOrdMin + v.index;
                            return (
                                <div
                                    key={v.key}
                                    ref={measureRowEl}
                                    data-index={v.index}
                                    style={{
                                        position: "absolute",
                                        top: 0,
                                        left: 0,
                                        width: "100%",
                                        transform: `translate3d(0, ${v.start}px, 0)`,
                                        willChange: "transform",
                                    }}
                                >
                                    {renderRow(verseOrd)}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {gate && (
                    <BookGate
                        book={bookById.get(gate.bookId) ?? null}
                        bookId={gate.bookId}
                        onContinue={() => {
                            const ord = gate.ord;
                            setGate(null);
                            gateRef.current = null;
                            gateCooldownRef.current = 8;

                            requestAnimationFrame(() => {
                                const idx = ord - spine.verseOrdMin;
                                rowVirtualizer.scrollToIndex(idx, { align: "start", behavior: "auto" });
                            });
                        }}
                    />
                )}
            </div>
        </div>
    );
});