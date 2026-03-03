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

function norm(s: string): string {
    return s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

type WheelOption = { key: string; label: string; value: number | null };

const POPOVER_W = 560;
const POPOVER_MAX_H = 344; // compact, slightly roomier for padding
const TOP_ROW_H = 48; // filter row + spacing
const COL_HDR_H = 22; // "Book / Chapter / Verse"
const BODY_MIN_H = 204;

function buildNumberOptions(min: number, max: number): WheelOption[] {
    const out: WheelOption[] = [];
    for (let i = min; i <= max; i++) out.push({ key: String(i), label: String(i), value: i });
    return out;
}

function buildVerseOptions(min: number, max: number): WheelOption[] {
    const out: WheelOption[] = [{ key: "nil", label: "—", value: null }];
    for (let i = min; i <= max; i++) out.push({ key: String(i), label: String(i), value: i });
    return out;
}

type PopPos = Readonly<{ left: number; top: number; maxHeight: number; width: number }>;

function computePopoverPos(anchor: DOMRect, desiredWidth: number): PopPos {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;

    const width = Math.min(desiredWidth, vw - margin * 2);

    // center under pill (pill is centered in header)
    const cx = anchor.left + anchor.width / 2;
    const left = clampInt(Math.round(cx - width / 2), margin, Math.max(margin, vw - width - margin));

    const belowTop = Math.round(anchor.bottom + 12);
    const belowAvail = vh - belowTop - margin;

    const cap = Math.min(POPOVER_MAX_H, vh - margin * 2);

    if (belowAvail >= BODY_MIN_H + TOP_ROW_H) {
        return { left, top: belowTop, maxHeight: Math.min(cap, belowAvail), width };
    }

    // flip above
    const top = clampInt(Math.round(anchor.top - 12 - cap), margin, Math.max(margin, vh - cap - margin));
    const aboveAvail = Math.round(anchor.top - top - 12);
    const maxHeight = Math.min(cap, Math.max(BODY_MIN_H + TOP_ROW_H, aboveAvail));
    return { left, top, maxHeight, width };
}

export function PositionPill({ styles, books, current, onJump }: Props) {
    const anchorRef = useRef<HTMLButtonElement | null>(null);

    const list = books ?? [];

    const [open, setOpen] = useState(false);
    const [press, setPress] = useState(false);
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
        if (!currentBookName) return "…";
        return currentVerse == null ? `${currentBookName} ${currentChap}` : `${currentBookName} ${currentChap}:${currentVerse}`;
    }, [currentBookName, currentChap, currentVerse]);

    const [bookId, setBookId] = useState<string>(currentBookId);
    const [chapter, setChapter] = useState<number>(currentChap);
    const [verse, setVerse] = useState<number | null>(currentVerse);

    const [filter, setFilter] = useState<string>("");

    const chaptersCacheRef = useRef<Map<string, ChaptersPayload>>(new Map());
    const [chaptersMeta, setChaptersMeta] = useState<ChaptersPayload | null>(null);

    const selectedBook = useMemo(() => list.find((b) => b.bookId === bookId) ?? null, [list, bookId]);
    const bookName = selectedBook?.name ?? bookId;
    const testamentTag = (selectedBook?.testament ?? "").toUpperCase(); // OT/NT
    const chapterMax = selectedBook?.chapters ?? 999;

    // load chapters meta (for verse bounds)
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
            .catch(() => {
                if (!alive) return;
                setChaptersMeta(null);
            });

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

    // close sync -> reset to current
    useEffect(() => {
        if (open) return;
        setBookId(currentBookId);
        setFilter("");
        setChapter(currentChap);
        setVerse(currentVerse);
    }, [open, currentBookId, currentChap, currentVerse]);

    // Biblical notation placeholder (progressive)
    const filterPlaceholder = useMemo(() => {
        const ref = verse == null ? `${bookName} ${chapter}` : `${bookName} ${chapter}:${verse}`;
        const hint = verse == null ? "pick verse" : "ready";
        return `${ref}${testamentTag ? `  ${testamentTag}` : ""} — ${hint}`;
    }, [bookName, chapter, verse, testamentTag]);

    const filteredBooks = useMemo(() => {
        const f = norm(filter);
        if (!f) return list;
        return list.filter((b) => {
            const hay = norm(`${b.name} ${b.nameShort ?? ""} ${b.bookId} ${b.osised ?? ""} ${(b.testament ?? "")}`);
            return hay.includes(f);
        });
    }, [list, filter]);

    const chapterOptions = useMemo(() => buildNumberOptions(1, chapterMax), [chapterMax]);
    const verseOptions = useMemo(() => buildVerseOptions(1, verseMax), [verseMax]);

    function commit(): void {
        onJump(bookId, chapter, verse);
        setOpen(false);
    }

    useLayoutEffect(() => {
        if (!open) return;

        const anchor = anchorRef.current;
        if (!anchor) return;

        const update = () => {
            const r = anchor.getBoundingClientRect();
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

    // outside click + keys
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
    }, [open, bookId, chapter, verse]);

    // keep selected items visible
    useEffect(() => {
        if (!open) return;
        (bookBtnRefs.current.get(bookId) ?? null)?.scrollIntoView({ block: "nearest" });
    }, [open, bookId, filter]);

    useEffect(() => {
        if (!open) return;
        (chapBtnRefs.current.get(`c:${chapter}`) ?? null)?.scrollIntoView({ block: "nearest" });
    }, [open, chapter, bookId]);

    useEffect(() => {
        if (!open) return;
        const k = verse == null ? "v:nil" : `v:${verse}`;
        (verseBtnRefs.current.get(k) ?? null)?.scrollIntoView({ block: "nearest" });
    }, [open, verse, chapter, bookId]);

    const pillStyle: React.CSSProperties = {
        ...sx.pill,
        ...(press ? (pressedStyle(styles) ?? {}) : null),
        ...(open ? sx.pillOpen : null),
    };

    const goStyle: React.CSSProperties = {
        ...sx.goBtn,
        ...(pressGo ? (pressedStyle(styles) ?? sx.goPressedFallback) : null),
    };

    const bodyH = useMemo(() => {
        const maxH = (popPos?.maxHeight ?? POPOVER_MAX_H) - TOP_ROW_H;
        return clampInt(Math.round(Math.min(maxH, POPOVER_MAX_H - TOP_ROW_H)), BODY_MIN_H, POPOVER_MAX_H - TOP_ROW_H);
    }, [popPos?.maxHeight]);

    const listH = Math.max(120, bodyH - COL_HDR_H);

    function onPickBook(nextBookId: string): void {
        setBookId(nextBookId);
        setChapter(1);
        setVerse(null);
        requestAnimationFrame(() => (chapBtnRefs.current.get("c:1") ?? null)?.scrollIntoView({ block: "nearest" }));
    }

    function onPickChapter(nextChapter: number): void {
        setChapter(nextChapter);
        setVerse(null);
        requestAnimationFrame(() => (verseBtnRefs.current.get("v:nil") ?? null)?.scrollIntoView({ block: "nearest" }));
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
                        maxHeight: popPos.maxHeight,
                    }}
                    role="dialog"
                    aria-label="Jump"
                >
                    {/* Scoped scrollbar styling to kill the ugly black hover-track and make it calm */}
                    <style>{`
#bp-pos-popover .bp-scroll{
  scrollbar-width: thin;
  scrollbar-color: var(--hairline) transparent;
}
#bp-pos-popover .bp-scroll::-webkit-scrollbar{
  width: 10px;
  height: 10px;
}
#bp-pos-popover .bp-scroll::-webkit-scrollbar-track{
  background: transparent;
  border-radius: 999px;
}
#bp-pos-popover .bp-scroll:hover::-webkit-scrollbar-track{
  background: var(--panel);
}
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
#bp-pos-popover .bp-scroll::-webkit-scrollbar-corner{
  background: transparent;
}
            `}</style>

                    {/* Top row — more breathing room */}
                    <div style={sx.topRow}>
                        <div style={sx.filterWrap}>
                <span style={sx.filterIcon} aria-hidden>
                  ⌕
                </span>
                            <input
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                placeholder={filter.trim() ? "Search books…" : filterPlaceholder}
                                style={sx.filterInput}
                                aria-label="Search books"
                                spellCheck={false}
                                autoFocus
                            />
                        </div>

                        <button
                            type="button"
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

                    {/* Progressive columns: Book → Chapter → Verse */}
                    <div style={{ ...sx.bodyRow, height: bodyH }}>
                        {/* BOOKS */}
                        <div style={sx.col}>
                            <div style={sx.colHeader}>Book</div>
                            <div className="bp-scroll" style={{ ...sx.list, height: listH }} role="listbox" aria-label="Books">
                                <div style={sx.listPad} />
                                {filteredBooks.length === 0 ? (
                                    <div style={sx.empty}>No matching books.</div>
                                ) : (
                                    filteredBooks.map((b, idx) => {
                                        const active = b.bookId === bookId;
                                        const tag = (b.testament ?? "").toUpperCase();

                                        return (
                                            <button
                                                key={b.bookId}
                                                ref={(el) => {
                                                    bookBtnRefs.current.set(b.bookId, el);
                                                }}
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
                                    })
                                )}
                                {/* fixes bottom cut-off (Revelation) */}
                                <div style={sx.listPad} />
                            </div>
                        </div>

                        {/* CHAPTERS */}
                        <div style={sx.colNarrow}>
                            <div style={sx.colHeader}>Chapter</div>
                            <div className="bp-scroll" style={{ ...sx.list, height: listH }} role="listbox" aria-label="Chapters">
                                <div style={sx.listPad} />
                                {chapterOptions.map((o, idx) => {
                                    const n = o.value ?? 1;
                                    const active = n === chapter;

                                    return (
                                        <button
                                            key={o.key}
                                            ref={(el) => {
                                                chapBtnRefs.current.set(`c:${n}`, el);
                                            }}
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
                                <div style={sx.listPad} />
                            </div>
                        </div>

                        {/* VERSES */}
                        <div style={sx.colNarrow}>
                            <div style={sx.colHeader}>Verse</div>

                            {!chaptersMeta ? (
                                <div style={{ ...sx.loadingBox, height: listH }}>Loading…</div>
                            ) : (
                                <div className="bp-scroll" style={{ ...sx.list, height: listH }} role="listbox" aria-label="Verses">
                                    <div style={sx.listPad} />
                                    {verseOptions.map((o, idx) => {
                                        const active = o.value === verse;
                                        const key = o.value == null ? "v:nil" : `v:${o.value}`;

                                        return (
                                            <button
                                                key={o.key}
                                                ref={(el) => {
                                                    verseBtnRefs.current.set(key, el);
                                                }}
                                                type="button"
                                                style={{
                                                    ...sx.itemTight,
                                                    ...(idx > 0 ? sx.itemSep : null),
                                                    ...(active ? sx.itemActive : null),
                                                }}
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => setVerse(o.value)}
                                                aria-label={o.value == null ? "Verse (chapter start)" : `Verse ${o.value}`}
                                            >
                                                {active ? <span style={sx.activeBar} aria-hidden /> : null}
                                                <span style={{ ...sx.numText, ...(active ? sx.numTextActive : null) }}>{o.label}</span>
                                                <span style={{ ...sx.selDot, ...(active ? sx.selDotOn : null) }} aria-hidden />
                                            </button>
                                        );
                                    })}
                                    <div style={sx.listPad} />
                                </div>
                            )}

                            <div style={sx.verseHint}>
                                <span style={sx.verseHintStrong}>—</span> jumps to chapter start.
                            </div>
                        </div>
                    </div>

                    {/* extra whitespace at bottom for calm (and to avoid “tight” feel) */}
                    <div style={{ height: 6 }} />
                </div>,
                document.body,
            )
            : null;

    return (
        <div style={sx.root}>
            <button
                ref={anchorRef}
                type="button"
                style={pillStyle}
                aria-label="Current position"
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                onMouseDown={() => setPress(true)}
                onMouseUp={() => setPress(false)}
                onMouseLeave={() => setPress(false)}
                onTouchStart={() => setPress(true)}
                onTouchEnd={() => setPress(false)}
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
        height: 34,
        padding: "0 12px",
        borderRadius: 999,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
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
        fontSize: 12.5,
        letterSpacing: "-0.01em",
        color: "var(--fg)",
        opacity: 0.92,
        maxWidth: 190,
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    pillTextMuted: {
        fontSize: 12.5,
        letterSpacing: "-0.01em",
        color: "var(--muted)",
        opacity: 0.95,
    },
    caret: {
        fontSize: 10,
        color: "var(--muted)",
        opacity: 0.75,
        transform: "translateY(-0.5px)",
        marginLeft: 2,
    },

    popover: {
        position: "fixed",
        zIndex: 2000,
        borderRadius: 16,
        border: "1px solid var(--hairline)",
        background: "var(--bg)",
        padding: "14px 14px 12px", // more whitespace top/bottom
        boxShadow: "0 28px 100px rgba(0,0,0,0.22)",
        overflow: "hidden",
    },

    topRow: {
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 10,
        alignItems: "center",
        marginBottom: 12,
    },

    filterWrap: {
        height: 34,
        display: "grid",
        gridTemplateColumns: "18px 1fr",
        alignItems: "center",
        gap: 6,
        padding: "0 10px",
        borderRadius: 12,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        minWidth: 0,
    },
    filterIcon: {
        width: 18,
        textAlign: "center",
        color: "var(--muted)",
        fontSize: 12,
        transform: "translateY(-0.5px)",
    },
    filterInput: {
        width: "100%",
        height: 30,
        border: "none",
        outline: "none",
        background: "transparent",
        color: "inherit",
        fontSize: 12.5,
        padding: 0,
        minWidth: 0,
    },

    // Primary “Go” — black in light, white in dark (because fg/bg invert)
    goBtn: {
        height: 34,
        padding: "0 14px",
        borderRadius: 12,
        border: "1px solid transparent",
        background: "var(--fg)",
        color: "var(--bg)",
        cursor: "pointer",
        lineHeight: 1,
        userSelect: "none",
        whiteSpace: "nowrap",
        boxShadow: "0 12px 34px rgba(0,0,0,0.14)",
    },
    goPressedFallback: {
        transform: "translateY(1px) scale(0.99)",
        opacity: 0.96,
    },

    bodyRow: {
        display: "grid",
        gridTemplateColumns: "1fr 132px 132px",
        gap: 12,
        alignItems: "stretch",
        minHeight: 0,
    },

    col: { minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 8 },
    colNarrow: { minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 8 },

    colHeader: {
        height: COL_HDR_H,
        display: "flex",
        alignItems: "center",
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--muted)",
        opacity: 0.85,
        paddingInline: 2,
        userSelect: "none",
    },

    list: {
        borderRadius: 14,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        overflowY: "auto",
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch",
        scrollbarGutter: "stable",
        overscrollBehavior: "contain",
    },
    listPad: { height: 12 }, // top/bottom breathing + prevents last-item clipping

    empty: {
        padding: "10px 10px",
        fontSize: 12,
        color: "var(--muted)",
    },

    item: {
        width: "100%",
        position: "relative",
        textAlign: "left",
        display: "grid",
        gridTemplateColumns: "1fr 12px",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
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
        gap: 10,
        padding: "8px 10px",
        border: "none",
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
    },
    itemSep: {
        borderTop: "1px solid var(--hairline)",
    },
    itemActive: {
        background: "var(--bg)",
        boxShadow: "inset 0 0 0 1px var(--focusRing)",
    },
    activeBar: {
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: 3,
        background: "var(--fg)",
        opacity: 0.45,
        borderTopLeftRadius: 14,
        borderBottomLeftRadius: 14,
    },

    itemLine: {
        display: "inline-flex",
        alignItems: "baseline",
        gap: 10,
        minWidth: 0,
    },
    itemText: {
        fontSize: 12.75,
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
        fontSize: 10.5,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--muted)",
        opacity: 0.62,
        whiteSpace: "nowrap",
        transform: "translateY(-0.5px)",
    },
    inlineTagActive: { opacity: 0.78 },

    numText: {
        fontSize: 13,
        letterSpacing: "-0.01em",
        color: "var(--fg)",
        opacity: 0.78,
    },
    numTextActive: { opacity: 1 },

    selDot: {
        width: 8,
        height: 8,
        borderRadius: 999,
        border: "1px solid var(--hairline)",
        opacity: 0.55,
        justifySelf: "end",
    },
    selDotOn: {
        background: "var(--fg)",
        borderColor: "transparent",
        opacity: 0.22,
    },

    loadingBox: {
        borderRadius: 14,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        display: "grid",
        placeItems: "center",
        fontSize: 12,
        color: "var(--muted)",
    },

    verseHint: {
        marginTop: -2,
        fontSize: 11.5,
        color: "var(--muted)",
        opacity: 0.85,
        paddingInline: 2,
        userSelect: "none",
    },
    verseHintStrong: { color: "var(--fg)", opacity: 0.9 },
};