// apps/web/src/PositionPill.tsx
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { apiGetChapters, type BookRow, type ChaptersPayload } from "./api";

type Props = {
    styles: Record<string, React.CSSProperties>;
    books: BookRow[] | null;
    current: { label: string; ord: number; bookId: string | null; chapter: number | null; verse: number | null };
    onJump: (bookId: string, chapter: number, verse: number | null) => void;
};

// ---- compact + premium (micro-polished) ----
const SCALE = 0.88;
const S = (n: number) => Math.round(n * SCALE);

const POPOVER_W = S(465);
const COL_NARROW_W = S(99);
const POPOVER_MAX_H = S(352);
const POPOVER_MARGIN = 16;
const LIST_PAD = S(14);

const ACCENT = "#d10b2f";
const ACCENT_SOFT = "rgba(209, 11, 47, 0.09)";
const ACCENT_RING = "rgba(209, 11, 47, 0.24)";

// Pill stability: fixed width (no jitter)
const PILL_W_CLOSED = S(232);
const PILL_W_OPEN = S(244);
const NUM_COL_W = S(66);
const PILL_PAD_X = S(9);
const PILL_GAP = S(6);

// Micro delay to prevent accidental close on scrollbar clicks
const CLOSE_DELAY_MS = 120;

type WheelOption = { key: string; label: string; value: number };
type PopPos = Readonly<{ left: number; top: number; height: number; width: number }>;

function pressedStyle(styles: Record<string, React.CSSProperties>): React.CSSProperties | null {
    return (styles as any).btnPressed ?? (styles as any).buttonPressed ?? null;
}

function clampInt(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

function buildNumberOptions(min: number, max: number): WheelOption[] {
    const out: WheelOption[] = [];
    for (let i = min; i <= max; i++) out.push({ key: String(i), label: String(i), value: i });
    return out;
}

function computePopoverPos(anchor: DOMRect, desiredWidth: number): PopPos {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = POPOVER_MARGIN;
    const width = Math.min(desiredWidth, vw - margin * 2);
    const cx = anchor.left + anchor.width / 2;
    const left = clampInt(Math.round(cx - width / 2), margin, Math.max(margin, vw - width - margin));

    const belowTop = Math.round(anchor.bottom + 14);
    const belowAvail = vh - belowTop - margin;
    const cap = Math.min(POPOVER_MAX_H, vh - margin * 2);

    if (belowAvail >= 220) {
        return { left, top: belowTop, height: Math.min(cap, belowAvail), width };
    }

    const top = clampInt(Math.round(anchor.top - 14 - cap), margin, Math.max(margin, vh - cap - margin));
    const aboveAvail = Math.round(anchor.top - top - 14);
    return { left, top, height: Math.min(cap, Math.max(220, aboveAvail)), width };
}

function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const onChange = () => setReduced(mq.matches);
        onChange();
        mq.addEventListener?.("change", onChange);
        return () => mq.removeEventListener?.("change", onChange);
    }, []);
    return reduced;
}

function useLatestRef<T>(value: T) {
    const r = useRef(value);
    useEffect(() => { r.current = value; }, [value]);
    return r;
}

function injectPopoverCssOnce(): void {
    const k = "data-bp-pos-popover-css";
    if (typeof document === "undefined" || document.querySelector(`style[${k}="1"]`)) return;

    const el = document.createElement("style");
    el.setAttribute(k, "1");
    el.textContent = `
        #bp-pos-popover .bp-scroll { scrollbar-width: thin; scrollbar-color: var(--hairline) transparent; }
        #bp-pos-popover .bp-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        #bp-pos-popover .bp-scroll::-webkit-scrollbar-track { background: transparent !important; }
        #bp-pos-popover .bp-scroll::-webkit-scrollbar-thumb { background: var(--hairline); border-radius: 999px; border: 2px solid transparent; background-clip: padding-box; }
        #bp-pos-popover .bp-scroll::-webkit-scrollbar-thumb:hover { background: var(--focusRing); }
        #bp-pos-popover button.bp-row { transition: background 160ms ease, box-shadow 160ms ease, transform 110ms ease, opacity 160ms ease; }
        #bp-pos-popover button.bp-row:active { transform: scale(0.978); }
        #bp-pos-popover button.bp-row:hover { background: rgba(209, 11, 47, 0.035); }
        #bp-pos-popover button.bp-row:focus-visible { outline: none; box-shadow: inset 0 0 0 1px var(--bpAccentRing); }
        #bp-pos-popover button.bp-go { transition: transform 160ms cubic-bezier(0.23, 1.0, 0.32, 1.0), box-shadow 160ms ease; }
        #bp-pos-popover button.bp-go:active { transform: scale(0.95) translateY(1px); }
    `;
    document.head.appendChild(el);
}

const ListItem = React.memo(function ListItem({
                                                  active,
                                                  onClick,
                                                  children,
                                                  tight = false,
                                                  mapRef,
                                                  itemKey,
                                                  ariaLabel,
                                              }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    tight?: boolean;
    mapRef?: React.RefObject<Map<string, HTMLButtonElement | null>>;
    itemKey?: string;
    ariaLabel?: string;
}) {
    const ref = useRef<HTMLButtonElement>(null);
    const baseStyle = tight ? sx.itemTight : sx.item;

    useEffect(() => {
        if (!mapRef || !itemKey) return;
        mapRef.current?.set(itemKey, ref.current);
        return () => { if (mapRef.current?.get(itemKey) === ref.current) mapRef.current?.set(itemKey, null); };
    }, [mapRef, itemKey]);

    return (
        <button
            type="button"
            className="bp-row"
            ref={ref}
            style={{ ...baseStyle, ...(active ? sx.itemActive : null) }}
            onPointerDown={(e) => { if (e.pointerType !== "mouse") e.preventDefault(); }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
            aria-label={ariaLabel}
            role="option"
            aria-selected={active}
        >
            {active && <span style={sx.activeBar} aria-hidden />}
            {children}
            <span style={{ ...sx.selDot, ...(active ? sx.selDotOn : null) }} aria-hidden />
        </button>
    );
});

export function PositionPill({ styles, books, current, onJump }: Props) {
    const reducedMotion = usePrefersReducedMotion();
    const list = books ?? [];
    const anchorRef = useRef<HTMLButtonElement | null>(null);
    const popoverElRef = useRef<HTMLDivElement | null>(null);

    const [open, setOpen] = useState(false);
    const [phase, setPhase] = useState<"opening" | "open" | "closing">("opening");
    const [popPos, setPopPos] = useState<PopPos | null>(null);
    const [pressPill, setPressPill] = useState(false);
    const [pressGo, setPressGo] = useState(false);

    const bookBtnMapRef = useRef<Map<string, HTMLButtonElement | null>>(new Map());
    const chapBtnMapRef = useRef<Map<string, HTMLButtonElement | null>>(new Map());
    const verseBtnMapRef = useRef<Map<string, HTMLButtonElement | null>>(new Map());

    const closeTimerRef = useRef<number | null>(null);
    const clearCloseTimer = useCallback(() => {
        if (closeTimerRef.current != null) {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
    }, []);

    useEffect(() => { injectPopoverCssOnce(); }, []);

    const bookNameById = useMemo(() => {
        const m = new Map<string, string>();
        for (const b of list) m.set(b.bookId, b.name);
        return m;
    }, [list]);

    const currentBookId = current.bookId ?? list[0]?.bookId ?? "GEN";
    const currentBookName = (current.bookId ? bookNameById.get(current.bookId) : null) ?? currentBookId ?? "…";
    const currentChap = current.chapter ?? 1;
    const currentVerse = current.verse ?? null;

    const pillLabel = useMemo(() => {
        return currentVerse == null ? `${currentBookName} ${currentChap}` : `${currentBookName} ${currentChap}:${currentVerse}`;
    }, [currentBookName, currentChap, currentVerse]);

    const [bookId, setBookId] = useState<string>(currentBookId);
    const [chapter, setChapter] = useState<number>(currentChap);
    const [verse, setVerse] = useState<number | null>(currentVerse);
    const [pendingChapter, setPendingChapter] = useState<boolean>(false);
    const [pendingVerse, setPendingVerse] = useState<boolean>(false);

    const chaptersCacheRef = useRef<Map<string, ChaptersPayload>>(new Map());
    const [chaptersMeta, setChaptersMeta] = useState<ChaptersPayload | null>(null);

    const selectedBook = useMemo(() => list.find((b) => b.bookId === bookId) ?? null, [list, bookId]);
    const bookName = selectedBook?.name ?? bookId;
    const testamentTag = (selectedBook?.testament ?? "").toUpperCase();
    const chapterMax = selectedBook?.chapters ?? 999;

    const openRef = useLatestRef(open);
    const phaseRef = useLatestRef(phase);

    // Load chapters
    useEffect(() => {
        if (!open) return;
        const cached = chaptersCacheRef.current.get(bookId) ?? null;
        if (cached) { setChaptersMeta(cached); return; }

        let alive = true;
        apiGetChapters(bookId)
            .then((p) => { if (alive) { chaptersCacheRef.current.set(bookId, p); setChaptersMeta(p); } })
            .catch(() => alive && setChaptersMeta(null));
        return () => { alive = false; };
    }, [open, bookId]);

    useEffect(() => { setChapter((c) => clampInt(c || 1, 1, chapterMax)); }, [chapterMax]);

    const verseMax = useMemo(() => {
        const meta = chaptersMeta;
        if (!meta) return 999;
        const row = meta.chapters.find((c) => c.chapter === chapter);
        return row?.verseCount ?? 999;
    }, [chaptersMeta, chapter]);

    useEffect(() => { setVerse((v) => (v == null ? null : clampInt(v, 1, verseMax))); }, [verseMax]);

    // Reset local state when closed
    useEffect(() => {
        if (open) return;
        setBookId(currentBookId);
        setChapter(currentChap);
        setVerse(currentVerse);
        setPendingChapter(false);
        setPendingVerse(false);
        setChaptersMeta(null);
        clearCloseTimer();
    }, [open, currentBookId, currentChap, currentVerse, clearCloseTimer]);

    const chapterOptions = useMemo(() => buildNumberOptions(1, chapterMax), [chapterMax]);
    const verseOptions = useMemo(() => buildNumberOptions(1, verseMax), [verseMax]);

    const titleBookPart = bookName;
    const titleNumPart = useMemo(() => {
        if (pendingChapter) return "";
        let s = ` ${chapter}`;
        if (!pendingVerse && verse != null) s += `:${verse}`;
        return s;
    }, [pendingChapter, pendingVerse, chapter, verse]);
    const titleTagPart = testamentTag;

    const closePopover = useCallback(() => {
        if (!openRef.current || phaseRef.current === "closing") return;
        setPhase("closing");
    }, [openRef, phaseRef]);

    const commit = useCallback(() => {
        const ch = pendingChapter ? 1 : chapter;
        const v: number | null = pendingVerse || verse == null ? null : verse;
        onJump(bookId, ch, v);
        closePopover();
    }, [bookId, chapter, verse, pendingChapter, pendingVerse, onJump, closePopover]);

    const onPickBook = useCallback((nextBookId: string) => {
        setBookId(nextBookId);
        setPendingChapter(true);
        setPendingVerse(true);
        setChapter(1);
        setVerse(null);
    }, []);

    const onPickChapter = useCallback((nextChapter: number) => {
        setPendingChapter(false);
        setChapter(nextChapter);
        setPendingVerse(true);
        setVerse(null);
    }, []);

    const onPickVerse = useCallback((nextVerse: number) => {
        setPendingVerse(false);
        setVerse(nextVerse);
    }, []);

    const openPopover = useCallback(() => {
        clearCloseTimer();
        setOpen(true);
        setPhase("opening");
    }, [clearCloseTimer]);

    const toggleOpen = useCallback(() => {
        if (openRef.current) closePopover(); else openPopover();
    }, [openRef, openPopover, closePopover]);

    // Positioning
    useLayoutEffect(() => {
        if (!open) return;
        const a = anchorRef.current;
        if (!a) return;

        let raf = 0;
        const update = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const r = a.getBoundingClientRect();
                setPopPos(computePopoverPos(r, POPOVER_W));
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
            window.removeEventListener("resize", update as any);
            window.removeEventListener("scroll", update as any, true);
            vv?.removeEventListener("resize", update as any);
            vv?.removeEventListener("scroll", update as any);
        };
    }, [open]);

    // Phase timing
    useEffect(() => {
        if (!open) return;
        if (reducedMotion) { setPhase("open"); return; }
        if (phase !== "opening") return;
        const id = window.setTimeout(() => setPhase("open"), 160);
        return () => window.clearTimeout(id);
    }, [open, phase, reducedMotion]);

    useEffect(() => {
        if (!open || phase !== "closing") return;
        if (reducedMotion) { setOpen(false); return; }
        const id = window.setTimeout(() => setOpen(false), 155);
        return () => window.clearTimeout(id);
    }, [open, phase, reducedMotion]);

    // Outside click + keyboard
    useEffect(() => {
        if (!open) return;
        const onPointerDownCapture = (e: PointerEvent) => {
            const t = e.target as Node | null;
            if (!t) return;
            const a = anchorRef.current;
            const pop = popoverElRef.current;
            if (a && a.contains(t)) return;
            if (pop && pop.contains(t)) return;

            clearCloseTimer();
            closeTimerRef.current = window.setTimeout(() => closePopover(), CLOSE_DELAY_MS);
        };

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") { e.preventDefault(); closePopover(); return; }
            if (e.key === "Enter") {
                const pop = popoverElRef.current;
                const activeEl = document.activeElement;
                if (pop && activeEl && pop.contains(activeEl)) { e.preventDefault(); commit(); }
            }
        };

        document.addEventListener("pointerdown", onPointerDownCapture, { capture: true });
        document.addEventListener("keydown", onKey, { capture: true });

        return () => {
            document.removeEventListener("pointerdown", onPointerDownCapture, { capture: true } as any);
            document.removeEventListener("keydown", onKey, { capture: true } as any);
        };
    }, [open, commit, closePopover, clearCloseTimer]);

    // Focus management
    useEffect(() => {
        if (!open) return;
        const id = requestAnimationFrame(() => {
            bookBtnMapRef.current.get(bookId)?.focus();
            bookBtnMapRef.current.get(bookId)?.scrollIntoView({ block: "center" });
            if (!pendingChapter) chapBtnMapRef.current.get(`c:${chapter}`)?.scrollIntoView({ block: "center" });
            if (!pendingVerse && verse != null) verseBtnMapRef.current.get(`v:${verse}`)?.scrollIntoView({ block: "center" });
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
            ? { opacity: 0, transform: "scale(0.97) translateY(8px)" }
            : phase === "closing"
                ? { opacity: 0, transform: "scale(0.985) translateY(4px)" }
                : { opacity: 1, transform: "scale(1) translateY(0)" };

    const popTransition = reducedMotion
        ? undefined
        : "opacity 165ms cubic-bezier(0.23, 1.0, 0.32, 1.0), transform 165ms cubic-bezier(0.23, 1.0, 0.32, 1.0)";

    const popover = open && popPos ? createPortal(
        <div
            id="bp-pos-popover"
            ref={popoverElRef}
            style={{
                ...sx.popover,
                left: popPos.left,
                top: popPos.top,
                width: popPos.width,
                height: popPos.height,
                ...popAnim,
                transition: popTransition,
                ["--bpAccent" as any]: ACCENT,
                ["--bpAccentSoft" as any]: ACCENT_SOFT,
                ["--bpAccentRing" as any]: ACCENT_RING,
            }}
            role="dialog"
            aria-label="Jump"
            aria-modal="false"
        >
            <div style={sx.topRow}>
                <div style={sx.titleWrap} aria-label="Selection summary" title={`${titleBookPart}${titleNumPart}${titleTagPart}`}>
                    <span style={sx.titleBook}>{titleBookPart}</span>
                    {titleNumPart && <span style={sx.titleNum}>{titleNumPart}</span>}
                    {titleTagPart && <span style={sx.titleTag}>{titleTagPart}</span>}
                </div>
                <button
                    type="button"
                    className="bp-go"
                    style={goStyle}
                    onClick={() => { if (canCommit) commit(); }}
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
                {/* Books */}
                <div style={sx.col}>
                    <div className="bp-scroll" style={sx.list} role="listbox" aria-label="Books">
                        {list.map((b) => {
                            const active = b.bookId === bookId;
                            return (
                                <ListItem
                                    key={b.bookId}
                                    active={active}
                                    onClick={() => onPickBook(b.bookId)}
                                    mapRef={bookBtnMapRef}
                                    itemKey={b.bookId}
                                    ariaLabel={`Select ${b.name}`}
                                >
                                    <span style={sx.itemLine}>
                                        <span style={{ ...sx.itemTextBook, ...(active ? sx.itemTextActive : null) }}>{b.name}</span>
                                    </span>
                                </ListItem>
                            );
                        })}
                    </div>
                </div>

                {/* Chapters */}
                <div style={sx.colNarrow}>
                    <div className="bp-scroll" style={sx.list} role="listbox" aria-label="Chapters">
                        {chapterOptions.map((o) => {
                            const n = o.value;
                            const active = !pendingChapter && n === chapter;
                            return (
                                <ListItem
                                    key={o.key}
                                    active={active}
                                    onClick={() => onPickChapter(n)}
                                    tight
                                    mapRef={chapBtnMapRef}
                                    itemKey={`c:${n}`}
                                    ariaLabel={`Chapter ${n}`}
                                >
                                    <span style={{ ...sx.numText, ...(active ? sx.numTextActive : null) }}>
                                        <span style={sx.prefixLabel}>CH</span> {n}
                                    </span>
                                </ListItem>
                            );
                        })}
                    </div>
                </div>

                {/* Verses */}
                <div style={sx.colNarrow}>
                    <div className="bp-scroll" style={sx.list} role="listbox" aria-label="Verses">
                        {!chaptersMeta ? (
                            <div style={sx.loadingBox}>Loading…</div>
                        ) : (
                            verseOptions.map((o) => {
                                const n = o.value;
                                const active = !pendingVerse && verse === n;
                                return (
                                    <ListItem
                                        key={o.key}
                                        active={active}
                                        onClick={() => onPickVerse(n)}
                                        tight
                                        mapRef={verseBtnMapRef}
                                        itemKey={`v:${n}`}
                                        ariaLabel={`Verse ${n}`}
                                    >
                                        <span style={{ ...sx.numText, ...(active ? sx.numTextActive : null) }}>
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
        document.body
    ) : null;

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
                onPointerDown={() => { clearCloseTimer(); setPressPill(true); }}
                onPointerUp={() => setPressPill(false)}
                onPointerCancel={() => setPressPill(false)}
                onPointerLeave={() => setPressPill(false)}
                title={pillLabel}
            >
                <span style={sx.pillTextStrong}>{currentBookName}</span>
                <span style={sx.pillTextMuted}>{currentVerse == null ? `${currentChap}` : `${currentChap}:${currentVerse}`}</span>
                <span style={sx.caret} aria-hidden>▾</span>
            </button>
            {popover}
        </div>
    );
}

const sx: Record<string, React.CSSProperties> = {
    root: { position: "relative", display: "flex", alignItems: "center" },

    pill: {
        display: "inline-grid",
        gridTemplateColumns: `minmax(0, 1fr) ${NUM_COL_W}px auto`,
        alignItems: "center",
        height: S(36),
        padding: `0 ${PILL_PAD_X}px`,
        borderRadius: 999,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        gap: PILL_GAP,
        cursor: "pointer",
        userSelect: "none",
        color: "inherit",
        lineHeight: 1,
        boxShadow: "0 8px 26px rgba(0,0,0,0.07)",
        transition: "transform 170ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 170ms cubic-bezier(0.23, 1, 0.32, 1), border-color 170ms ease, background 170ms ease",
        whiteSpace: "nowrap",
        textAlign: "left",
        WebkitTapHighlightColor: "transparent",
        outline: "none",
        willChange: "transform",
    },
    pillPressedFallback: { transform: "scale(0.965)" },
    pillOpen: {
        boxShadow: "0 16px 52px rgba(0,0,0,0.13)",
        transform: "translateY(-1px)",
        borderColor: "color-mix(in oklab, var(--focus) 65%, var(--hairline))",
        background: "color-mix(in oklab, var(--panel) 94%, transparent)",
    },

    pillTextStrong: {
        fontSize: 16.6 * SCALE,
        fontWeight: 730,
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
        fontSize: 16.6 * SCALE,
        letterSpacing: "-0.012em",
        color: "var(--muted)",
        opacity: 0.96,
        whiteSpace: "nowrap",
        textAlign: "right",
        fontVariantNumeric: "tabular-nums",
        justifySelf: "end",
    },
    caret: {
        fontSize: 11.5 * SCALE,
        color: "var(--muted)",
        opacity: 0.82,
        transform: "translateY(-0.5px)",
        justifySelf: "center",
        transition: "transform 160ms ease",
    },

    popover: {
        position: "fixed",
        zIndex: 2000,
        borderRadius: S(18),
        border: "1px solid color-mix(in oklab, var(--hairline) 90%, transparent)",
        background: "color-mix(in oklab, var(--bg) 94%, var(--panel))",
        padding: `${S(13)}px`,
        boxShadow: "0 32px 112px rgba(0,0,0,0.20), 0 4px 18px rgba(0,0,0,0.05)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        transformOrigin: "top center",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
    },

    topRow: {
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: S(10),
        alignItems: "center",
        marginBottom: S(12),
        flex: "0 0 auto",
    },
    titleWrap: {
        height: S(46),
        borderRadius: S(13),
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        padding: `0 ${S(13)}px`,
        display: "flex",
        alignItems: "center",
        minWidth: 0,
        gap: S(3),
    },
    titleBook: {
        fontSize: 14.2 * SCALE,
        fontWeight: 750,
        letterSpacing: "-0.015em",
        color: "var(--fg)",
        opacity: 0.97,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        minWidth: 0,
    },
    titleNum: {
        fontSize: 14.2 * SCALE,
        fontWeight: 640,
        letterSpacing: "-0.01em",
        color: "var(--fg)",
        opacity: 0.94,
        whiteSpace: "nowrap",
    },
    titleTag: {
        fontSize: 13.0 * SCALE,
        fontWeight: 460,
        letterSpacing: "0.02em",
        color: "var(--muted)",
        opacity: 0.78,
        whiteSpace: "nowrap",
    },

    goBtn: {
        height: S(46),
        width: S(46),
        borderRadius: S(13),
        border: "1px solid transparent",
        background: "var(--fg)",
        color: "var(--bg)",
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        fontSize: 18 * SCALE,
        fontWeight: 700,
        boxShadow: "0 12px 36px rgba(0,0,0,0.15)",
        transition: "transform 160ms cubic-bezier(0.23, 1.0, 0.32, 1.0), box-shadow 160ms ease",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
        outline: "none",
    },
    goBtnDisabled: { opacity: 0.52, cursor: "not-allowed" },
    goPressedFallback: { transform: "scale(0.94)" },

    bodyRow: {
        display: "grid",
        gridTemplateColumns: `1fr ${COL_NARROW_W}px ${COL_NARROW_W}px`,
        gap: S(10),
        alignItems: "stretch",
        minHeight: 0,
        flex: "1 1 auto",
    },
    col: { minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: S(8) },
    colNarrow: { minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: S(8) },

    list: {
        borderRadius: S(14),
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
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
        gridTemplateColumns: "1fr 12px",
        alignItems: "center",
        gap: S(10),
        padding: `${S(10)}px ${S(12)}px`,
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
        gridTemplateColumns: "1fr 12px",
        alignItems: "center",
        gap: S(10),
        padding: `${S(8)}px ${S(10)}px`,
        border: "none",
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
        outline: "none",
    },
    itemActive: {
        background: ACCENT_SOFT,
        boxShadow: "inset 0 0 0 1px var(--bpAccentRing)",
    },
    activeBar: {
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: 3.5,
        background: ACCENT,
        borderTopLeftRadius: S(14),
        borderBottomLeftRadius: S(14),
    },

    itemLine: { display: "inline-flex", alignItems: "baseline", gap: S(9), minWidth: 0 },
    itemTextBook: {
        fontSize: 14.8 * SCALE,
        fontWeight: 610,
        letterSpacing: "-0.01em",
        color: "var(--fg)",
        opacity: 0.96,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        minWidth: 0,
    },
    itemTextActive: { opacity: 1, fontWeight: 670 },

    numText: {
        fontSize: 14.4 * SCALE,
        letterSpacing: "-0.01em",
        color: "var(--fg)",
        opacity: 0.93,
        fontWeight: 550,
        fontVariantNumeric: "tabular-nums",
    },
    numTextActive: { opacity: 1, fontWeight: 660 },

    prefixLabel: {
        fontSize: 11.2 * SCALE,
        fontWeight: 480,
        color: "var(--muted)",
        opacity: 0.65,
        letterSpacing: "0.05em",
        marginRight: S(4),
    },

    selDot: {
        width: S(9),
        height: S(9),
        borderRadius: 999,
        border: "1px solid var(--hairline)",
        background: "transparent",
        opacity: 0.88,
        justifySelf: "end",
    },
    selDotOn: {
        background: ACCENT,
        border: "1px solid transparent",
        opacity: 0.82,
    },

    loadingBox: {
        borderRadius: S(14),
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        display: "grid",
        placeItems: "center",
        fontSize: 12.5 * SCALE,
        color: "var(--muted)",
        minHeight: 0,
        flex: "1 1 auto",
    },
};