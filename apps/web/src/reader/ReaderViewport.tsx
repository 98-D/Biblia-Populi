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
import type { Annotation, AnnotationSnapshot } from "@biblia/annotation";
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
const EMPTY_ANNOTATIONS: readonly Annotation[] = [];

type ScrollMode = "auto" | "smooth";

function chunkStart(ord: number): number {
    return Math.floor((ord - 1) / CHUNK) * CHUNK + 1;
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

function readMaybeString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function getRowTranslationId(row: SliceVerse): string | null {
    const record = row as unknown as Record<string, unknown>;
    return (
        readMaybeString(record.translationId) ??
        readMaybeString(record.translation_id) ??
        null
    );
}

export type ReaderViewportHandle = {
    jumpToOrd: (ord: number, behavior?: ScrollMode) => void;
    getCurrentOrd: () => number;
};

type Props = {
    spine: SpineStats;
    bookById: Map<string, BookRow>;
    topContent?: React.ReactNode;
    selectionRootRef?: React.MutableRefObject<HTMLDivElement | null> | null;
    annotationSnapshot?: AnnotationSnapshot | null;
    onPosition: (pos: ReaderPosition) => void;
    onError?: (msg: string) => void;
    onReady?: () => void;
};

type PendingJump = { ord: number; behavior: ScrollMode };
type BookGateState = { ord: number; bookId: string };

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
                WebkitBackdropFilter: "blur(10px)",
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

function buildAnnotationVerseIndex(
    snapshot: AnnotationSnapshot | null | undefined,
    minOrd: number,
    maxOrd: number,
): Map<number, readonly Annotation[]> {
    const buckets = new Map<number, Map<string, Annotation>>();

    if (!snapshot) return new Map();

    for (const annotation of snapshot.annotations.values()) {
        if (annotation.deletedAt !== null) continue;

        for (const span of annotation.spans) {
            if (span.deletedAt !== null) continue;

            const startOrd = clamp(span.start.verseOrd, minOrd, maxOrd);
            const endOrd = clamp(span.end.verseOrd, minOrd, maxOrd);

            for (let ord = startOrd; ord <= endOrd; ord += 1) {
                const bucket = buckets.get(ord) ?? new Map<string, Annotation>();
                bucket.set(annotation.annotationId, annotation);
                buckets.set(ord, bucket);
            }
        }
    }

    const out = new Map<number, readonly Annotation[]>();
    for (const [ord, bucket] of buckets) {
        out.set(
            ord,
            [...bucket.values()].sort((a, b) => {
                if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
                return a.annotationId.localeCompare(b.annotationId);
            }),
        );
    }

    return out;
}

export const ReaderViewport = forwardRef<ReaderViewportHandle, Props>(function ReaderViewport(props, ref) {
    const {
        spine,
        bookById,
        topContent,
        selectionRootRef,
        annotationSnapshot,
        onPosition,
        onError,
        onReady,
    } = props;

    const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

    const chunkRef = useRef<ChunkState>(createChunkState());
    const [dataTick, setDataTick] = useState(0);

    const measuredAtRef = useRef<WeakMap<Element, number>>(new WeakMap());
    const bumpTick = useCallback(() => setDataTick((t) => t + 1), []);

    const derivedCount = useMemo(() => {
        const min = spine.verseOrdMin;
        const max = spine.verseOrdMax;
        return max >= min ? max - min + 1 : 0;
    }, [spine.verseOrdMin, spine.verseOrdMax]);

    const count = useMemo(() => {
        const c = Number.isFinite(spine.verseCount) ? spine.verseCount : 0;
        if (c <= 0) return derivedCount;
        if (derivedCount > 0 && c !== derivedCount) return derivedCount;
        return c;
    }, [spine.verseCount, derivedCount]);

    const initialOrd = useMemo(
        () => clamp(spine.verseOrdMin, spine.verseOrdMin, spine.verseOrdMax),
        [spine.verseOrdMin, spine.verseOrdMax],
    );

    const [posOrd, setPosOrd] = useState<number>(initialOrd);
    const posOrdRef = useRef<number>(initialOrd);

    const pendingJumpRef = useRef<PendingJump | null>(null);
    const readyOnceRef = useRef(false);
    const runIdRef = useRef(0);

    const inFlightRef = useRef<Map<number, AbortController>>(new Map());
    const abortAllInFlight = useCallback(() => {
        for (const controller of inFlightRef.current.values()) controller.abort();
        inFlightRef.current.clear();
    }, []);

    const [gate, setGate] = useState<BookGateState | null>(null);
    const gateRef = useRef<BookGateState | null>(null);
    const lastGatedBookIdRef = useRef<string | null>(null);
    const gateCooldownRef = useRef<number>(0);

    const annotationIndex = useMemo(
        () => buildAnnotationVerseIndex(annotationSnapshot, spine.verseOrdMin, spine.verseOrdMax),
        [annotationSnapshot, spine.verseOrdMin, spine.verseOrdMax],
    );

    const loadedTranslationId = useMemo(() => {
        for (const row of chunkRef.current.verseMap.values()) {
            const translationId = getRowTranslationId(row);
            if (translationId) return translationId;
        }
        return null;
    }, [dataTick]);

    const setSelectionRootEl = useCallback(
        (el: HTMLDivElement | null) => {
            if (selectionRootRef) {
                selectionRootRef.current = el;
            }
        },
        [selectionRootRef],
    );

    useEffect(() => {
        posOrdRef.current = posOrd;
    }, [posOrd]);

    useEffect(() => {
        gateRef.current = gate;
    }, [gate]);

    const evictFarChunks = useCallback(
        (keepOrd: number): void => {
            const state = chunkRef.current;
            const keepChunk = chunkStart(clamp(keepOrd, spine.verseOrdMin, spine.verseOrdMax));
            const list = state.loadedOrder;

            while (list.length > MAX_CHUNKS_IN_MEMORY) {
                let farIdx = 0;
                let farDist = -1;

                for (let i = 0; i < list.length; i += 1) {
                    const c = list[i]!;
                    const d = Math.abs(c - keepChunk);
                    if (d > farDist) {
                        farDist = d;
                        farIdx = i;
                    }
                }

                const victim = list.splice(farIdx, 1)[0]!;
                state.loadedChunks.delete(victim);

                const startOrd = victim;
                const endOrd = Math.min(victim + CHUNK - 1, spine.verseOrdMax);
                for (let ord = startOrd; ord <= endOrd; ord += 1) {
                    state.verseMap.delete(ord);
                }
            }
        },
        [spine.verseOrdMin, spine.verseOrdMax],
    );

    const ensureChunk = useCallback(
        async (startOrd: number, keepOrd?: number): Promise<void> => {
            const s = clamp(startOrd, spine.verseOrdMin, spine.verseOrdMax);
            const chunk = chunkStart(s);

            const state = chunkRef.current;
            if (state.loadedChunks.has(chunk)) return;
            if (state.loadingChunks.has(chunk)) return;

            const myRunId = runIdRef.current;

            state.loadingChunks.add(chunk);

            const controller = new AbortController();
            inFlightRef.current.set(chunk, controller);

            try {
                const res = await apiGetSlice(chunk, CHUNK, { signal: controller.signal });
                if (runIdRef.current !== myRunId) return;
                if (controller.signal.aborted) return;

                for (const verse of res.verses) {
                    state.verseMap.set(verse.verseOrd, verse);
                }

                state.loadedChunks.add(chunk);
                state.loadedOrder.push(chunk);

                evictFarChunks(keepOrd ?? posOrdRef.current);
                bumpTick();
            } catch (e: unknown) {
                if (runIdRef.current !== myRunId) return;
                if (controller.signal.aborted) return;
                onError?.(e instanceof Error ? e.message : String(e));
            } finally {
                state.loadingChunks.delete(chunk);
                inFlightRef.current.delete(chunk);
            }
        },
        [bumpTick, evictFarChunks, onError, spine.verseOrdMin, spine.verseOrdMax],
    );

    useEffect(() => {
        abortAllInFlight();
        runIdRef.current += 1;

        chunkRef.current = createChunkState();
        measuredAtRef.current = new WeakMap();

        setPosOrd(initialOrd);
        posOrdRef.current = initialOrd;

        setGate(null);
        gateRef.current = null;
        lastGatedBookIdRef.current = null;
        gateCooldownRef.current = 0;

        pendingJumpRef.current = null;
        readyOnceRef.current = false;

        void ensureChunk(chunkStart(initialOrd), initialOrd);
        bumpTick();
    }, [initialOrd, ensureChunk, bumpTick, abortAllInFlight]);

    useEffect(() => {
        return () => abortAllInFlight();
    }, [abortAllInFlight]);

    useEffect(() => {
        if (!scrollEl) return;
        void ensureChunk(chunkStart(initialOrd), initialOrd);
    }, [scrollEl, ensureChunk, initialOrd]);

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

    const jumpToOrd = useCallback(
        (ord: number, behavior: ScrollMode = "auto") => {
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

        const pending = pendingJumpRef.current;
        if (pending) {
            pendingJumpRef.current = null;
            jumpToOrd(pending.ord, pending.behavior);
        }
    }, [scrollEl, jumpToOrd, onReady, ensureChunk, initialOrd]);

    useEffect(() => {
        if (!virtualItems.length) return;

        const firstOrd = spine.verseOrdMin + firstIndex;
        const lastOrd = spine.verseOrdMin + lastIndex;

        const start = chunkStart(firstOrd);
        const end = chunkStart(lastOrd);

        for (let c = start; c <= end; c += CHUNK) void ensureChunk(c, firstOrd);

        for (let k = 1; k <= PREFETCH_CHUNKS_AHEAD; k += 1) {
            const ahead = end + k * CHUNK;
            if (ahead <= spine.verseOrdMax) void ensureChunk(ahead, lastOrd);
        }

        for (let k = 1; k <= PREFETCH_CHUNKS_BEHIND; k += 1) {
            const behind = start - k * CHUNK;
            if (behind >= spine.verseOrdMin) void ensureChunk(behind, firstOrd);
        }
    }, [firstIndex, lastIndex, ensureChunk, spine.verseOrdMin, spine.verseOrdMax, virtualItems.length]);

    useEffect(() => {
        if (!scrollEl) return;

        const prevOverflowY = scrollEl.style.overflowY;
        const prevOverscroll = (scrollEl.style as CSSStyleDeclaration & { overscrollBehavior?: string }).overscrollBehavior;
        const prevScrollBehavior = scrollEl.style.scrollBehavior;

        if (gate) {
            scrollEl.style.overflowY = "hidden";
            (scrollEl.style as CSSStyleDeclaration & { overscrollBehavior?: string }).overscrollBehavior = "contain";
            scrollEl.style.scrollBehavior = "auto";
        } else {
            scrollEl.style.overflowY = prevOverflowY;
            (scrollEl.style as CSSStyleDeclaration & { overscrollBehavior?: string }).overscrollBehavior = prevOverscroll;
            scrollEl.style.scrollBehavior = prevScrollBehavior;
        }

        return () => {
            scrollEl.style.overflowY = prevOverflowY;
            (scrollEl.style as CSSStyleDeclaration & { overscrollBehavior?: string }).overscrollBehavior = prevOverscroll;
            scrollEl.style.scrollBehavior = prevScrollBehavior;
        };
    }, [scrollEl, gate]);

    const rafScrollRef = useRef<number>(0);

    const computeAndSetTopOrd = useCallback(() => {
        rafScrollRef.current = 0;
        if (!scrollEl || !virtualItems.length || gateRef.current) return;

        const scrollTop = scrollEl.scrollTop;

        let topItem = virtualItems[0]!;
        for (let i = 0; i < virtualItems.length; i += 1) {
            const item = virtualItems[i]!;
            if (item.start + item.size > scrollTop + 1) {
                topItem = item;
                break;
            }
        }

        const ord = spine.verseOrdMin + topItem.index;
        if (posOrdRef.current !== ord) {
            posOrdRef.current = ord;
            setPosOrd(ord);
        }

        void ensureChunk(chunkStart(ord), ord);
    }, [ensureChunk, scrollEl, spine.verseOrdMin, virtualItems]);

    useLayoutEffect(() => {
        if (!scrollEl || !virtualItems.length || gateRef.current) return;
        computeAndSetTopOrd();
    }, [scrollEl, virtualItems.length, firstIndex, lastIndex, computeAndSetTopOrd]);

    useEffect(() => {
        if (!scrollEl) return;

        const onScroll = () => {
            if (rafScrollRef.current) return;
            rafScrollRef.current = window.requestAnimationFrame(computeAndSetTopOrd);
        };

        scrollEl.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            scrollEl.removeEventListener("scroll", onScroll);
            if (rafScrollRef.current) {
                cancelAnimationFrame(rafScrollRef.current);
                rafScrollRef.current = 0;
            }
        };
    }, [scrollEl, computeAndSetTopOrd]);

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

    useEffect(() => {
        if (!scrollEl || gateRef.current) return;

        if (gateCooldownRef.current > 0) {
            gateCooldownRef.current -= 1;
            return;
        }

        const ord = posOrdRef.current;
        const cur = chunkRef.current.verseMap.get(ord) ?? null;
        if (!cur) return;

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

            const annotations = annotationIndex.get(verseOrd) ?? EMPTY_ANNOTATIONS;

            return (
                <VerseRow
                    row={row}
                    book={bookById.get(row.bookId) ?? null}
                    annotations={annotations}
                />
            );
        },
        [annotationIndex, bookById],
    );

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
            <div ref={setScrollEl} style={sx.scroll}>
                <div
                    ref={setSelectionRootEl}
                    className="container"
                    style={sx.container}
                    data-translation-id={loadedTranslationId ?? undefined}
                >
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

                {gate ? (
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
                ) : null}
            </div>
        </div>
    );
});