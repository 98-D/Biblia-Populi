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

export const ReaderViewport = forwardRef<ReaderViewportHandle, Props>(function ReaderViewport(props, ref) {
    const { spine, bookById, topContent, onPosition, onError, onReady } = props;

    const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

    const verseMapRef = useRef<Map<number, SliceVerse>>(new Map());
    const loadedChunksRef = useRef<Set<number>>(new Set());
    const loadingChunksRef = useRef<Set<number>>(new Set());
    const loadedChunkListRef = useRef<number[]>([]);

    const [dataTick, setDataTick] = useState(0);
    const [posOrd, setPosOrd] = useState<number>(spine.verseOrdMin);
    const posOrdRef = useRef(posOrd);

    const pendingJumpRef = useRef<{ ord: number; behavior: "auto" | "smooth" } | null>(null);
    const readyOnceRef = useRef(false);

    useEffect(() => {
        posOrdRef.current = posOrd;
    }, [posOrd]);

    // reset if spine changes
    useEffect(() => {
        verseMapRef.current.clear();
        loadedChunksRef.current.clear();
        loadingChunksRef.current.clear();
        loadedChunkListRef.current = [];
        setDataTick((t) => t + 1);
        setPosOrd(spine.verseOrdMin);
        posOrdRef.current = spine.verseOrdMin;
    }, [spine.verseOrdMin, spine.verseOrdMax, spine.verseCount]);

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

            loadingChunksRef.current.add(chunk);
            try {
                const res = await apiGetSlice(chunk, CHUNK);
                for (const v of res.verses) verseMapRef.current.set(v.verseOrd, v);

                loadedChunksRef.current.add(chunk);
                loadedChunkListRef.current.push(chunk);

                // Use latest position (avoid async-stale eviction)
                evictFarChunks(keepOrd ?? posOrdRef.current);
                setDataTick((t) => t + 1);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                onError?.(msg);
            } finally {
                loadingChunksRef.current.delete(chunk);
            }
        },
        [evictFarChunks, onError, spine.verseOrdMin, spine.verseOrdMax],
    );

    const count = spine.verseCount;

    const rowVirtualizer = useVirtualizer({
        count,
        getScrollElement: () => scrollEl,
        estimateSize: () => EST_ROW_PX,
        overscan: 18,
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

    useImperativeHandle(ref, () => ({
        jumpToOrd,
        getCurrentOrd: () => posOrdRef.current,
    }));

    // Ready + pending jump
    useEffect(() => {
        if (!scrollEl) return;

        if (!readyOnceRef.current) {
            readyOnceRef.current = true;
            onReady?.();
        }

        const p = pendingJumpRef.current;
        if (!p) return;
        pendingJumpRef.current = null;
        jumpToOrd(p.ord, p.behavior);
    }, [scrollEl, jumpToOrd, onReady]);

    // Prefetch visible (+ ahead/behind)
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

    // Current position = topmost visible row
    useLayoutEffect(() => {
        if (!scrollEl) return;
        if (!virtualItems.length) return;

        const st = scrollEl.scrollTop;
        const topItem = virtualItems.find((it) => it.start + it.size > st + 1) ?? virtualItems[0]!;
        const ord = spine.verseOrdMin + topItem.index;

        if (posOrdRef.current !== ord) {
            posOrdRef.current = ord;
            setPosOrd(ord);
        }

        void ensureChunk(chunkStart(ord), ord);
    }, [scrollEl, virtualItems, dataTick, ensureChunk, spine.verseOrdMin]);

    // Emit position (also re-emit once verse loads so header label becomes real)
    const lastSentRef = useRef<{ ord: number; hasVerse: boolean }>({ ord: -1, hasVerse: false });
    useEffect(() => {
        const verse = verseMapRef.current.get(posOrd) ?? null;
        const book = verse ? bookById.get(verse.bookId) ?? null : null;

        const next = { ord: posOrd, hasVerse: !!verse };
        const prev = lastSentRef.current;

        if (prev.ord === next.ord && prev.hasVerse === next.hasVerse) return;
        lastSentRef.current = next;

        onPosition({ ord: posOrd, verse, book });
    }, [posOrd, dataTick, bookById, onPosition]);

    const totalSize = rowVirtualizer.getTotalSize();

    return (
        <div style={sx.body}>
            <div ref={setScrollEl} style={sx.scroll}>
                <div className="container" style={sx.container}>
                    {topContent}
                    <div style={{ height: totalSize, position: "relative" }}>
                        {virtualItems.map((v) => {
                            const verseOrd = spine.verseOrdMin + v.index;
                            const row = verseMapRef.current.get(verseOrd) ?? null;

                            return (
                                <div
                                    key={verseOrd}
                                    ref={(el) => {
                                        if (!el) return;
                                        // Measure skeleton + real rows so estimates converge quickly & stay stable.
                                        rowVirtualizer.measureElement(el);
                                    }}
                                    data-index={v.index}
                                    style={{
                                        position: "absolute",
                                        top: 0,
                                        left: 0,
                                        width: "100%",
                                        transform: `translate3d(0, ${v.start}px, 0)`,
                                    }}
                                >
                                    {!row ? (
                                        <div style={sx.skelRow}>
                                            <div style={sx.verseNum}>…</div>
                                            <div style={sx.skelText} />
                                        </div>
                                    ) : (
                                        <VerseRow row={row} book={bookById.get(row.bookId) ?? null} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
});