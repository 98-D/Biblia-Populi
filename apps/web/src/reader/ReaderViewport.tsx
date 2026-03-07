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
import type { Annotation, AnnotationSnapshot } from "@biblia/annotation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { apiGetSlice, type BookRow } from "../api";
import { BookTitlePage } from "./BookTitlePage";
import { sx } from "./sx";
import type { ReaderPosition, SliceVerse, SpineStats } from "./types";
import { VerseRow } from "./VerseRow";

const CHUNK = 240;
const PREFETCH_CHUNKS_AHEAD = 2;
const PREFETCH_CHUNKS_BEHIND = 1;
const MAX_CHUNKS_IN_MEMORY = 10;
const EST_ROW_PX = 56;
const GATE_COOLDOWN_TICKS = 8;

const EMPTY_ANNOTATIONS: readonly Annotation[] = [];
const GATE_BLOCK_KEYS = new Set([
    " ",
    "PageDown",
    "PageUp",
    "ArrowDown",
    "ArrowUp",
    "Home",
    "End",
]);

type ScrollMode = "auto" | "smooth";

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

function chunkStart(ord: number): number {
    return Math.floor((ord - 1) / CHUNK) * CHUNK + 1;
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

function normalizeSpanBounds(
     startOrd: number,
     endOrd: number,
     minOrd: number,
     maxOrd: number,
): { startOrd: number; endOrd: number } | null {
    const a = clamp(startOrd, minOrd, maxOrd);
    const b = clamp(endOrd, minOrd, maxOrd);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (hi < minOrd || lo > maxOrd) return null;
    return { startOrd: lo, endOrd: hi };
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

type PendingJump = {
    ord: number;
    behavior: ScrollMode;
};

type BookGateState = {
    ord: number;
    bookId: string;
};

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

            const bounds = normalizeSpanBounds(
                 span.start.verseOrd,
                 span.end.verseOrd,
                 minOrd,
                 maxOrd,
            );
            if (!bounds) continue;

            for (let ord = bounds.startOrd; ord <= bounds.endOrd; ord += 1) {
                let bucket = buckets.get(ord);
                if (!bucket) {
                    bucket = new Map<string, Annotation>();
                    buckets.set(ord, bucket);
                }
                bucket.set(annotation.annotationId, annotation);
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
                  padding: 18,
                  background: "color-mix(in oklab, var(--bg) 72%, rgba(0,0,0,0.55))",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
              }}
              onKeyDown={(e) => {
                  if (GATE_BLOCK_KEYS.has(e.key)) {
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
                              appearance: "none",
                              WebkitAppearance: "none",
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

export const ReaderViewport = forwardRef<ReaderViewportHandle, Props>(
     function ReaderViewport(props, ref) {
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
         const [dataTick, setDataTick] = useState(0);
         const [gate, setGate] = useState<BookGateState | null>(null);

         const chunkRef = useRef<ChunkState>(createChunkState());
         const measuredAtRef = useRef<WeakMap<Element, number>>(new WeakMap());

         const posOrdRef = useRef<number>(spine.verseOrdMin);
         const [posOrd, setPosOrd] = useState<number>(spine.verseOrdMin);

         const pendingJumpRef = useRef<PendingJump | null>(null);
         const readyOnceRef = useRef(false);
         const runIdRef = useRef(0);

         const inFlightRef = useRef<Map<number, AbortController>>(new Map());

         const gateRef = useRef<BookGateState | null>(null);
         const lastGatedBookIdRef = useRef<string | null>(null);
         const gateCooldownRef = useRef(0);

         const rafScrollRef = useRef(0);
         const lastSentRef = useRef<{ ord: number; hasVerse: boolean }>({
             ord: -1,
             hasVerse: false,
         });

         const bumpTick = useCallback(() => {
             setDataTick((t) => t + 1);
         }, []);

         const derivedCount = useMemo(() => {
             const min = spine.verseOrdMin;
             const max = spine.verseOrdMax;
             return max >= min ? max - min + 1 : 0;
         }, [spine.verseOrdMin, spine.verseOrdMax]);

         const count = useMemo(() => {
             const verseCount = Number.isFinite(spine.verseCount) ? spine.verseCount : 0;
             if (verseCount <= 0) return derivedCount;
             if (derivedCount > 0 && verseCount !== derivedCount) return derivedCount;
             return verseCount;
         }, [spine.verseCount, derivedCount]);

         const initialOrd = useMemo(() => {
             return clamp(spine.verseOrdMin, spine.verseOrdMin, spine.verseOrdMax);
         }, [spine.verseOrdMin, spine.verseOrdMax]);

         const annotationIndex = useMemo(() => {
             return buildAnnotationVerseIndex(
                  annotationSnapshot,
                  spine.verseOrdMin,
                  spine.verseOrdMax,
             );
         }, [annotationSnapshot, spine.verseOrdMin, spine.verseOrdMax]);

         const loadedTranslationId = useMemo(() => {
             for (const row of chunkRef.current.verseMap.values()) {
                 const translationId = getRowTranslationId(row);
                 if (translationId) return translationId;
             }
             return null;
         }, [dataTick]);

         const setSelectionRootEl = useCallback(
              (el: HTMLDivElement | null) => {
                  if (selectionRootRef) selectionRootRef.current = el;
              },
              [selectionRootRef],
         );

         const abortAllInFlight = useCallback(() => {
             for (const controller of inFlightRef.current.values()) {
                 controller.abort();
             }
             inFlightRef.current.clear();
         }, []);

         useEffect(() => {
             posOrdRef.current = posOrd;
         }, [posOrd]);

         useEffect(() => {
             gateRef.current = gate;
         }, [gate]);

         const evictFarChunks = useCallback(
              (keepOrd: number): void => {
                  const state = chunkRef.current;
                  const keepChunk = chunkStart(
                       clamp(keepOrd, spine.verseOrdMin, spine.verseOrdMax),
                  );

                  while (state.loadedOrder.length > MAX_CHUNKS_IN_MEMORY) {
                      let farIdx = 0;
                      let farDist = -1;

                      for (let i = 0; i < state.loadedOrder.length; i += 1) {
                          const chunk = state.loadedOrder[i]!;
                          const dist = Math.abs(chunk - keepChunk);
                          if (dist > farDist) {
                              farDist = dist;
                              farIdx = i;
                          }
                      }

                      const victim = state.loadedOrder.splice(farIdx, 1)[0]!;
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
                  const safeOrd = clamp(startOrd, spine.verseOrdMin, spine.verseOrdMax);
                  const chunk = chunkStart(safeOrd);

                  const state = chunkRef.current;
                  if (state.loadedChunks.has(chunk)) return;
                  if (state.loadingChunks.has(chunk)) return;

                  const myRunId = runIdRef.current;
                  state.loadingChunks.add(chunk);

                  const controller = new AbortController();
                  inFlightRef.current.set(chunk, controller);

                  try {
                      const res = await apiGetSlice(chunk, CHUNK, {
                          signal: controller.signal,
                      });

                      if (runIdRef.current !== myRunId) return;
                      if (controller.signal.aborted) return;

                      for (const verse of res.verses) {
                          state.verseMap.set(verse.verseOrd, verse);
                      }

                      state.loadedChunks.add(chunk);
                      state.loadedOrder.push(chunk);

                      evictFarChunks(keepOrd ?? posOrdRef.current);
                      bumpTick();
                  } catch (error: unknown) {
                      if (runIdRef.current !== myRunId) return;
                      if (controller.signal.aborted) return;
                      onError?.(error instanceof Error ? error.message : String(error));
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
             lastSentRef.current = { ord: -1, hasVerse: false };

             void ensureChunk(chunkStart(initialOrd), initialOrd);
             bumpTick();
         }, [abortAllInFlight, bumpTick, ensureChunk, initialOrd]);

         useEffect(() => {
             return () => {
                 abortAllInFlight();
                 if (rafScrollRef.current) {
                     cancelAnimationFrame(rafScrollRef.current);
                     rafScrollRef.current = 0;
                 }
             };
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
         const lastIndex = virtualItems.length
              ? virtualItems[virtualItems.length - 1]!.index
              : 0;

         const jumpToOrd = useCallback(
              (ord: number, behavior: ScrollMode = "auto") => {
                  const targetOrd = clamp(ord, spine.verseOrdMin, spine.verseOrdMax);
                  const targetIndex = targetOrd - spine.verseOrdMin;

                  void ensureChunk(chunkStart(targetOrd), targetOrd);

                  if (!scrollEl) {
                      pendingJumpRef.current = { ord: targetOrd, behavior };
                      return;
                  }

                  requestAnimationFrame(() => {
                      rowVirtualizer.scrollToIndex(targetIndex, {
                          align: "start",
                          behavior,
                      });
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
         }, [scrollEl, ensureChunk, initialOrd, jumpToOrd, onReady]);

         useEffect(() => {
             if (!virtualItems.length) return;

             const firstOrd = spine.verseOrdMin + firstIndex;
             const lastOrd = spine.verseOrdMin + lastIndex;

             const startChunk = chunkStart(firstOrd);
             const endChunk = chunkStart(lastOrd);

             for (let chunk = startChunk; chunk <= endChunk; chunk += CHUNK) {
                 void ensureChunk(chunk, firstOrd);
             }

             for (let i = 1; i <= PREFETCH_CHUNKS_AHEAD; i += 1) {
                 const ahead = endChunk + i * CHUNK;
                 if (ahead <= spine.verseOrdMax) {
                     void ensureChunk(ahead, lastOrd);
                 }
             }

             for (let i = 1; i <= PREFETCH_CHUNKS_BEHIND; i += 1) {
                 const behind = startChunk - i * CHUNK;
                 if (behind >= spine.verseOrdMin) {
                     void ensureChunk(behind, firstOrd);
                 }
             }
         }, [
             ensureChunk,
             firstIndex,
             lastIndex,
             spine.verseOrdMax,
             spine.verseOrdMin,
             virtualItems.length,
         ]);

         useEffect(() => {
             if (!scrollEl) return;

             const prevOverflowY = scrollEl.style.overflowY;
             const prevOverscrollBehavior = scrollEl.style.overscrollBehavior;
             const prevScrollBehavior = scrollEl.style.scrollBehavior;

             if (gate) {
                 scrollEl.style.overflowY = "hidden";
                 scrollEl.style.overscrollBehavior = "contain";
                 scrollEl.style.scrollBehavior = "auto";
             } else {
                 scrollEl.style.overflowY = prevOverflowY;
                 scrollEl.style.overscrollBehavior = prevOverscrollBehavior;
                 scrollEl.style.scrollBehavior = prevScrollBehavior;
             }

             return () => {
                 scrollEl.style.overflowY = prevOverflowY;
                 scrollEl.style.overscrollBehavior = prevOverscrollBehavior;
                 scrollEl.style.scrollBehavior = prevScrollBehavior;
             };
         }, [gate, scrollEl]);

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
         }, [
             computeAndSetTopOrd,
             firstIndex,
             lastIndex,
             scrollEl,
             virtualItems.length,
         ]);

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
         }, [computeAndSetTopOrd, scrollEl]);

         useEffect(() => {
             const effectiveOrd = posOrdRef.current ?? initialOrd;
             const verse = chunkRef.current.verseMap.get(effectiveOrd) ?? null;
             const book = verse ? bookById.get(verse.bookId) ?? null : null;

             const next = { ord: effectiveOrd, hasVerse: verse !== null };
             const prev = lastSentRef.current;
             if (prev.ord === next.ord && prev.hasVerse === next.hasVerse) return;

             lastSentRef.current = next;
             onPosition({ ord: effectiveOrd, verse, book });
         }, [bookById, dataTick, initialOrd, onPosition, posOrd]);

         useEffect(() => {
             if (!scrollEl || gateRef.current) return;

             if (gateCooldownRef.current > 0) {
                 gateCooldownRef.current -= 1;
                 return;
             }

             const ord = posOrdRef.current;
             const current = chunkRef.current.verseMap.get(ord) ?? null;
             if (!current) return;
             if (ord === spine.verseOrdMin) return;

             const previous = chunkRef.current.verseMap.get(ord - 1) ?? null;
             if (!previous) return;
             if (previous.bookId === current.bookId) return;

             const bookId = current.bookId;
             if (lastGatedBookIdRef.current === bookId) return;

             lastGatedBookIdRef.current = bookId;
             const index = ord - spine.verseOrdMin;

             requestAnimationFrame(() => {
                 rowVirtualizer.scrollToIndex(index, {
                     align: "start",
                     behavior: "auto",
                 });

                 requestAnimationFrame(() => {
                     setGate({ ord, bookId });
                 });
             });
         }, [dataTick, posOrd, rowVirtualizer, scrollEl, spine.verseOrdMin]);

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

                  const mark = measuredAtRef.current;
                  const lastMeasuredAt = mark.get(el);
                  if (lastMeasuredAt === dataTick) return;

                  mark.set(el, dataTick);
                  rowVirtualizer.measureElement(el);
              },
              [dataTick, rowVirtualizer],
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
                                   position: "relative",
                                   height: totalSize,
                                   contain: "layout paint",
                               }}
                          >
                              {virtualItems.map((item) => {
                                  const verseOrd = spine.verseOrdMin + item.index;

                                  return (
                                       <div
                                            key={item.key}
                                            ref={measureRowEl}
                                            data-index={item.index}
                                            style={{
                                                position: "absolute",
                                                top: 0,
                                                left: 0,
                                                width: "100%",
                                                transform: `translate3d(0, ${item.start}px, 0)`,
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
                                    gateCooldownRef.current = GATE_COOLDOWN_TICKS;

                                    requestAnimationFrame(() => {
                                        const index = ord - spine.verseOrdMin;
                                        rowVirtualizer.scrollToIndex(index, {
                                            align: "start",
                                            behavior: "auto",
                                        });
                                    });
                                }}
                           />
                      ) : null}
                  </div>
              </div>
         );
     },
);