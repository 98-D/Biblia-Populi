// cspell:words oklab
// apps/web/src/PositionPill.tsx
// Biblia.to — Position Pill (Book / Chapter / Verse picker)
//
// Hardened / micropolished:
// - no deprecated MediaQueryList listener APIs
// - no unsafe event-unsubscribe casts
// - robust outside-click handling via composedPath()
// - focus restore to pill on close
// - roving focus + listbox semantics
// - async chapter loading with per-book cache + AbortController + stale guard
// - viewport-clamped popover with resize / scroll / visualViewport reflow
// - monochrome-only visuals
// - calmer open/close animation + button press states
// - fixed custom CSS var typing on inline styles
// - deduplicated focus/scroll movement logic

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { apiGetChapters, type BookRow, type ChaptersPayload } from "./api";

type Props = {
  styles: Record<string, React.CSSProperties>;
  books: BookRow[] | null;
  current: {
    label: string;
    ord: number;
    bookId: string | null;
    chapter: number | null;
    verse: number | null;
  };
  onJump: (bookId: string, chapter: number, verse: number | null) => void;
};

type WheelOption = Readonly<{
  key: string;
  label: string;
  value: number;
}>;

type PopPos = Readonly<{
  left: number;
  top: number;
  height: number;
  width: number;
}>;

type Col = "book" | "chapter" | "verse";
type Phase = "opening" | "open" | "closing";
type CssVarStyle = React.CSSProperties & Record<`--${string}`, string | number>;

/* ---------------- Compact + paper-like ---------------- */

const SCALE = 0.84;
const S = (n: number) => Math.round(n * SCALE);

const POPOVER_W = S(440);
const COL_NARROW_W = S(92);
const POPOVER_MAX_H = S(330);
const POPOVER_MIN_H = S(200);
const POPOVER_MARGIN = 14;
const LIST_PAD = S(10);

const PILL_W_CLOSED = S(216);
const PILL_W_OPEN = S(226);
const NUM_COL_W = S(62);
const PILL_PAD_X = S(9);
const PILL_GAP = S(6);

const CLOSE_DELAY_MS = 110;
const OPEN_MS = 150;
const CLOSE_MS = 145;

const POP_ID = "bp-pos-popover";
const CSS_SENTINEL_ATTR = "data-bp-pos-popover-css";

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

function buildNumberOptions(min: number, max: number): WheelOption[] {
  const out: WheelOption[] = [];
  for (let i = min; i <= max; i += 1) {
    out.push({ key: String(i), label: String(i), value: i });
  }
  return out;
}

function pressedStyle(styles: Record<string, React.CSSProperties>): React.CSSProperties | null {
  const record = styles as Record<string, React.CSSProperties | undefined>;
  return record.btnPressed ?? record.buttonPressed ?? null;
}

function computePopoverPos(anchor: DOMRect, desiredWidth: number): PopPos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = POPOVER_MARGIN;

  const width = Math.min(desiredWidth, vw - margin * 2);
  const cx = anchor.left + anchor.width / 2;
  const left = clampInt(Math.round(cx - width / 2), margin, Math.max(margin, vw - width - margin));

  const belowTop = Math.round(anchor.bottom + 12);
  const belowAvail = vh - belowTop - margin;
  const cap = Math.min(POPOVER_MAX_H, vh - margin * 2);

  if (belowAvail >= POPOVER_MIN_H) {
    return {
      left,
      top: belowTop,
      height: Math.min(cap, belowAvail),
      width,
    };
  }

  const top = clampInt(
       Math.round(anchor.top - 12 - cap),
       margin,
       Math.max(margin, vh - cap - margin),
  );
  const aboveAvail = Math.round(anchor.top - top - 12);

  return {
    left,
    top,
    height: Math.min(cap, Math.max(POPOVER_MIN_H, aboveAvail)),
    width,
  };
}

function subscribeMediaQuery(query: string, onChange: (matches: boolean) => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};

  const mq = window.matchMedia(query);
  const handler = (event: MediaQueryListEvent) => onChange(event.matches);

  onChange(mq.matches);
  mq.addEventListener("change", handler);

  return () => {
    mq.removeEventListener("change", handler);
  };
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    return subscribeMediaQuery("(prefers-reduced-motion: reduce)", setReduced);
  }, []);

  return reduced;
}

function useLatestRef<T>(value: T) {
  const r = useRef(value);

  useEffect(() => {
    r.current = value;
  }, [value]);

  return r;
}

function injectPopoverCssOnce(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`style[${CSS_SENTINEL_ATTR}="1"]`)) return;

  const el = document.createElement("style");
  el.setAttribute(CSS_SENTINEL_ATTR, "1");
  el.textContent = `
#${POP_ID} .bp-scroll { scrollbar-width: thin; scrollbar-color: var(--hairline) transparent; }
#${POP_ID} .bp-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
#${POP_ID} .bp-scroll::-webkit-scrollbar-track { background: transparent !important; }
#${POP_ID} .bp-scroll::-webkit-scrollbar-thumb {
  background: var(--hairline);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
#${POP_ID} .bp-scroll::-webkit-scrollbar-thumb:hover { background: var(--focusRing); }

#${POP_ID} button.bp-row {
  transition: background 150ms ease, box-shadow 150ms ease, transform 110ms ease;
}
#${POP_ID} button.bp-row:active { transform: scale(0.982); }
#${POP_ID} button.bp-row:hover { background: color-mix(in oklab, var(--panel) 22%, transparent); }
#${POP_ID} button.bp-row:focus-visible {
  outline: none;
  box-shadow:
    inset 0 0 0 1px var(--bpAccentRing),
    0 0 0 3px color-mix(in oklab, var(--bpAccentRing) 55%, transparent);
}

#${POP_ID} button.bp-go {
  transition:
    transform 160ms cubic-bezier(0.23, 1.0, 0.32, 1.0),
    box-shadow 160ms ease,
    opacity 160ms ease;
}
#${POP_ID} button.bp-go:active { transform: scale(0.955) translateY(1px); }
`;
  document.head.appendChild(el);
}

function nextIndex(cur: number, delta: number, len: number): number {
  if (len <= 0) return 0;
  const n = cur + delta;
  if (n < 0) return 0;
  if (n >= len) return len - 1;
  return n;
}

function scrollIntoViewCentered(el: HTMLElement | null | undefined): void {
  if (!el) return;
  try {
    el.scrollIntoView({ block: "center" });
  } catch {
    // ignore
  }
}

function eventComposedPath(e: Event): EventTarget[] | null {
  const maybe = e as Event & { composedPath?: () => EventTarget[] };
  return typeof maybe.composedPath === "function" ? maybe.composedPath() : null;
}

function targetWithinNode(target: Node | null, path: EventTarget[] | null, node: Node | null): boolean {
  if (!node) return false;
  if (target && node.contains(target)) return true;
  if (!path) return false;

  for (const entry of path) {
    if (entry === node) return true;
  }
  return false;
}

/* --------------------------- List Item --------------------------- */

const ListItem = React.memo(function ListItem(props: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tight?: boolean;
  mapRef?: React.RefObject<Map<string, HTMLButtonElement | null>>;
  itemKey?: string;
  ariaLabel?: string;
  tabIndex?: number;
  id?: string;
  onFocus?: () => void;
}) {
  const {
    active,
    onClick,
    children,
    tight = false,
    mapRef,
    itemKey,
    ariaLabel,
    tabIndex,
    id,
    onFocus,
  } = props;

  const ref = useRef<HTMLButtonElement>(null);
  const baseStyle = tight ? sx.itemTight : sx.item;

  useEffect(() => {
    if (!mapRef || !itemKey) return;

    mapRef.current?.set(itemKey, ref.current);
    return () => {
      if (mapRef.current?.get(itemKey) === ref.current) {
        mapRef.current?.set(itemKey, null);
      }
    };
  }, [mapRef, itemKey]);

  return (
       <button
            id={id}
            type="button"
            className="bp-row"
            ref={ref}
            style={{ ...baseStyle, ...(active ? sx.itemActive : null) }}
            onPointerDown={(e) => {
              if (e.pointerType !== "mouse") e.preventDefault();
            }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
            onFocus={onFocus}
            aria-label={ariaLabel}
            role="option"
            aria-selected={active}
            tabIndex={tabIndex}
       >
         {active ? <span style={sx.activeBar} aria-hidden /> : null}
         {children}
         <span style={{ ...sx.selDot, ...(active ? sx.selDotOn : null) }} aria-hidden />
       </button>
  );
});

/* --------------------------- Component --------------------------- */

export function PositionPill({ styles, books, current, onJump }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const list = books ?? [];

  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const popoverElRef = useRef<HTMLDivElement | null>(null);

  const bookBtnMapRef = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const chapBtnMapRef = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const verseBtnMapRef = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  const chaptersCacheRef = useRef<Map<string, ChaptersPayload>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const closeTimerRef = useRef<number | null>(null);

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("opening");
  const [popPos, setPopPos] = useState<PopPos | null>(null);

  const [pressPill, setPressPill] = useState(false);
  const [pressGo, setPressGo] = useState(false);

  const [activeCol, setActiveCol] = useState<Col>("book");
  const [activeBookIdx, setActiveBookIdx] = useState(0);
  const [activeChapIdx, setActiveChapIdx] = useState(0);
  const [activeVerseIdx, setActiveVerseIdx] = useState(0);

  const [bookId, setBookId] = useState<string>(current.bookId ?? list[0]?.bookId ?? "GEN");
  const [chapter, setChapter] = useState<number>(current.chapter ?? 1);
  const [verse, setVerse] = useState<number | null>(current.verse ?? null);

  const [pendingChapter, setPendingChapter] = useState(false);
  const [pendingVerse, setPendingVerse] = useState(false);
  const [chaptersMeta, setChaptersMeta] = useState<ChaptersPayload | null>(null);

  const openRef = useLatestRef(open);
  const phaseRef = useLatestRef(phase);
  const activeColRef = useLatestRef(activeCol);

  useEffect(() => {
    injectPopoverCssOnce();
  }, []);

  const currentBookId = current.bookId ?? list[0]?.bookId ?? "GEN";
  const currentChap = current.chapter ?? 1;
  const currentVerse = current.verse ?? null;

  const bookNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of list) m.set(b.bookId, b.name);
    return m;
  }, [list]);

  const currentBookName =
       (current.bookId ? bookNameById.get(current.bookId) : null) ??
       currentBookId ??
       "…";

  const selectedBook = useMemo(
       () => list.find((b) => b.bookId === bookId) ?? null,
       [list, bookId],
  );

  const bookName = selectedBook?.name ?? bookId;
  const testamentTag = (selectedBook?.testament ?? "").toUpperCase();
  const chapterMax = selectedBook?.chapters ?? 999;

  useEffect(() => {
    const idx = Math.max(0, list.findIndex((b) => b.bookId === bookId));
    setActiveBookIdx(idx >= 0 ? idx : 0);
  }, [list, bookId]);

  useEffect(() => {
    setChapter((c) => clampInt(c || 1, 1, chapterMax));
  }, [chapterMax]);

  useEffect(() => {
    if (!open) return;

    abortRef.current?.abort();
    abortRef.current = null;

    const cached = chaptersCacheRef.current.get(bookId) ?? null;
    if (cached) {
      setChaptersMeta(cached);
      return;
    }

    const id = ++requestIdRef.current;
    const ac = new AbortController();
    abortRef.current = ac;

    apiGetChapters(bookId, { signal: ac.signal })
         .then((payload) => {
           if (ac.signal.aborted) return;
           if (id !== requestIdRef.current) return;
           chaptersCacheRef.current.set(bookId, payload);
           setChaptersMeta(payload);
         })
         .catch(() => {
           if (ac.signal.aborted) return;
           if (id !== requestIdRef.current) return;
           setChaptersMeta(null);
         });

    return () => {
      ac.abort();
    };
  }, [open, bookId]);

  const verseMax = useMemo(() => {
    if (!chaptersMeta) return 999;
    const row = chaptersMeta.chapters.find((c) => c.chapter === chapter);
    return row?.verseCount ?? 999;
  }, [chaptersMeta, chapter]);

  useEffect(() => {
    setVerse((v) => (v == null ? null : clampInt(v, 1, verseMax)));
  }, [verseMax]);

  const chapterOptions = useMemo(() => buildNumberOptions(1, chapterMax), [chapterMax]);
  const verseOptions = useMemo(() => buildNumberOptions(1, verseMax), [verseMax]);

  useEffect(() => {
    setActiveChapIdx(Math.max(0, Math.min(chapterOptions.length - 1, chapter - 1)));
  }, [chapterOptions.length, chapter]);

  useEffect(() => {
    setActiveVerseIdx(
         verse == null ? 0 : Math.max(0, Math.min(verseOptions.length - 1, verse - 1)),
    );
  }, [verseOptions.length, verse]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (open) return;

    abortRef.current?.abort();
    abortRef.current = null;

    setBookId(currentBookId);
    setChapter(currentChap);
    setVerse(currentVerse);
    setPendingChapter(false);
    setPendingVerse(false);
    setChaptersMeta(null);
    setActiveCol("book");

    clearCloseTimer();

    const id = requestAnimationFrame(() => {
      anchorRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open, currentBookId, currentChap, currentVerse, clearCloseTimer]);

  const titleNumPart = useMemo(() => {
    if (pendingChapter) return "";
    let out = ` ${chapter}`;
    if (!pendingVerse && verse != null) out += `:${verse}`;
    return out;
  }, [pendingChapter, pendingVerse, chapter, verse]);

  const pillLabel = useMemo(() => {
    return currentVerse == null
         ? `${currentBookName} ${currentChap}`
         : `${currentBookName} ${currentChap}:${currentVerse}`;
  }, [currentBookName, currentChap, currentVerse]);

  const closePopover = useCallback(() => {
    if (!openRef.current || phaseRef.current === "closing") return;
    setPhase("closing");
  }, [openRef, phaseRef]);

  const openPopover = useCallback(() => {
    clearCloseTimer();
    setOpen(true);
    setPhase("opening");
  }, [clearCloseTimer]);

  const toggleOpen = useCallback(() => {
    if (openRef.current) closePopover();
    else openPopover();
  }, [openRef, closePopover, openPopover]);

  const commit = useCallback(() => {
    const ch = pendingChapter ? 1 : chapter;
    const v = pendingVerse || verse == null ? null : verse;
    onJump(bookId, ch, v);
    closePopover();
  }, [bookId, chapter, verse, pendingChapter, pendingVerse, onJump, closePopover]);

  const onPickBook = useCallback((nextBookId: string) => {
    setBookId(nextBookId);
    setPendingChapter(true);
    setPendingVerse(true);
    setChapter(1);
    setVerse(null);
    setActiveCol("chapter");
  }, []);

  const onPickChapter = useCallback((nextChapter: number) => {
    setPendingChapter(false);
    setChapter(nextChapter);
    setPendingVerse(true);
    setVerse(null);
    setActiveCol("verse");
  }, []);

  const onPickVerse = useCallback((nextVerse: number) => {
    setPendingVerse(false);
    setVerse(nextVerse);
  }, []);

  const focusBookByIndex = useCallback(
       (idx: number) => {
         const id = list[idx]?.bookId;
         const el = id ? bookBtnMapRef.current.get(id) : null;
         el?.focus();
         scrollIntoViewCentered(el);
       },
       [list],
  );

  const focusChapterByIndex = useCallback(
       (idx: number) => {
         const n = chapterOptions[idx]?.value;
         const el = n != null ? chapBtnMapRef.current.get(`c:${n}`) : null;
         el?.focus();
         scrollIntoViewCentered(el);
       },
       [chapterOptions],
  );

  const focusVerseByIndex = useCallback(
       (idx: number) => {
         const n = verseOptions[idx]?.value;
         const el = n != null ? verseBtnMapRef.current.get(`v:${n}`) : null;
         el?.focus();
         scrollIntoViewCentered(el);
       },
       [verseOptions],
  );

  const focusCurrentColumnSelection = useCallback(
       (col: Col) => {
         if (col === "book") {
           focusBookByIndex(activeBookIdx);
           return;
         }
         if (col === "chapter") {
           focusChapterByIndex(activeChapIdx);
           return;
         }
         focusVerseByIndex(activeVerseIdx);
       },
       [activeBookIdx, activeChapIdx, activeVerseIdx, focusBookByIndex, focusChapterByIndex, focusVerseByIndex],
  );

  const focusColumnBoundary = useCallback(
       (col: Col, atEnd: boolean) => {
         if (col === "book") {
           const idx = atEnd ? Math.max(0, list.length - 1) : 0;
           setActiveBookIdx(idx);
           focusBookByIndex(idx);
           return;
         }

         if (col === "chapter") {
           const idx = atEnd ? Math.max(0, chapterOptions.length - 1) : 0;
           setActiveChapIdx(idx);
           focusChapterByIndex(idx);
           return;
         }

         const idx = atEnd ? Math.max(0, verseOptions.length - 1) : 0;
         setActiveVerseIdx(idx);
         focusVerseByIndex(idx);
       },
       [list.length, chapterOptions.length, verseOptions.length, focusBookByIndex, focusChapterByIndex, focusVerseByIndex],
  );

  useLayoutEffect(() => {
    if (!open) return;
    const a = anchorRef.current;
    if (!a) return;

    let raf = 0;

    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = a.getBoundingClientRect();
        setPopPos(computePopoverPos(rect, POPOVER_W));
      });
    };

    update();

    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("scroll", update, true);

    const vv = window.visualViewport;
    vv?.addEventListener("resize", update, { passive: true });
    vv?.addEventListener("scroll", update, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (reducedMotion) {
      setPhase("open");
      return;
    }
    if (phase !== "opening") return;

    const id = window.setTimeout(() => setPhase("open"), OPEN_MS);
    return () => window.clearTimeout(id);
  }, [open, phase, reducedMotion]);

  useEffect(() => {
    if (!open || phase !== "closing") return;
    if (reducedMotion) {
      setOpen(false);
      return;
    }

    const id = window.setTimeout(() => setOpen(false), CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [open, phase, reducedMotion]);

  useEffect(() => {
    if (!open) return;

    const onPointerDownCapture = (e: PointerEvent) => {
      const target = e.target as Node | null;
      const path = eventComposedPath(e);

      const inAnchor = targetWithinNode(target, path, anchorRef.current);
      const inPop = targetWithinNode(target, path, popoverElRef.current);

      if (inAnchor || inPop) return;

      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => closePopover(), CLOSE_DELAY_MS);
    };

    const onKeyCapture = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePopover();
        return;
      }

      if (e.key === "Enter") {
        const pop = popoverElRef.current;
        const activeEl = document.activeElement;
        if (pop && activeEl && pop.contains(activeEl)) {
          e.preventDefault();
          if (!pendingChapter) commit();
        }
      }
    };

    document.addEventListener("pointerdown", onPointerDownCapture, { capture: true });
    document.addEventListener("keydown", onKeyCapture, { capture: true });

    return () => {
      document.removeEventListener("pointerdown", onPointerDownCapture, { capture: true });
      document.removeEventListener("keydown", onKeyCapture, { capture: true });
    };
  }, [open, commit, closePopover, clearCloseTimer, pendingChapter]);

  useEffect(() => {
    if (!open) return;

    const id = requestAnimationFrame(() => {
      const bookEl = bookBtnMapRef.current.get(bookId) ?? null;
      bookEl?.focus();
      scrollIntoViewCentered(bookEl);

      if (!pendingChapter) {
        const chapEl = chapBtnMapRef.current.get(`c:${chapter}`) ?? null;
        scrollIntoViewCentered(chapEl);
      }

      if (!pendingVerse && verse != null) {
        const verseEl = verseBtnMapRef.current.get(`v:${verse}`) ?? null;
        scrollIntoViewCentered(verseEl);
      }
    });

    return () => cancelAnimationFrame(id);
  }, [open, bookId, chapter, verse, pendingChapter, pendingVerse]);

  const canCommit = !pendingChapter;

  const pillStyle: React.CSSProperties = {
    ...sx.pill,
    width: open ? PILL_W_OPEN : PILL_W_CLOSED,
    ...(pressPill ? pressedStyle(styles) ?? sx.pillPressedFallback : null),
    ...(open ? sx.pillOpen : null),
  };

  const goStyle: React.CSSProperties = {
    ...sx.goBtn,
    ...(pressGo ? pressedStyle(styles) ?? sx.goPressedFallback : null),
    ...(!canCommit ? sx.goBtnDisabled : null),
  };

  const popAnim: React.CSSProperties = reducedMotion
       ? { opacity: 1, transform: "none" }
       : phase === "opening"
            ? { opacity: 0, transform: "scale(0.975) translateY(6px)" }
            : phase === "closing"
                 ? { opacity: 0, transform: "scale(0.988) translateY(4px)" }
                 : { opacity: 1, transform: "scale(1) translateY(0)" };

  const popTransition = reducedMotion
       ? undefined
       : "opacity 155ms cubic-bezier(0.23, 1.0, 0.32, 1.0), transform 155ms cubic-bezier(0.23, 1.0, 0.32, 1.0)";

  const popoverStyle: CssVarStyle = {
    ...sx.popover,
    left: popPos?.left ?? 0,
    top: popPos?.top ?? 0,
    width: popPos?.width ?? POPOVER_W,
    height: popPos?.height ?? POPOVER_MIN_H,
    ...popAnim,
    transition: popTransition,
    "--bpAccent": "var(--fg)",
    "--bpAccentSoft": "color-mix(in oklab, var(--panel) 26%, transparent)",
    "--bpAccentRing": "color-mix(in oklab, var(--focusRing) 72%, transparent)",
  };

  const onPopoverKeyDown = useCallback(
       (e: React.KeyboardEvent<HTMLDivElement>) => {
         const key = e.key;
         const col = activeColRef.current;
         const isBooks = col === "book";
         const isCh = col === "chapter";
         const isV = col === "verse";

         const moveCol = (next: Col) => {
           setActiveCol(next);
           requestAnimationFrame(() => {
             focusCurrentColumnSelection(next);
           });
         };

         const handleUpDown = (delta: number) => {
           if (isBooks) {
             const idx = nextIndex(activeBookIdx, delta, list.length);
             setActiveBookIdx(idx);
             focusBookByIndex(idx);
             e.preventDefault();
             return;
           }

           if (isCh) {
             const idx = nextIndex(activeChapIdx, delta, chapterOptions.length);
             setActiveChapIdx(idx);
             focusChapterByIndex(idx);
             e.preventDefault();
             return;
           }

           const idx = nextIndex(activeVerseIdx, delta, verseOptions.length);
           setActiveVerseIdx(idx);
           focusVerseByIndex(idx);
           e.preventDefault();
         };

         if (key === "ArrowLeft") {
           if (isV) moveCol("chapter");
           else if (isCh) moveCol("book");
           e.preventDefault();
           return;
         }

         if (key === "ArrowRight") {
           if (isBooks) moveCol("chapter");
           else if (isCh) moveCol("verse");
           e.preventDefault();
           return;
         }

         if (key === "ArrowUp") {
           handleUpDown(-1);
           return;
         }

         if (key === "ArrowDown") {
           handleUpDown(1);
           return;
         }

         if (key === "Home") {
           focusColumnBoundary(col, false);
           e.preventDefault();
           return;
         }

         if (key === "End") {
           focusColumnBoundary(col, true);
           e.preventDefault();
         }
       },
       [
         activeBookIdx,
         activeChapIdx,
         activeVerseIdx,
         activeColRef,
         chapterOptions.length,
         verseOptions.length,
         list.length,
         focusBookByIndex,
         focusChapterByIndex,
         focusVerseByIndex,
         focusCurrentColumnSelection,
         focusColumnBoundary,
       ],
  );

  const popover =
       open && popPos
            ? createPortal(
                 <div
                      id={POP_ID}
                      ref={popoverElRef}
                      style={popoverStyle}
                      role="dialog"
                      aria-label="Jump"
                      aria-modal="false"
                      onKeyDown={onPopoverKeyDown}
                 >
                   <div style={sx.topRow}>
                     <div
                          style={sx.titleWrap}
                          aria-label="Selection summary"
                          title={`${bookName}${titleNumPart}${testamentTag}`}
                     >
                       <span style={sx.titleBook}>{bookName}</span>
                       {titleNumPart ? <span style={sx.titleNum}>{titleNumPart}</span> : null}
                       {testamentTag ? <span style={sx.titleTag}>{testamentTag}</span> : null}
                     </div>

                     <button
                          type="button"
                          className="bp-go"
                          style={goStyle}
                          onClick={() => {
                            if (canCommit) commit();
                          }}
                          disabled={!canCommit}
                          onPointerDown={() => setPressGo(true)}
                          onPointerUp={() => setPressGo(false)}
                          onPointerCancel={() => setPressGo(false)}
                          onPointerLeave={() => setPressGo(false)}
                          aria-label="Confirm jump"
                          title={canCommit ? "Confirm" : "Pick a chapter first"}
                     >
                       →
                     </button>
                   </div>

                   <div style={sx.bodyRow}>
                     <div style={sx.col}>
                       <div className="bp-scroll" style={sx.list} role="listbox" aria-label="Books">
                         {list.map((b, idx) => {
                           const active = b.bookId === bookId;
                           const tabIndex =
                                activeCol === "book" && idx === activeBookIdx ? 0 : -1;

                           return (
                                <ListItem
                                     key={b.bookId}
                                     active={active}
                                     onClick={() => onPickBook(b.bookId)}
                                     mapRef={bookBtnMapRef}
                                     itemKey={b.bookId}
                                     ariaLabel={`Select ${b.name}`}
                                     tabIndex={tabIndex}
                                     onFocus={() => setActiveCol("book")}
                                >
                                              <span style={sx.itemLine}>
                                                  <span
                                                       style={{
                                                         ...sx.itemTextBook,
                                                         ...(active ? sx.itemTextActive : null),
                                                       }}
                                                  >
                                                      {b.name}
                                                  </span>
                                              </span>
                                </ListItem>
                           );
                         })}
                       </div>
                     </div>

                     <div style={sx.colNarrow}>
                       <div className="bp-scroll" style={sx.list} role="listbox" aria-label="Chapters">
                         {chapterOptions.map((o, idx) => {
                           const n = o.value;
                           const active = !pendingChapter && n === chapter;
                           const tabIndex =
                                activeCol === "chapter" && idx === activeChapIdx ? 0 : -1;

                           return (
                                <ListItem
                                     key={o.key}
                                     active={active}
                                     onClick={() => onPickChapter(n)}
                                     tight
                                     mapRef={chapBtnMapRef}
                                     itemKey={`c:${n}`}
                                     ariaLabel={`Chapter ${n}`}
                                     tabIndex={tabIndex}
                                     onFocus={() => setActiveCol("chapter")}
                                >
                                              <span
                                                   style={{
                                                     ...sx.numText,
                                                     ...(active ? sx.numTextActive : null),
                                                   }}
                                              >
                                                  <span style={sx.prefixLabel}>CH</span> {n}
                                              </span>
                                </ListItem>
                           );
                         })}
                       </div>
                     </div>

                     <div style={sx.colNarrow}>
                       <div className="bp-scroll" style={sx.list} role="listbox" aria-label="Verses">
                         {!chaptersMeta ? (
                              <div style={sx.loadingBox}>Loading…</div>
                         ) : (
                              verseOptions.map((o, idx) => {
                                const n = o.value;
                                const active = !pendingVerse && verse === n;
                                const tabIndex =
                                     activeCol === "verse" && idx === activeVerseIdx ? 0 : -1;

                                return (
                                     <ListItem
                                          key={o.key}
                                          active={active}
                                          onClick={() => onPickVerse(n)}
                                          tight
                                          mapRef={verseBtnMapRef}
                                          itemKey={`v:${n}`}
                                          ariaLabel={`Verse ${n}`}
                                          tabIndex={tabIndex}
                                          onFocus={() => setActiveCol("verse")}
                                     >
                                                  <span
                                                       style={{
                                                         ...sx.numText,
                                                         ...(active ? sx.numTextActive : null),
                                                       }}
                                                  >
                                                      <span style={sx.prefixLabel}>V</span> {n}
                                                  </span>
                                     </ListItem>
                                );
                              })
                         )}
                       </div>
                     </div>
                   </div>
                 </div>,
                 document.body,
            )
            : null;

  return (
       <div style={sx.root}>
         <button
              ref={anchorRef}
              type="button"
              className="bp-pill"
              style={pillStyle}
              aria-label="Current position"
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={toggleOpen}
              onPointerDown={() => {
                clearCloseTimer();
                setPressPill(true);
              }}
              onPointerUp={() => setPressPill(false)}
              onPointerCancel={() => setPressPill(false)}
              onPointerLeave={() => setPressPill(false)}
              title={pillLabel}
         >
           <span style={sx.pillTextStrong}>{currentBookName}</span>
           <span style={sx.pillTextMuted}>
                    {currentVerse == null ? `${currentChap}` : `${currentChap}:${currentVerse}`}
                </span>
           <span style={sx.caret} aria-hidden>
                    ▾
                </span>
         </button>

         {popover}
       </div>
  );
}

const sx: Record<string, React.CSSProperties> = {
  root: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },

  pill: {
    display: "inline-grid",
    gridTemplateColumns: `minmax(0, 1fr) ${NUM_COL_W}px auto`,
    alignItems: "center",
    height: S(34),
    padding: `0 ${PILL_PAD_X}px`,
    borderRadius: 999,
    border: "1px solid var(--hairline)",
    background: "color-mix(in oklab, var(--panel) 65%, var(--bg))",
    gap: PILL_GAP,
    cursor: "pointer",
    userSelect: "none",
    color: "inherit",
    lineHeight: 1,
    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
    transition:
         "transform 160ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 160ms cubic-bezier(0.23, 1, 0.32, 1), border-color 160ms ease, background 160ms ease",
    whiteSpace: "nowrap",
    textAlign: "left",
    WebkitTapHighlightColor: "transparent",
    outline: "none",
    willChange: "transform",
  },
  pillPressedFallback: {
    transform: "scale(0.97)",
  },
  pillOpen: {
    boxShadow: "0 14px 42px rgba(0,0,0,0.12)",
    transform: "translateY(-1px)",
    borderColor: "color-mix(in oklab, var(--focusRing) 62%, var(--hairline))",
    background: "color-mix(in oklab, var(--panel) 78%, var(--bg))",
  },

  pillTextStrong: {
    fontSize: 15.4 * SCALE,
    fontWeight: 720,
    letterSpacing: "-0.012em",
    color: "var(--fg)",
    opacity: 0.96,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
    justifySelf: "start",
  },
  pillTextMuted: {
    width: "100%",
    fontSize: 15.4 * SCALE,
    letterSpacing: "-0.012em",
    color: "var(--muted)",
    opacity: 0.96,
    whiteSpace: "nowrap",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    justifySelf: "end",
  },
  caret: {
    fontSize: 11.0 * SCALE,
    color: "var(--muted)",
    opacity: 0.82,
    transform: "translateY(-0.5px)",
    justifySelf: "center",
    transition: "transform 150ms ease",
  },

  popover: {
    position: "fixed",
    zIndex: 2000,
    borderRadius: S(16),
    border: "1px solid color-mix(in oklab, var(--hairline) 88%, transparent)",
    background: "color-mix(in oklab, var(--bg) 92%, var(--panel))",
    padding: `${S(11)}px`,
    boxShadow: "0 28px 96px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.05)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    transformOrigin: "top center",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    outline: "none",
  },

  topRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: S(8),
    alignItems: "center",
    marginBottom: S(10),
    flex: "0 0 auto",
  },
  titleWrap: {
    height: S(40),
    borderRadius: S(12),
    border: "1px solid var(--hairline)",
    background: "color-mix(in oklab, var(--panel) 62%, var(--bg))",
    padding: `0 ${S(11)}px`,
    display: "flex",
    alignItems: "center",
    minWidth: 0,
    gap: S(3),
  },
  titleBook: {
    fontSize: 13.6 * SCALE,
    fontWeight: 740,
    letterSpacing: "-0.014em",
    color: "var(--fg)",
    opacity: 0.97,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    minWidth: 0,
  },
  titleNum: {
    fontSize: 13.6 * SCALE,
    fontWeight: 630,
    letterSpacing: "-0.01em",
    color: "var(--fg)",
    opacity: 0.94,
    whiteSpace: "nowrap",
  },
  titleTag: {
    fontSize: 12.4 * SCALE,
    fontWeight: 480,
    letterSpacing: "0.02em",
    color: "var(--muted)",
    opacity: 0.78,
    whiteSpace: "nowrap",
  },

  goBtn: {
    height: S(40),
    width: S(40),
    borderRadius: S(12),
    border: "1px solid transparent",
    background: "var(--fg)",
    color: "var(--bg)",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    fontSize: 17 * SCALE,
    fontWeight: 720,
    boxShadow: "0 10px 28px rgba(0,0,0,0.14)",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
    outline: "none",
  },
  goBtnDisabled: {
    opacity: 0.52,
    cursor: "not-allowed",
  },
  goPressedFallback: {
    transform: "scale(0.945)",
  },

  bodyRow: {
    display: "grid",
    gridTemplateColumns: `1fr ${COL_NARROW_W}px ${COL_NARROW_W}px`,
    gap: S(8),
    alignItems: "stretch",
    minHeight: 0,
    flex: "1 1 auto",
  },
  col: {
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },
  colNarrow: {
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  },

  list: {
    borderRadius: S(12),
    border: "1px solid var(--hairline)",
    background: "color-mix(in oklab, var(--panel) 62%, var(--bg))",
    overflowY: "auto",
    overflowX: "hidden",
    WebkitOverflowScrolling: "touch",
    scrollbarGutter: "stable",
    overscrollBehavior: "contain",
    minHeight: 0,
    flex: "1 1 auto",
    paddingTop: LIST_PAD,
    paddingBottom: LIST_PAD,
    scrollPaddingTop: LIST_PAD,
    scrollPaddingBottom: LIST_PAD,
  },

  item: {
    width: "100%",
    position: "relative",
    textAlign: "left",
    display: "grid",
    gridTemplateColumns: "1fr 10px",
    alignItems: "center",
    gap: S(8),
    padding: `${S(8)}px ${S(10)}px`,
    border: "none",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    outline: "none",
  },
  itemTight: {
    width: "100%",
    position: "relative",
    textAlign: "left",
    display: "grid",
    gridTemplateColumns: "1fr 10px",
    alignItems: "center",
    gap: S(8),
    padding: `${S(7)}px ${S(9)}px`,
    border: "none",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    outline: "none",
  },

  itemActive: {
    background: "var(--bpAccentSoft)",
    boxShadow: "inset 0 0 0 1px var(--bpAccentRing)",
  },
  activeBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    background: "var(--bpAccent)",
    borderTopLeftRadius: S(12),
    borderBottomLeftRadius: S(12),
  },

  itemLine: {
    display: "inline-flex",
    alignItems: "baseline",
    gap: S(7),
    minWidth: 0,
  },
  itemTextBook: {
    fontSize: 13.9 * SCALE,
    fontWeight: 600,
    letterSpacing: "-0.01em",
    color: "var(--fg)",
    opacity: 0.96,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
  itemTextActive: {
    opacity: 1,
    fontWeight: 670,
  },

  numText: {
    fontSize: 13.7 * SCALE,
    letterSpacing: "-0.01em",
    color: "var(--fg)",
    opacity: 0.93,
    fontWeight: 560,
    fontVariantNumeric: "tabular-nums",
  },
  numTextActive: {
    opacity: 1,
    fontWeight: 670,
  },

  prefixLabel: {
    fontSize: 10.8 * SCALE,
    fontWeight: 520,
    color: "var(--muted)",
    opacity: 0.62,
    letterSpacing: "0.06em",
    marginRight: S(3),
  },

  selDot: {
    width: S(8),
    height: S(8),
    borderRadius: 999,
    border: "1px solid var(--hairline)",
    background: "transparent",
    opacity: 0.88,
    justifySelf: "end",
  },
  selDotOn: {
    background: "var(--bpAccent)",
    border: "1px solid transparent",
    opacity: 0.82,
  },

  loadingBox: {
    borderRadius: S(12),
    border: "1px solid var(--hairline)",
    background: "color-mix(in oklab, var(--panel) 62%, var(--bg))",
    display: "grid",
    placeItems: "center",
    fontSize: 12.2 * SCALE,
    color: "var(--muted)",
    minHeight: 0,
    flex: "1 1 auto",
  },
};