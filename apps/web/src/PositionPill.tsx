// apps/web/src/PositionPill.tsx
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiGetChapters, type BookRow, type ChaptersPayload } from "./api";

type Props = {
    styles: Record<string, React.CSSProperties>;
    books: BookRow[] | null;
    current: { label: string; ord: number; bookId: string | null; chapter: number | null; verse: number | null };
    onJump: (bookId: string, chapter: number, verse: number | null) => void;
};

function pressedStyle(styles: Record<string, React.CSSProperties>): React.CSSProperties | null {
    return ((styles as any).btnPressed as React.CSSProperties | undefined) ?? ((styles as any).buttonPressed ?? null);
}
function clampInt(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

type WheelOption = { key: string; label: string; value: number };

// ---- scaled down (keep proportions) ----
const SCALE = 0.88;

const POPOVER_W = Math.round(560 * SCALE);
const POPOVER_MAX_H = Math.round(352 * SCALE);
const POPOVER_MARGIN = 16;

// cherry red accent (selection only)
const ACCENT = "#d10b2f";
const ACCENT_SOFT = "rgba(209, 11, 47, 0.11)";
const ACCENT_RING = "rgba(209, 11, 47, 0.28)";

// list inner breathing: space inside scroll boxes
const LIST_PAD = Math.round(16 * SCALE);

function buildNumberOptions(min: number, max: number): WheelOption[] {
    const out: WheelOption[] = [];
    for (let i = min; i <= max; i++) out.push({ key: String(i), label: String(i), value: i });
    return out;
}

type PopPos = Readonly<{ left: number; top: number; height: number; width: number }>;

function computePopoverPos(anchor: DOMRect, desiredWidth: number): PopPos {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = POPOVER_MARGIN;

    const width = Math.min(desiredWidth, vw - margin * 2);

    // center under pill
    const cx = anchor.left + anchor.width / 2;
    const left = clampInt(Math.round(cx - width / 2), margin, Math.max(margin, vw - width - margin));

    const belowTop = Math.round(anchor.bottom + 14);
    const belowAvail = vh - belowTop - margin;

    const cap = Math.min(POPOVER_MAX_H, vh - margin * 2);

    if (belowAvail >= 220) return { left, top: belowTop, height: Math.min(cap, belowAvail), width };

    // flip above
    const top = clampInt(Math.round(anchor.top - 14 - cap), margin, Math.max(margin, vh - cap - margin));
    const aboveAvail = Math.round(anchor.top - top - 14);
    return { left, top, height: Math.min(cap, Math.max(220, aboveAvail)), width };
}

function setRefInMap(map: Map<string, HTMLButtonElement | null>, key: string, el: HTMLButtonElement | null): void {
    map.set(key, el);
}

export function PositionPill({ styles, books, current, onJump }: Props) {
    const anchorRef = useRef<HTMLButtonElement | null>(null);
    const list = books ?? [];

    const [open, setOpen] = useState(false);
    const [pressPill, setPressPill] = useState(false);
    const [pressGo, setPressGo] = useState(false);

    const [popPos, setPopPos] = useState<PopPos | null>(null);

    const bookBtnRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
    const chapBtnRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
    const verseBtnRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

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

    // do NOT auto-select chap/verse when changing book
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

    useEffect(() => {
        if (!open) return;

        const cached = chaptersCacheRef.current.get(bookId) ?? null;
        if (cached) {
            setChaptersMeta(cached);
            return;
        }

        let alive = true;
        apiGetChapters(bookId)
            .then((p) => {
                if (!alive) return;
                chaptersCacheRef.current.set(bookId, p);
                setChaptersMeta(p);
            })
            .catch(() => alive && setChaptersMeta(null));

        return () => {
            alive = false;
        };
    }, [open, bookId]);

    useEffect(() => {
        setChapter((c) => clampInt(c || 1, 1, chapterMax));
    }, [chapterMax]);

    const verseMax = useMemo(() => {
        const meta = chaptersMeta;
        if (!meta) return 999;
        const row = meta.chapters.find((c) => c.chapter === chapter);
        return row?.verseCount ?? 999;
    }, [chaptersMeta, chapter]);

    useEffect(() => {
        setVerse((v) => {
            if (v == null) return null;
            return clampInt(v, 1, verseMax);
        });
    }, [verseMax]);

    // resync on close
    useEffect(() => {
        if (open) return;
        setBookId(currentBookId);
        setChapter(currentChap);
        setVerse(currentVerse);
        setPendingChapter(false);
        setPendingVerse(false);
    }, [open, currentBookId, currentChap, currentVerse]);

    const chapterOptions = useMemo(() => buildNumberOptions(1, chapterMax), [chapterMax]);
    const verseOptions = useMemo(() => buildNumberOptions(1, verseMax), [verseMax]);

    // INLINE titleline (single line): Book 12:34  OT
    const titleLine = useMemo(() => {
        const tag = testamentTag ? `  ${testamentTag}` : "";
        if (pendingChapter) return `${bookName}${tag}`;
        if (pendingVerse || verse == null) return `${bookName} ${chapter}${tag}`;
        return `${bookName} ${chapter}:${verse}${tag}`;
    }, [bookName, testamentTag, pendingChapter, pendingVerse, chapter, verse]);

    function commit(): void {
        const ch = pendingChapter ? 1 : chapter;
        const v: number | null = pendingVerse || verse == null ? null : verse;

        onJump(bookId, ch, v);
        setOpen(false);
    }

    useLayoutEffect(() => {
        if (!open) return;
        const a = anchorRef.current;
        if (!a) return;

        const update = () => {
            const r = a.getBoundingClientRect();
            setPopPos(computePopoverPos(r, POPOVER_W));
        };

        update();
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        return () => {
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const onDown = (e: MouseEvent) => {
            const t = e.target as Node | null;
            if (!t) return;
            const a = anchorRef.current;
            const pop = document.getElementById("bp-pos-popover");
            if (a && a.contains(t)) return;
            if (pop && pop.contains(t)) return;
            setOpen(false);
        };

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter") {
                const pop = document.getElementById("bp-pos-popover");
                if (!pop) return;
                const a = document.activeElement;
                if (a && pop.contains(a)) {
                    e.preventDefault();
                    commit();
                }
            }
        };

        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, bookId, chapter, verse, pendingChapter, pendingVerse]);

    // initial focus (no input now)
    useEffect(() => {
        if (!open) return;
        requestAnimationFrame(() => (bookBtnRefs.current.get(bookId) ?? null)?.focus());
    }, [open, bookId]);

    const pillStyle: React.CSSProperties = {
        ...sx.pill,
        ...(pressPill ? (pressedStyle(styles) ?? {}) : null),
        ...(open ? sx.pillOpen : null),
    };

    const goStyle: React.CSSProperties = {
        ...sx.goBtn,
        ...(pressGo ? (pressedStyle(styles) ?? sx.goPressedFallback) : null),
        ...(pendingChapter ? sx.goBtnDim : null),
    };

    function onPickBook(nextBookId: string): void {
        setBookId(nextBookId);
        setPendingChapter(true);
        setPendingVerse(true);
        setChapter(1);
        setVerse(null);
    }

    function onPickChapter(nextChapter: number): void {
        setPendingChapter(false);
        setChapter(nextChapter);
        setPendingVerse(true);
        setVerse(null);
    }

    function onPickVerse(nextVerse: number): void {
        setPendingVerse(false);
        setVerse(nextVerse);
    }

    const popover =
        open && popPos
            ? createPortal(
                <div
                    id="bp-pos-popover"
                    style={{
                        ...sx.popover,
                        left: popPos.left,
                        top: popPos.top,
                        width: popPos.width,
                        height: popPos.height,
                        ["--bpAccent" as any]: ACCENT,
                        ["--bpAccentSoft" as any]: ACCENT_SOFT,
                        ["--bpAccentRing" as any]: ACCENT_RING,
                    }}
                    role="dialog"
                    aria-label="Jump"
                >
                    <style>{`
#bp-pos-popover .bp-scroll{
  scrollbar-width: thin;
  scrollbar-color: var(--hairline) transparent;
}
#bp-pos-popover .bp-scroll::-webkit-scrollbar{ width: 10px; height: 10px; }
#bp-pos-popover .bp-scroll::-webkit-scrollbar-track{ background: transparent !important; }
#bp-pos-popover .bp-scroll::-webkit-scrollbar-thumb{
  background: var(--hairline);
  border-radius: 999px;
  border: 3px solid transparent;
  background-clip: padding-box;
}
#bp-pos-popover .bp-scroll::-webkit-scrollbar-thumb:hover{
  background: var(--focusRing);
  border: 3px solid transparent;
  background-clip: padding-box;
}
#bp-pos-popover .bp-scroll::-webkit-scrollbar-corner{ background: transparent; }

#bp-pos-popover button.bp-row:hover{ background: rgba(209, 11, 47, 0.040); }

#bp-pos-popover button.bp-row:focus-visible,
#bp-pos-popover button.bp-pill:focus-visible{
  outline: none;
  box-shadow: inset 0 0 0 1px var(--bpAccentRing);
}

#bp-pos-popover button.bp-go:focus-visible{
  outline: none;
  box-shadow: 0 0 0 3px var(--bpAccentRing);
}
            `}</style>

                    {/* TOP: INLINE titleline + go */}
                    <div style={sx.topRow}>
                        <div style={sx.titleWrap} aria-label="Selection summary" title={titleLine}>
                            <span style={sx.titleLine}>{titleLine}</span>
                        </div>

                        <button
                            type="button"
                            className="bp-go"
                            style={goStyle}
                            onClick={commit}
                            onMouseDown={() => setPressGo(true)}
                            onMouseUp={() => setPressGo(false)}
                            onMouseLeave={() => setPressGo(false)}
                            onTouchStart={() => setPressGo(true)}
                            onTouchEnd={() => setPressGo(false)}
                            aria-label="Go"
                            title="Go"
                        >
                            Go
                        </button>
                    </div>

                    {/* BODY */}
                    <div style={sx.bodyRow}>
                        <div style={sx.col}>
                            <div style={sx.colHeader}>Book</div>
                            <div className="bp-scroll" style={sx.list} role="listbox" aria-label="Books">
                                {list.map((b, idx) => {
                                    const active = b.bookId === bookId;
                                    const tag = (b.testament ?? "").toUpperCase();

                                    return (
                                        <button
                                            key={b.bookId}
                                            ref={(el) => setRefInMap(bookBtnRefs.current, b.bookId, el)}
                                            className="bp-row"
                                            type="button"
                                            style={{
                                                ...sx.item,
                                                ...(idx > 0 ? sx.itemSep : null),
                                                ...(active ? sx.itemActive : null),
                                            }}
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => onPickBook(b.bookId)}
                                            aria-label={`Select ${b.name}`}
                                        >
                                            {active ? <span style={sx.activeBar} aria-hidden /> : null}
                                            <span style={sx.itemLine}>
                          <span style={{ ...sx.itemText, ...(active ? sx.itemTextActive : null) }}>{b.name}</span>
                                                {tag ? <span style={{ ...sx.inlineTag, ...(active ? sx.inlineTagActive : null) }}>{tag}</span> : null}
                        </span>
                                            <span style={{ ...sx.selDot, ...(active ? sx.selDotOn : null) }} aria-hidden />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={sx.colNarrow}>
                            <div style={sx.colHeader}>Chapter</div>
                            <div className="bp-scroll" style={sx.list} role="listbox" aria-label="Chapters">
                                {chapterOptions.map((o, idx) => {
                                    const n = o.value;
                                    const active = !pendingChapter && n === chapter;

                                    return (
                                        <button
                                            key={o.key}
                                            ref={(el) => setRefInMap(chapBtnRefs.current, `c:${n}`, el)}
                                            className="bp-row"
                                            type="button"
                                            style={{
                                                ...sx.itemTight,
                                                ...(idx > 0 ? sx.itemSep : null),
                                                ...(active ? sx.itemActive : null),
                                            }}
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => onPickChapter(n)}
                                            aria-label={`Chapter ${n}`}
                                        >
                                            {active ? <span style={sx.activeBar} aria-hidden /> : null}
                                            <span style={{ ...sx.numText, ...(active ? sx.numTextActive : null) }}>{n}</span>
                                            <span style={{ ...sx.selDot, ...(active ? sx.selDotOn : null) }} aria-hidden />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={sx.colNarrow}>
                            <div style={sx.colHeader}>Verse</div>
                            {!chaptersMeta ? (
                                <div style={sx.loadingBox}>Loading…</div>
                            ) : (
                                <div className="bp-scroll" style={sx.list} role="listbox" aria-label="Verses">
                                    {verseOptions.map((o, idx) => {
                                        const n = o.value;
                                        const active = !pendingVerse && verse === n;

                                        return (
                                            <button
                                                key={o.key}
                                                ref={(el) => setRefInMap(verseBtnRefs.current, `v:${n}`, el)}
                                                className="bp-row"
                                                type="button"
                                                style={{
                                                    ...sx.itemTight,
                                                    ...(idx > 0 ? sx.itemSep : null),
                                                    ...(active ? sx.itemActive : null),
                                                }}
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => onPickVerse(n)}
                                                aria-label={`Verse ${n}`}
                                            >
                                                {active ? <span style={sx.activeBar} aria-hidden /> : null}
                                                <span style={{ ...sx.numText, ...(active ? sx.numTextActive : null) }}>{o.label}</span>
                                                <span style={{ ...sx.selDot, ...(active ? sx.selDotOn : null) }} aria-hidden />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
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
                onClick={() => setOpen((v) => !v)}
                onMouseDown={() => setPressPill(true)}
                onMouseUp={() => setPressPill(false)}
                onMouseLeave={() => setPressPill(false)}
                onTouchStart={() => setPressPill(true)}
                onTouchEnd={() => setPressPill(false)}
                title={pillLabel}
            >
                <span style={sx.pillTextStrong}>{currentBookName}</span>
                <span style={sx.pillTextMuted}>{currentVerse == null ? `${currentChap}` : `${currentChap}:${currentVerse}`}</span>
                <span style={sx.caret} aria-hidden>
          ▾
        </span>
            </button>

            {popover}
        </div>
    );
}

const sx: Record<string, React.CSSProperties> = {
    root: { position: "relative", display: "flex", alignItems: "center" },

    pill: {
        height: Math.round(34 * SCALE),
        padding: `0 ${Math.round(12 * SCALE)}px`,
        borderRadius: 999,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        display: "inline-flex",
        alignItems: "center",
        gap: Math.round(8 * SCALE),
        cursor: "pointer",
        userSelect: "none",
        color: "inherit",
        lineHeight: 1,
        boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        transition: "transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease",
        whiteSpace: "nowrap",
    },
    pillOpen: {
        boxShadow: "0 18px 56px rgba(0,0,0,0.14)",
        transform: "translateY(-0.5px)",
        borderColor: "var(--focus)",
    },
    pillTextStrong: {
        fontSize: 12.5 * SCALE,
        fontWeight: 650,
        letterSpacing: "-0.01em",
        color: "var(--fg)",
        opacity: 0.92,
        maxWidth: Math.round(190 * SCALE),
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    pillTextMuted: {
        fontSize: 12.5 * SCALE,
        letterSpacing: "-0.01em",
        color: "var(--muted)",
        opacity: 0.95,
    },
    caret: {
        fontSize: 10 * SCALE,
        color: "var(--muted)",
        opacity: 0.75,
        transform: "translateY(-0.5px)",
        marginLeft: Math.round(2 * SCALE),
    },

    popover: {
        position: "fixed",
        zIndex: 2000,
        borderRadius: Math.round(18 * SCALE),
        border: "1px solid var(--hairline)",
        background: "var(--bg)",
        padding: `${Math.round(18 * SCALE)}px`,
        boxShadow: "0 30px 120px rgba(0,0,0,0.22)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 0,
    },

    topRow: {
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: Math.round(12 * SCALE),
        alignItems: "center",
        marginBottom: Math.round(14 * SCALE),
        flex: "0 0 auto",
    },

    titleWrap: {
        height: Math.round(52 * SCALE),
        borderRadius: Math.round(13 * SCALE),
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        padding: `0 ${Math.round(12 * SCALE)}px`,
        display: "flex",
        alignItems: "center",
        minWidth: 0,
    },
    titleLine: {
        fontSize: 13 * SCALE,
        fontWeight: 720,
        letterSpacing: "-0.01em",
        color: "var(--fg)",
        opacity: 0.93,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        minWidth: 0,
    },

    goBtn: {
        height: Math.round(52 * SCALE),
        padding: `0 ${Math.round(16 * SCALE)}px`,
        borderRadius: Math.round(13 * SCALE),
        border: "1px solid transparent",
        background: "var(--fg)",
        color: "var(--bg)",
        cursor: "pointer",
        lineHeight: 1,
        userSelect: "none",
        whiteSpace: "nowrap",
        fontSize: 12.5 * SCALE,
        fontWeight: 760,
        letterSpacing: "-0.01em",
        boxShadow: "0 14px 44px rgba(0,0,0,0.16)",
        transition: "transform 140ms ease, opacity 140ms ease",
    },
    goBtnDim: { opacity: 0.95 },
    goPressedFallback: {
        transform: "translateY(1px) scale(0.99)",
        opacity: 0.96,
    },

    bodyRow: {
        display: "grid",
        gridTemplateColumns: `1fr ${Math.round(132 * SCALE)}px ${Math.round(132 * SCALE)}px`,
        gap: Math.round(12 * SCALE),
        alignItems: "stretch",
        minHeight: 0,
        flex: "1 1 auto",
    },

    col: { minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: Math.round(8 * SCALE) },
    colNarrow: { minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: Math.round(8 * SCALE) },

    colHeader: {
        height: Math.round(22 * SCALE),
        display: "flex",
        alignItems: "center",
        fontSize: 10 * SCALE,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--muted)",
        opacity: 0.85,
        paddingInline: 2,
        userSelect: "none",
        flex: "0 0 auto",
    },

    list: {
        borderRadius: Math.round(14 * SCALE),
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
        gap: Math.round(10 * SCALE),
        padding: `${Math.round(10 * SCALE)}px ${Math.round(12 * SCALE)}px`,
        border: "none",
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
    },
    itemTight: {
        width: "100%",
        position: "relative",
        textAlign: "left",
        display: "grid",
        gridTemplateColumns: "1fr 12px",
        alignItems: "center",
        gap: Math.round(10 * SCALE),
        padding: `${Math.round(8 * SCALE)}px ${Math.round(10 * SCALE)}px`,
        border: "none",
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
    },
    itemSep: { borderTop: "1px solid var(--hairline)" },

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
        opacity: 0.96,
        borderTopLeftRadius: Math.round(14 * SCALE),
        borderBottomLeftRadius: Math.round(14 * SCALE),
    },

    itemLine: {
        display: "inline-flex",
        alignItems: "baseline",
        gap: Math.round(10 * SCALE),
        minWidth: 0,
    },
    itemText: {
        fontSize: 12.75 * SCALE,
        letterSpacing: "-0.01em",
        color: "var(--fg)",
        opacity: 0.92,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        minWidth: 0,
    },
    itemTextActive: { opacity: 1 },

    inlineTag: {
        fontSize: 10.5 * SCALE,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--muted)",
        opacity: 0.62,
        whiteSpace: "nowrap",
        transform: "translateY(-0.5px)",
    },
    inlineTagActive: { opacity: 0.78 },

    numText: {
        fontSize: 13 * SCALE,
        letterSpacing: "-0.01em",
        color: "var(--fg)",
        opacity: 0.78,
    },
    numTextActive: { opacity: 1 },

    selDot: {
        width: Math.round(9 * SCALE),
        height: Math.round(9 * SCALE),
        borderRadius: 999,
        border: "1px solid var(--hairline)",
        background: "transparent",
        opacity: 0.85,
        justifySelf: "end",
        boxShadow: "none",
    },
    selDotOn: {
        background: "var(--bpAccent)",
        border: "1px solid transparent",
        opacity: 0.72,
    },

    loadingBox: {
        borderRadius: Math.round(14 * SCALE),
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        display: "grid",
        placeItems: "center",
        fontSize: 12 * SCALE,
        color: "var(--muted)",
        minHeight: 0,
        flex: "1 1 auto",
    },
};