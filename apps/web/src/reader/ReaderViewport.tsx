// apps/web/src/reader/ReaderViewport.tsx
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

export type ReaderViewportHandle = {
    jumpToOrd: (ord: number, behavior?: "auto" | "smooth") => void;
    getCurrentOrd: () => number;
};

type Props = {
    spine: SpineStats;
    bookById: Map<string, BookRow>;
    topContent?: React.ReactNode;
    onPosition: (pos: ReaderPosition) => void;
    onError?: (msg: string) => void;
    onReady?: () => void;
};

type PendingJump = { ord: number; behavior: "auto" | "smooth" };

type BookGateState = {
    ord: number;
    bookId: string;
};

function BookGate(props: {
    book: BookRow | null;
    bookId: string;
    onContinue: () => void;
}) {
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
                padding: "18px",
                background: "color-mix(in oklab, var(--bg) 72%, rgba(0,0,0,0.55))",
                backdropFilter: "blur(10px)",
            }}
            onKeyDown={(e) => {
                const block = [" ", "PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End"];
                if (block.includes(e.key)) {
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
                            color: "#fff",
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

export const ReaderViewport = forwardRef<ReaderViewportHandle, Props>(function ReaderViewport(props, ref) {
    const { spine, bookById, topContent, onPosition, onError, onReady } = props;

    const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

    const verseMapRef = useRef<Map<number, SliceVerse>>(new Map());
    const loadedChunksRef = useRef<Set<number>>(new Set());
    const loadingChunksRef = useRef<Set<number>>(new Set());
    const loadedChunkListRef = useRef<number[]>([]);

    const [dataTick, setDataTick] = useState(0);

    const initialOrd = useMemo(
        () => clamp(1, spine.verseOrdMin, spine.verseOrdMax),
        [spine.verseOrdMin, spine.verseOrdMax],
    );

    const [posOrd, setPosOrd] = useState<number>(initialOrd);
    const posOrdRef = useRef(posOrd);

    const pendingJumpRef = useRef<PendingJump | null>(null);
    const readyOnceRef = useRef(false);
    const runIdRef = useRef(0);

    const [gate, setGate] = useState<BookGateState | null>(null);
    const gateRef = useRef<BookGateState | null>(null);
    const lastGatedBookIdRef = useRef<string | null>(null);
    const gateCooldownRef = useRef<number>(0);

    useEffect(() => {
        posOrdRef.current = posOrd;
    }, [posOrd]);

    useEffect(() => {
        gateRef.current = gate;
    }, [gate]);

    const evictFarChunks = useCallback(
        (keepOrd: number): void => {
            const keepChunk = chunkStart(clamp(keepOrd, spine.verseOrdMin, spine.verseOrdMax));
            const list = loadedChunkListRef.current;

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
                loadedChunksRef.current.delete(victim);

                const start = victim;
                const end = Math.min(spine.verseOrdMax, victim + CHUNK - 1);
                for (let ord = start; ord <= end; ord++) verseMapRef.current.delete(ord);
            }
        },
        [spine.verseOrdMin, spine.verseOrdMax],
    );

    const ensureChunk = useCallback(
        async (startOrd: number, keepOrd?: number): Promise<void> => {
            const s = clamp(startOrd, spine.verseOrdMin, spine.verseOrdMax);
            const chunk = chunkStart(s);

            if (loadedChunksRef.current.has(chunk)) return;
            if (loadingChunksRef.current.has(chunk)) return;

            const myRunId = runIdRef.current;

            loadingChunksRef.current.add(chunk);
            try {
                const res = await apiGetSlice(chunk, CHUNK);

                if (runIdRef.current !== myRunId) return;

                for (const v of res.verses) verseMapRef.current.set(v.verseOrd, v);

                loadedChunksRef.current.add(chunk);
                loadedChunkListRef.current.push(chunk);

                evictFarChunks(keepOrd ?? posOrdRef.current);

                setDataTick((t) => t + 1);
            } catch (e: unknown) {
                if (runIdRef.current !== myRunId) return;
                const msg = e instanceof Error ? e.message : String(e);
                onError?.(msg);
            } finally {
                loadingChunksRef.current.delete(chunk);
            }
        },
        [evictFarChunks, onError, spine.verseOrdMin, spine.verseOrdMax],
    );

    useEffect(() => {
        runIdRef.current++;
        verseMapRef.current.clear();
        loadedChunksRef.current.clear();
        loadingChunksRef.current.clear();
        loadedChunkListRef.current = [];

        setPosOrd(initialOrd);
        posOrdRef.current = initialOrd;

        setGate(null);
        gateRef.current = null;
        lastGatedBookIdRef.current = null;
        gateCooldownRef.current = 0;

        void ensureChunk(chunkStart(initialOrd), initialOrd);
        setDataTick((t) => t + 1);
    }, [initialOrd, ensureChunk]);

    useEffect(() => {
        if (!scrollEl) return;
        void ensureChunk(chunkStart(initialOrd), initialOrd);
    }, [scrollEl, ensureChunk, initialOrd]);

    const count = spine.verseCount;

    const rowVirtualizer = useVirtualizer({
        count,
        getScrollElement: () => scrollEl,
        estimateSize: () => EST_ROW_PX,
        overscan: 18,
        getItemKey: (index) => String(spine.verseOrdMin + index),
    });

    const virtualItems = rowVirtualizer.getVirtualItems();

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

    useEffect(() => {
        if (!scrollEl) return;

        if (!readyOnceRef.current) {
            readyOnceRef.current = true;
            void ensureChunk(chunkStart(initialOrd), initialOrd);
            onReady?.();
        }

        const p = pendingJumpRef.current;
        if (!p) return;
        pendingJumpRef.current = null;
        jumpToOrd(p.ord, p.behavior);
    }, [scrollEl, jumpToOrd, onReady, ensureChunk, initialOrd]);

    useEffect(() => {
        if (!virtualItems.length) return;

        const firstIndex = virtualItems[0]!.index;
        const lastIndex = virtualItems[virtualItems.length - 1]!.index;

        const firstOrd = spine.verseOrdMin + firstIndex;
        const lastOrd = spine.verseOrdMin + lastIndex;

        const start = chunkStart(firstOrd);
        const end = chunkStart(lastOrd);

        for (let c = start; c <= end; c += CHUNK) void ensureChunk(c, firstOrd);

        for (let k = 1; k <= PREFETCH_CHUNKS_AHEAD; k++) {
            const ahead = end + k * CHUNK;
            if (ahead <= spine.verseOrdMax) void ensureChunk(ahead, lastOrd);
        }

        for (let k = 1; k <= PREFETCH_CHUNKS_BEHIND; k++) {
            const behind = start - k * CHUNK;
            if (behind >= spine.verseOrdMin) void ensureChunk(behind, firstOrd);
        }
    }, [virtualItems, dataTick, ensureChunk, spine.verseOrdMin, spine.verseOrdMax]);

    // ✅ CSS scroll lock while gate is open (no wheel/touch listeners)
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

    useLayoutEffect(() => {
        if (!scrollEl) return;
        if (!virtualItems.length) return;

        if (gateRef.current) return;

        const st = scrollEl.scrollTop;
        const topItem = virtualItems.find((it) => it.start + it.size > st + 1) ?? virtualItems[0]!;
        const ord = spine.verseOrdMin + topItem.index;

        if (posOrdRef.current !== ord) {
            posOrdRef.current = ord;
            setPosOrd(ord);
        }

        void ensureChunk(chunkStart(ord), ord);
    }, [scrollEl, virtualItems, dataTick, ensureChunk, spine.verseOrdMin]);

    const lastSentRef = useRef<{ ord: number; hasVerse: boolean }>({ ord: -1, hasVerse: false });
    useEffect(() => {
        const effectiveOrd = posOrdRef.current ?? initialOrd;
        const verse = verseMapRef.current.get(effectiveOrd) ?? null;
        const book = verse ? bookById.get(verse.bookId) ?? null : null;

        const next = { ord: effectiveOrd, hasVerse: !!verse };
        const prev = lastSentRef.current;

        if (prev.ord === next.ord && prev.hasVerse === next.hasVerse) return;
        lastSentRef.current = next;

        onPosition({ ord: effectiveOrd, verse, book });
    }, [posOrd, dataTick, bookById, onPosition, initialOrd]);

    useEffect(() => {
        if (!scrollEl) return;
        if (gateRef.current) return;

        if (gateCooldownRef.current > 0) {
            gateCooldownRef.current--;
            return;
        }

        const ord = posOrdRef.current;
        const cur = verseMapRef.current.get(ord) ?? null;
        if (!cur) return;

        if (ord !== spine.verseOrdMin) {
            const prev = verseMapRef.current.get(ord - 1) ?? null;
            if (!prev) return;
            if (prev.bookId === cur.bookId) return;
        }

        const bookId = cur.bookId;
        if (lastGatedBookIdRef.current === bookId) return;
        lastGatedBookIdRef.current = bookId;

        const idx = ord - spine.verseOrdMin;
        requestAnimationFrame(() => {
            rowVirtualizer.scrollToIndex(idx, { align: "start", behavior: "auto" });
            requestAnimationFrame(() => setGate({ ord, bookId }));
        });
    }, [scrollEl, posOrd, dataTick, rowVirtualizer, spine.verseOrdMin, spine.verseOrdMin]);

    const totalSize = rowVirtualizer.getTotalSize();

    const renderRow = useCallback(
        (verseOrd: number) => {
            const row = verseMapRef.current.get(verseOrd) ?? null;

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

    return (
        <div style={sx.body}>
            <div ref={setScrollEl} style={{ ...sx.scroll, position: "relative" }}>
                <div className="container" style={sx.container}>
                    {topContent}
                    <div style={{ height: totalSize, position: "relative", contain: "layout paint size" }}>
                        {virtualItems.map((v) => {
                            const verseOrd = spine.verseOrdMin + v.index;

                            return (
                                <div
                                    key={verseOrd}
                                    ref={(el) => {
                                        if (!el) return;
                                        rowVirtualizer.measureElement(el);
                                    }}
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

                {gate ? (
                    <BookGate
                        book={bookById.get(gate.bookId) ?? null}
                        bookId={gate.bookId}
                        onContinue={() => {
                            const ord = gate.ord;

                            setGate(null);
                            gateRef.current = null;

                            gateCooldownRef.current = 8;

                            // Keep boundary verse pinned cleanly; then user scrolls normally.
                            requestAnimationFrame(() => {
                                const idx = ord - spine.verseOrdMin;
                                rowVirtualizer.scrollToIndex(idx, { align: "start", behavior: "auto" });
                            });
                        }}
                    />
                ) : null}
            </div>
        </div>
    );
});