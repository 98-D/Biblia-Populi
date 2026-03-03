import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { apiGetChapters, type BookRow, type ChaptersPayload } from "./api";

type Props = {
    styles: Record<string, React.CSSProperties>;
    books: BookRow[] | null;
    current: { label: string; ord: number; bookId: string | null; chapter: number | null; verse: number | null };
    onJump: (bookId: string, chapter: number, verse: number | null) => void;
};

// ---- compact + premium ----
const SCALE = 0.88;
const S = (n: number) => Math.round(n * SCALE);

const POPOVER_W = S(465);        // narrower overall
const COL_NARROW_W = S(99);      // each column visibly slimmer
const POPOVER_MAX_H = S(352);
const POPOVER_MARGIN = 16;
const LIST_PAD = S(14);

const ACCENT = "#d10b2f";
const ACCENT_SOFT = "rgba(209, 11, 47, 0.11)";
const ACCENT_RING = "rgba(209, 11, 47, 0.28)";

function pressedStyle(styles: Record<string, React.CSSProperties>): React.CSSProperties | null {
    return (styles as any).btnPressed ?? (styles as any).buttonPressed ?? null;
}

function clampInt(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

type WheelOption = { key: string; label: string; value: number };

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

function setRefInMap(map: Map<string, HTMLButtonElement | null>, key: string, el: HTMLButtonElement | null): void {
    map.set(key, el);
}

const ListItem = React.memo(
    ({
         active,
         onClick,
         children,
         tight = false,
         refCb,
         ariaLabel,
     }: {
        active: boolean;
        onClick: () => void;
        children: React.ReactNode;
        tight?: boolean;
        refCb?: (el: HTMLButtonElement | null) => void;
        ariaLabel?: string;
    }) => {
        const baseStyle = tight ? sx.itemTight : sx.item;
        return (
            <button
                type="button"
                className="bp-row"
                ref={refCb}
                style={{ ...baseStyle, ...(active ? sx.itemActive : null) }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={onClick}
                aria-label={ariaLabel}
            >
                {active ? <span style={sx.activeBar} aria-hidden /> : null}
                {children}
                <span style={{ ...sx.selDot, ...(active ? sx.selDotOn : null) }} aria-hidden />
            </button>
        );
    }
);

export function PositionPill({ styles, books, current, onJump }: Props) {
    const anchorRef = useRef<HTMLButtonElement | null>(null);
    const list = books ?? [];

    const [open, setOpen] = useState(false);
    const [popoverEntered, setPopoverEntered] = useState(false);
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
        return () => { alive = false; };
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
        setVerse((v) => (v == null ? null : clampInt(v, 1, verseMax)));
    }, [verseMax]);

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

    const titleBookPart = bookName;
    const titleNumPart = useMemo(() => {
        if (pendingChapter) return "";
        let s = ` ${chapter}`;
        if (!pendingVerse && verse != null) s += `:${verse}`;
        return s;
    }, [pendingChapter, pendingVerse, chapter, verse]);
    const titleTagPart = testamentTag;

    const closePopover = useCallback(() => {
        setPopoverEntered(false);
        setTimeout(() => setOpen(false), 180);
    }, []);

    const commit = useCallback(() => {
        const ch = pendingChapter ? 1 : chapter;
        const v: number | null = pendingVerse || verse == null ? null : verse;
        onJump(bookId, ch, v);
        closePopover();
    }, [bookId, chapter, verse, pendingChapter, pendingVerse, onJump, closePopover]);

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
        if (open) {
            requestAnimationFrame(() => setPopoverEntered(true));
        }
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
            closePopover();
        };

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") closePopover();
            if (e.key === "Enter") {
                const pop = document.getElementById("bp-pos-popover");
                if (!pop) return;
                const activeEl = document.activeElement;
                if (activeEl && pop.contains(activeEl)) {
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
    }, [open, commit, closePopover]);

    useEffect(() => {
        if (!open) return;
        requestAnimationFrame(() => {
            bookBtnRefs.current.get(bookId)?.focus();
            bookBtnRefs.current.get(bookId)?.scrollIntoView({ block: "center", behavior: "smooth" });
            if (!pendingChapter) chapBtnRefs.current.get(`c:${chapter}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
            if (!pendingVerse && verse != null) verseBtnRefs.current.get(`v:${verse}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
    }, [open, bookId, chapter, verse, pendingChapter, pendingVerse]);

    const pillStyle: React.CSSProperties = {
        ...sx.pill,
        ...(pressPill ? pressedStyle(styles) ?? sx.pillPressedFallback : null),
        ...(open ? sx.pillOpen : null),
    };

    const goStyle: React.CSSProperties = {
        ...sx.goBtn,
        ...(pressGo ? pressedStyle(styles) ?? sx.goPressedFallback : null),
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

    const popover = open && popPos ? (
        createPortal(
            <div
                id="bp-pos-popover"
                style={{
                    ...sx.popover,
                    left: popPos.left,
                    top: popPos.top,
                    width: popPos.width,
                    height: popPos.height,
                    opacity: popoverEntered ? 1 : 0,
                    transform: popoverEntered ? "scale(1)" : "scale(0.965) translateY(10px)",
                    transition: "opacity 180ms cubic-bezier(0.23, 1.0, 0.32, 1.0), transform 180ms cubic-bezier(0.23, 1.0, 0.32, 1.0)",
                    ["--bpAccent" as any]: ACCENT,
                    ["--bpAccentSoft" as any]: ACCENT_SOFT,
                    ["--bpAccentRing" as any]: ACCENT_RING,
                }}
                role="dialog"
                aria-label="Jump"
            >
                <style>{`
          #bp-pos-popover .bp-scroll {
            scrollbar-width: thin;
            scrollbar-color: var(--hairline) transparent;
          }
          #bp-pos-popover .bp-scroll::-webkit-scrollbar {
            width: 10px; height: 10px;
          }
          #bp-pos-popover .bp-scroll::-webkit-scrollbar-track { background: transparent !important; }
          #bp-pos-popover .bp-scroll::-webkit-scrollbar-thumb {
            background: var(--hairline);
            border-radius: 999px;
            border: 3px solid transparent;
            background-clip: padding-box;
          }
          #bp-pos-popover .bp-scroll::-webkit-scrollbar-thumb:hover { background: var(--focusRing); }

          #bp-pos-popover button.bp-row {
            transition: background 140ms ease, box-shadow 140ms ease, transform 90ms ease;
          }
          #bp-pos-popover button.bp-row:active { transform: scale(0.982); }
          #bp-pos-popover button.bp-row:hover { background: rgba(209, 11, 47, 0.040); }
          #bp-pos-popover button.bp-row:focus-visible,
          #bp-pos-popover button.bp-pill:focus-visible {
            outline: none;
            box-shadow: inset 0 0 0 1px var(--bpAccentRing);
          }

          #bp-pos-popover button.bp-go {
            transition: all 140ms cubic-bezier(0.23, 1.0, 0.32, 1.0);
          }
          #bp-pos-popover button.bp-go:active { transform: scale(0.96) translateY(1px); }
        `}</style>

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
                        onClick={commit}
                        onMouseDown={() => setPressGo(true)}
                        onMouseUp={() => setPressGo(false)}
                        onMouseLeave={() => setPressGo(false)}
                        onTouchStart={() => setPressGo(true)}
                        onTouchEnd={() => setPressGo(false)}
                        aria-label="Confirm jump"
                        title="Confirm"
                    >
                        →
                    </button>
                </div>

                <div style={sx.bodyRow}>
                    {/* Books – no OT/NT tags, narrower column */}
                    <div style={sx.col}>
                        <div className="bp-scroll" style={sx.list} role="listbox" aria-label="Books">
                            {list.map((b) => {
                                const active = b.bookId === bookId;
                                return (
                                    <ListItem
                                        key={b.bookId}
                                        active={active}
                                        onClick={() => onPickBook(b.bookId)}
                                        refCb={(el) => setRefInMap(bookBtnRefs.current, b.bookId, el)}
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
                                        refCb={(el) => setRefInMap(chapBtnRefs.current, `c:${n}`, el)}
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
                                            refCb={(el) => setRefInMap(verseBtnRefs.current, `v:${n}`, el)}
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
        )
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
                onClick={() => setOpen((v) => !v)}
                onMouseDown={() => setPressPill(true)}
                onMouseUp={() => setPressPill(false)}
                onMouseLeave={() => setPressPill(false)}
                onTouchStart={() => setPressPill(true)}
                onTouchEnd={() => setPressPill(false)}
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
    root: { position: "relative", display: "flex", alignItems: "center" },

    pill: {
        height: S(36),
        padding: `0 ${S(13)}px`,
        borderRadius: 999,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        display: "inline-flex",
        alignItems: "center",
        gap: S(8),
        cursor: "pointer",
        userSelect: "none",
        color: "inherit",
        lineHeight: 1,
        boxShadow: "0 10px 32px rgba(0,0,0,0.08)",
        transition: "transform 160ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 160ms cubic-bezier(0.23, 1, 0.32, 1), border-color 160ms ease",
        whiteSpace: "nowrap",
    },
    pillPressedFallback: { transform: "scale(0.96)" },
    pillOpen: {
        boxShadow: "0 18px 60px rgba(0,0,0,0.14)",
        transform: "translateY(-1px)",
        borderColor: "var(--focus)",
    },

    pillTextStrong: {
        fontSize: 13.6 * SCALE,
        fontWeight: 640,
        letterSpacing: "-0.01em",
        color: "var(--fg)",
        opacity: 0.93,
        maxWidth: S(200),
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    pillTextMuted: {
        fontSize: 13.6 * SCALE,
        letterSpacing: "-0.01em",
        color: "var(--muted)",
        opacity: 0.94,
    },
    caret: {
        fontSize: 11 * SCALE,
        color: "var(--muted)",
        opacity: 0.78,
        transform: "translateY(-0.5px)",
        marginLeft: S(2),
    },

    popover: {
        position: "fixed",
        zIndex: 2000,
        borderRadius: S(18),
        border: "1px solid var(--hairline)",
        background: "var(--bg)",
        padding: `${S(13)}px`,
        boxShadow: "0 32px 120px rgba(0,0,0,0.22), 0 4px 20px rgba(0,0,0,0.06)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 0,
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

    // Proper cascading weights (heaviest → lightest) + slightly lighter overall
    titleBook: {
        fontSize: 14.2 * SCALE,
        fontWeight: 750,
        letterSpacing: "-0.015em",
        color: "var(--fg)",
        opacity: 0.96,
        whiteSpace: "nowrap",
    },
    titleNum: {
        fontSize: 14.2 * SCALE,
        fontWeight: 640,
        letterSpacing: "-0.01em",
        color: "var(--fg)",
        opacity: 0.93,
        whiteSpace: "nowrap",
    },
    titleTag: {
        fontSize: 13.0 * SCALE,
        fontWeight: 460,
        letterSpacing: "0.02em",
        color: "var(--muted)",
        opacity: 0.75,
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
        boxShadow: "0 12px 36px rgba(0,0,0,0.16)",
        transition: "transform 140ms cubic-bezier(0.23, 1.0, 0.32, 1.0), box-shadow 140ms ease",
    },
    goBtnDim: { opacity: 0.92 },
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
        width: 3.5,
        background: "var(--bpAccent)",
        borderTopLeftRadius: S(14),
        borderBottomLeftRadius: S(14),
    },

    itemLine: { display: "inline-flex", alignItems: "baseline", gap: S(9), minWidth: 0 },

    itemTextBook: {
        fontSize: 14.8 * SCALE,
        fontWeight: 590,
        letterSpacing: "-0.01em",
        color: "var(--fg)",
        opacity: 0.94,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        minWidth: 0,
    },
    itemTextActive: { opacity: 1 },

    numText: {
        fontSize: 14.4 * SCALE,
        letterSpacing: "-0.01em",
        color: "var(--fg)",
        opacity: 0.91,
        fontWeight: 540,
    },
    numTextActive: { opacity: 1, fontWeight: 640 },

    prefixLabel: {
        fontSize: 11.2 * SCALE,
        fontWeight: 480,
        color: "var(--muted)",
        opacity: 0.62,
        letterSpacing: "0.05em",
        marginRight: S(4),
    },

    selDot: {
        width: S(9),
        height: S(9),
        borderRadius: 999,
        border: "1px solid var(--hairline)",
        background: "transparent",
        opacity: 0.86,
        justifySelf: "end",
    },
    selDotOn: {
        background: "var(--bpAccent)",
        border: "1px solid transparent",
        opacity: 0.78,
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