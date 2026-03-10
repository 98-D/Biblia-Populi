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

const CHUNK = 240;
const PREFETCH_CHUNKS_AHEAD = 4;
const PREFETCH_CHUNKS_BEHIND = 2;
const MAX_CHUNKS_IN_MEMORY = 18;
const EST_ROW_PX = 64;
const OVERSCAN = 10;

type ScrollMode = "auto" | "smooth";

export type ReaderViewportHandle = {
     jumpToOrd: (ord: number, behavior?: ScrollMode) => void;
     getCurrentOrd: () => number;
};

type Props = Readonly<{
     spine: SpineStats;
     bookById: Map<string, BookRow>;
     selectionRootRef?: React.MutableRefObject<HTMLDivElement | null> | null;
     annotationSnapshot?: AnnotationSnapshot | null;
     topContent?: React.ReactNode;
     onPosition: (pos: ReaderPosition) => void;
     onError?: (msg: string) => void;
     onReady?: () => void;
}>;

type PendingJump = Readonly<{
     ord: number;
     behavior: ScrollMode;
}>;

type SlicePayload =
    | readonly SliceVerse[]
    | Readonly<{ verses?: readonly SliceVerse[]; rows?: readonly SliceVerse[]; items?: readonly SliceVerse[] }>
    | null
    | undefined;

const EMPTY_ANNOTATIONS: readonly Annotation[] = Object.freeze([]);

const ROOT_STYLE: React.CSSProperties = Object.freeze({
     position: "relative",
     minHeight: 0,
     flex: "1 1 auto",
});

const SCROLL_STYLE: React.CSSProperties = Object.freeze({
     position: "absolute",
     inset: 0,
     overflowY: "auto",
     overflowX: "hidden",
     WebkitOverflowScrolling: "touch",
     overscrollBehaviorY: "contain",
     minHeight: 0,
});

const CONTAINER_STYLE: React.CSSProperties = Object.freeze({
     width: "100%",
     minWidth: 0,
     maxWidth: "var(--bpReaderMeasure, 840px)",
     marginInline: "auto",
     paddingInline: 18,
     boxSizing: "border-box",
});

const VIRTUAL_STAGE_STYLE: React.CSSProperties = Object.freeze({
     position: "relative",
     width: "100%",
     contain: "layout paint size",
});

const SKELETON_ROW_STYLE: React.CSSProperties = Object.freeze({
     position: "relative",
     minHeight: 54,
     padding: "14px 16px 14px 44px",
     borderRadius: 16,
     boxSizing: "border-box",
});

const SKELETON_NUM_STYLE: React.CSSProperties = Object.freeze({
     position: "absolute",
     left: 12,
     top: 14,
     fontSize: 12,
     color: "var(--muted)",
     userSelect: "none",
});

const SKELETON_TEXT_STYLE: React.CSSProperties = Object.freeze({
     height: 14,
     width: "78%",
     borderRadius: 999,
     background: "color-mix(in oklab, var(--hairline) 60%, transparent)",
});

function clamp(n: number, lo: number, hi: number): number {
     return Math.max(lo, Math.min(hi, n));
}

function chunkStart(ord: number): number {
     return Math.floor((ord - 1) / CHUNK) * CHUNK + 1;
}

function chunkIndexFromOrd(ord: number): number {
     return Math.floor((ord - 1) / CHUNK);
}

function chunkOrdFromIndex(index: number): number {
     return index * CHUNK + 1;
}

function deriveRowCount(spine: SpineStats): number {
     return Math.max(0, spine.verseOrdMax - spine.verseOrdMin + 1);
}

function readMaybeNumber(value: unknown): number | null {
     if (typeof value !== "number" || !Number.isFinite(value)) return null;
     return Math.trunc(value);
}

function readMaybeString(value: unknown): string | null {
     if (typeof value !== "string") return null;
     const trimmed = value.trim();
     return trimmed.length > 0 ? trimmed : null;
}

function getRowBookId(row: SliceVerse): string {
     const record = row as unknown as Record<string, unknown>;
     return readMaybeString(record.bookId) ?? readMaybeString(record.book_id) ?? row.bookId;
}

function getRowVerseOrd(row: SliceVerse): number {
     const record = row as unknown as Record<string, unknown>;
     return (
         readMaybeNumber(record.verseOrd) ??
         readMaybeNumber(record.verse_ord) ??
         0
     );
}

function extractSliceRows(payload: SlicePayload): readonly SliceVerse[] {
     if (!payload) return [];
     if (Array.isArray(payload)) return payload;

     if ("verses" in payload && Array.isArray(payload.verses)) return payload.verses;
     if ("rows" in payload && Array.isArray(payload.rows)) return payload.rows;
     if ("items" in payload && Array.isArray(payload.items)) return payload.items;

     return [];
}

function normalizeSpanRange(span: unknown): { startOrd: number; endOrd: number } | null {
     if (!span || typeof span !== "object") return null;

     const record = span as Record<string, unknown>;
     const start =
         (record.start as Record<string, unknown> | undefined) ??
         undefined;
     const end =
         (record.end as Record<string, unknown> | undefined) ??
         undefined;

     const startOrd =
         readMaybeNumber(start?.verseOrd) ??
         readMaybeNumber((start as Record<string, unknown> | undefined)?.verse_ord);

     const endOrd =
         readMaybeNumber(end?.verseOrd) ??
         readMaybeNumber((end as Record<string, unknown> | undefined)?.verse_ord);

     if (startOrd == null || endOrd == null) return null;

     return {
          startOrd: Math.min(startOrd, endOrd),
          endOrd: Math.max(startOrd, endOrd),
     };
}

function buildAnnotationIndex(
    snapshot: AnnotationSnapshot | null | undefined,
    minOrd: number,
    maxOrd: number,
): ReadonlyMap<number, readonly Annotation[]> {
     if (!snapshot) return new Map();

     const buckets = new Map<number, Annotation[]>();
     const values = [...snapshot.annotations.values()] as Annotation[];

     values.sort((a, b) => b.updatedAt - a.updatedAt);

     for (const annotation of values) {
          if (annotation.deletedAt !== null) continue;

          for (const span of annotation.spans) {
               const range = normalizeSpanRange(span);
               if (!range) continue;

               const startOrd = clamp(range.startOrd, minOrd, maxOrd);
               const endOrd = clamp(range.endOrd, minOrd, maxOrd);

               for (let ord = startOrd; ord <= endOrd; ord += 1) {
                    const bucket = buckets.get(ord);
                    if (bucket) {
                         bucket.push(annotation);
                    } else {
                         buckets.set(ord, [annotation]);
                    }
               }
          }
     }

     return buckets;
}

function skeletonRow(verseOrd: number): React.ReactNode {
     return (
         <div style={SKELETON_ROW_STYLE} aria-hidden="true">
              <div style={SKELETON_NUM_STYLE}>…</div>
              <div style={SKELETON_TEXT_STYLE} />
         </div>
     );
}

export const ReaderViewport = forwardRef<ReaderViewportHandle, Props>(function ReaderViewport(
    props,
    ref,
) {
     const {
          spine,
          bookById,
          selectionRootRef,
          annotationSnapshot,
          topContent,
          onPosition,
          onError,
          onReady,
     } = props;

     const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
     const [dataTick, setDataTick] = useState(0);

     const verseMapRef = useRef<Map<number, SliceVerse>>(new Map());
     const loadedChunksRef = useRef<Set<number>>(new Set());
     const loadedOrderRef = useRef<number[]>([]);
     const inFlightRef = useRef<Map<number, AbortController>>(new Map());

     const pendingJumpRef = useRef<PendingJump | null>(null);
     const currentOrdRef = useRef<number>(spine.verseOrdMin);
     const onReadyCalledRef = useRef(false);
     const rafMeasureRef = useRef<number | null>(null);

     const rowCount = useMemo(() => deriveRowCount(spine), [spine]);
     const lastOrd = spine.verseOrdMin + Math.max(0, rowCount - 1);

     const annotationIndex = useMemo(
         () => buildAnnotationIndex(annotationSnapshot, spine.verseOrdMin, spine.verseOrdMax),
         [annotationSnapshot, spine.verseOrdMin, spine.verseOrdMax],
     );

     const rowVirtualizer = useVirtualizer({
          count: rowCount,
          getScrollElement: () => scrollEl,
          estimateSize: () => EST_ROW_PX,
          overscan: OVERSCAN,
          measureElement: (el) => el.getBoundingClientRect().height,
          getItemKey: (index) => spine.verseOrdMin + index,
     });

     const virtualItems = rowVirtualizer.getVirtualItems();
     const totalSize = rowVirtualizer.getTotalSize();

     const firstVisibleIndex = virtualItems[0]?.index ?? 0;
     const lastVisibleIndex = virtualItems[virtualItems.length - 1]?.index ?? 0;

     const setSelectionRootEl = useCallback(
         (el: HTMLDivElement | null) => {
              if (selectionRootRef) {
                   selectionRootRef.current = el;
              }
         },
         [selectionRootRef],
     );

     const cancelAllInFlight = useCallback(() => {
          for (const controller of inFlightRef.current.values()) {
               controller.abort();
          }
          inFlightRef.current.clear();
     }, []);

     const evictFarChunks = useCallback(
         (keepOrd: number) => {
              const keepIndex = chunkIndexFromOrd(clamp(keepOrd, spine.verseOrdMin, spine.verseOrdMax));
              const keepMin = Math.max(0, keepIndex - 3);
              const keepMax = keepIndex + 3;

              const order = loadedOrderRef.current;
              if (order.length <= MAX_CHUNKS_IN_MEMORY) return;

              let scan = 0;
              while (order.length > MAX_CHUNKS_IN_MEMORY && scan < 64) {
                   scan += 1;

                   let evictAt = -1;
                   let farthestDistance = -1;

                   for (let i = 0; i < order.length; i += 1) {
                        const chunk = order[i]!;
                        const idx = chunkIndexFromOrd(chunk);

                        if (idx >= keepMin && idx <= keepMax) {
                             continue;
                        }

                        const distance = Math.abs(idx - keepIndex);
                        if (distance > farthestDistance) {
                             farthestDistance = distance;
                             evictAt = i;
                        }
                   }

                   if (evictAt < 0) break;

                   const [evictedChunk] = order.splice(evictAt, 1);
                   if (evictedChunk == null) break;

                   loadedChunksRef.current.delete(evictedChunk);

                   const start = evictedChunk;
                   const end = Math.min(evictedChunk + CHUNK - 1, spine.verseOrdMax);
                   for (let ord = start; ord <= end; ord += 1) {
                        verseMapRef.current.delete(ord);
                   }
              }
         },
         [spine.verseOrdMax, spine.verseOrdMin],
     );

     const applyChunk = useCallback(
         (chunkOrd: number, rows: readonly SliceVerse[]) => {
              let changed = false;

              for (const row of rows) {
                   const ord = getRowVerseOrd(row);
                   if (ord < spine.verseOrdMin || ord > spine.verseOrdMax) continue;

                   verseMapRef.current.set(ord, row);
                   changed = true;
              }

              if (!loadedChunksRef.current.has(chunkOrd)) {
                   loadedChunksRef.current.add(chunkOrd);
                   loadedOrderRef.current.push(chunkOrd);
                   changed = true;
              }

              if (changed) {
                   evictFarChunks(currentOrdRef.current);
                   setDataTick((tick) => tick + 1);
              }
         },
         [evictFarChunks, spine.verseOrdMax, spine.verseOrdMin],
     );

     const loadChunk = useCallback(
         async (ord: number) => {
              const startOrd = chunkStart(clamp(ord, spine.verseOrdMin, spine.verseOrdMax));

              if (loadedChunksRef.current.has(startOrd)) return;
              if (inFlightRef.current.has(startOrd)) return;

              const controller = new AbortController();
              inFlightRef.current.set(startOrd, controller);

              try {
                   const payload = (await apiGetSlice(startOrd, CHUNK, {
                        signal: controller.signal,
                   } as never)) as SlicePayload;

                   if (controller.signal.aborted) return;

                   const rows = extractSliceRows(payload);
                   applyChunk(startOrd, rows);
              } catch (error) {
                   if (!controller.signal.aborted) {
                        const message =
                            error instanceof Error
                                ? error.message
                                : "Failed to load reader slice.";
                        onError?.(message);
                   }
              } finally {
                   const active = inFlightRef.current.get(startOrd);
                   if (active === controller) {
                        inFlightRef.current.delete(startOrd);
                   }
              }
         },
         [applyChunk, onError, spine.verseOrdMax, spine.verseOrdMin],
     );

     const ensureWindowLoaded = useCallback(
         (centerOrd: number) => {
              const centerChunkIndex = chunkIndexFromOrd(centerOrd);
              const startChunkIndex = Math.max(0, centerChunkIndex - PREFETCH_CHUNKS_BEHIND);
              const endChunkIndex = centerChunkIndex + PREFETCH_CHUNKS_AHEAD;

              for (let chunkIdx = startChunkIndex; chunkIdx <= endChunkIndex; chunkIdx += 1) {
                   const chunkOrd = chunkOrdFromIndex(chunkIdx);
                   if (chunkOrd > spine.verseOrdMax) break;
                   void loadChunk(chunkOrd);
              }
         },
         [loadChunk, spine.verseOrdMax],
     );

     useEffect(() => {
          verseMapRef.current.clear();
          loadedChunksRef.current.clear();
          loadedOrderRef.current = [];
          cancelAllInFlight();

          const firstOrd = clamp(spine.verseOrdMin, spine.verseOrdMin, spine.verseOrdMax);
          currentOrdRef.current = firstOrd;
          pendingJumpRef.current = {
               ord: firstOrd,
               behavior: "auto",
          };
          onReadyCalledRef.current = false;

          setDataTick((tick) => tick + 1);
     }, [cancelAllInFlight, spine.verseOrdMax, spine.verseOrdMin]);

     useEffect(() => {
          ensureWindowLoaded(currentOrdRef.current);
     }, [ensureWindowLoaded]);

     useEffect(() => {
          const centerIndex = Math.floor((firstVisibleIndex + lastVisibleIndex) / 2);
          const centerOrd = clamp(spine.verseOrdMin + centerIndex, spine.verseOrdMin, spine.verseOrdMax);
          ensureWindowLoaded(centerOrd);
          evictFarChunks(centerOrd);
     }, [
          ensureWindowLoaded,
          evictFarChunks,
          firstVisibleIndex,
          lastVisibleIndex,
          spine.verseOrdMax,
          spine.verseOrdMin,
     ]);

     useLayoutEffect(() => {
          if (virtualItems.length === 0) return;

          const first = virtualItems[0]!;
          const ord = clamp(spine.verseOrdMin + first.index, spine.verseOrdMin, spine.verseOrdMax);
          const row = verseMapRef.current.get(ord) ?? null;

          currentOrdRef.current = ord;

          onPosition({
               ord,
               verse: row,
               book: row ? (bookById.get(getRowBookId(row)) ?? null) : null,
          });
     }, [bookById, onPosition, spine.verseOrdMax, spine.verseOrdMin, virtualItems]);

     useImperativeHandle(
         ref,
         () => ({
              jumpToOrd: (ord, behavior = "auto") => {
                   const nextOrd = clamp(Math.trunc(ord), spine.verseOrdMin, spine.verseOrdMax);
                   pendingJumpRef.current = { ord: nextOrd, behavior };
                   ensureWindowLoaded(nextOrd);
                   setDataTick((tick) => tick + 1);
              },
              getCurrentOrd: () => currentOrdRef.current,
         }),
         [ensureWindowLoaded, spine.verseOrdMax, spine.verseOrdMin],
     );

     useEffect(() => {
          const pending = pendingJumpRef.current;
          if (!pending) return;

          const index = clamp(pending.ord - spine.verseOrdMin, 0, Math.max(0, rowCount - 1));
          rowVirtualizer.scrollToIndex(index, {
               align: "start",
               behavior: pending.behavior === "smooth" ? "auto" : pending.behavior,
          });

          pendingJumpRef.current = null;
     }, [dataTick, rowCount, rowVirtualizer, spine.verseOrdMin]);

     useLayoutEffect(() => {
          if (rafMeasureRef.current != null) {
               cancelAnimationFrame(rafMeasureRef.current);
          }

          rafMeasureRef.current = requestAnimationFrame(() => {
               rowVirtualizer.measure();
               rafMeasureRef.current = null;
          });

          return () => {
               if (rafMeasureRef.current != null) {
                    cancelAnimationFrame(rafMeasureRef.current);
                    rafMeasureRef.current = null;
               }
          };
     }, [dataTick, rowVirtualizer]);

     useEffect(() => {
          if (onReadyCalledRef.current) return;
          if (loadedChunksRef.current.size === 0) return;

          onReadyCalledRef.current = true;
          onReady?.();
     }, [dataTick, onReady]);

     useEffect(() => {
          return () => {
               cancelAllInFlight();
               if (selectionRootRef) {
                    selectionRootRef.current = null;
               }
          };
     }, [cancelAllInFlight, selectionRootRef]);

     const renderRow = useCallback(
         (verseOrd: number): React.ReactNode => {
              const row = verseMapRef.current.get(verseOrd) ?? null;
              if (!row) return skeletonRow(verseOrd);

              const annotations = annotationIndex.get(verseOrd) ?? EMPTY_ANNOTATIONS;

              return (
                  <VerseRow
                      row={row}
                      book={bookById.get(getRowBookId(row)) ?? null}
                      annotations={annotations}
                  />
              );
         },
         [annotationIndex, bookById],
     );

     return (
         <div style={ROOT_STYLE}>
              <div ref={setScrollEl} style={SCROLL_STYLE}>
                   <div
                       ref={setSelectionRootEl}
                       style={CONTAINER_STYLE}
                       data-translation-id={undefined}
                   >
                        {topContent}

                        <div
                            style={{
                                 ...VIRTUAL_STAGE_STYLE,
                                 height: totalSize,
                            }}
                        >
                             {virtualItems.map((item) => {
                                  const verseOrd = clamp(
                                      spine.verseOrdMin + item.index,
                                      spine.verseOrdMin,
                                      lastOrd,
                                  );

                                  return (
                                      <div
                                          key={item.key}
                                          data-index={item.index}
                                          ref={rowVirtualizer.measureElement}
                                          style={{
                                               position: "absolute",
                                               top: 0,
                                               left: 0,
                                               width: "100%",
                                               transform: `translate3d(0, ${item.start}px, 0)`,
                                          }}
                                      >
                                           {renderRow(verseOrd)}
                                      </div>
                                  );
                             })}
                        </div>
                   </div>
              </div>
         </div>
     );
});

ReaderViewport.displayName = "ReaderViewport";