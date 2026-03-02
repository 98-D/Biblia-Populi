import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGetBooks, apiGetChapter, type BookRow, type ChapterPayload } from "./api";
import type { ReaderLocation } from "./Search";

type Props = {
    styles: Record<string, React.CSSProperties>;
    onBackHome: () => void;
    initialLocation?: ReaderLocation;
};

export function Reader(props: Props) {
    const { styles, initialLocation } = props;

    const [books, setBooks] = useState<BookRow[] | null>(null);

    const [bookId, setBookId] = useState<string>(initialLocation?.bookId ?? "GEN");
    const [chapter, setChapter] = useState<number>(initialLocation?.chapter ?? 1);

    const [focusVerse, setFocusVerse] = useState<number | null>(initialLocation?.verse ?? null);

    const [data, setData] = useState<ChapterPayload | null>(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [pressBack, setPressBack] = useState(false);
    const [pressPrev, setPressPrev] = useState(false);
    const [pressNext, setPressNext] = useState(false);

    const contentRef = useRef<HTMLDivElement | null>(null);

    // Apply navigation updates when parent changes initialLocation
    useEffect(() => {
        if (!initialLocation) return;
        setBookId(initialLocation.bookId);
        setChapter(initialLocation.chapter);
        setFocusVerse(initialLocation.verse ?? null);
    }, [initialLocation?.bookId, initialLocation?.chapter, initialLocation?.verse]);

    // Load books once
    useEffect(() => {
        let alive = true;
        apiGetBooks()
            .then((r) => alive && setBooks(r.books))
            .catch((e) => alive && setErr(String(e?.message ?? e)));
        return () => {
            alive = false;
        };
    }, []);

    const book = useMemo(() => books?.find((b) => b.bookId === bookId) ?? null, [books, bookId]);
    const maxChapters = book?.chapters ?? null;

    const canPrev = chapter > 1;
    const canNext = maxChapters ? chapter < maxChapters : true;

    // Load chapter
    useEffect(() => {
        let alive = true;
        setLoading(true);
        setErr(null);

        apiGetChapter(bookId, chapter)
            .then((r) => {
                if (!alive) return;
                setData(r);
                setLoading(false);

                requestAnimationFrame(() => {
                    if (focusVerse != null) {
                        const id = verseDomId(bookId, chapter, focusVerse);
                        const el = document.getElementById(id);
                        if (el) {
                            el.scrollIntoView({ block: "center", behavior: "auto" });
                            return;
                        }
                    }
                    contentRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
                });
            })
            .catch((e) => {
                if (!alive) return;
                setErr(String(e?.message ?? e));
                setLoading(false);
            });

        return () => {
            alive = false;
        };
    }, [bookId, chapter, focusVerse]);

    // Clamp chapter if book changes
    useEffect(() => {
        if (!maxChapters) return;
        if (chapter > maxChapters) setChapter(maxChapters);
    }, [maxChapters, chapter]);

    const backStyle: React.CSSProperties = { ...r.backBtn, ...(pressBack ? styles.btnPressed : null) };
    const prevStyle: React.CSSProperties = { ...r.navBtn, ...(pressPrev ? styles.btnPressed : null) };
    const nextStyle: React.CSSProperties = { ...r.navBtn, ...(pressNext ? styles.btnPressed : null) };

    return (
        <main style={r.page}>
            <div className="container-reading">
                <div style={r.topBar}>
                    <button
                        type="button"
                        style={backStyle}
                        onClick={props.onBackHome}
                        onMouseDown={() => setPressBack(true)}
                        onMouseUp={() => setPressBack(false)}
                        onMouseLeave={() => setPressBack(false)}
                        onTouchStart={() => setPressBack(true)}
                        onTouchEnd={() => setPressBack(false)}
                    >
                        ← Home
                    </button>

                    <div style={{ flex: 1 }} />

                    <select
                        value={bookId}
                        onChange={(e) => {
                            setBookId(e.target.value);
                            setChapter(1);
                            setFocusVerse(null);
                        }}
                        style={r.select}
                        aria-label="Book"
                    >
                        {(books ?? []).map((b) => (
                            <option key={b.bookId} value={b.bookId}>
                                {b.ordinal}. {b.name}
                            </option>
                        ))}
                    </select>

                    <div style={r.chapterNav}>
                        <button
                            type="button"
                            style={{ ...prevStyle, ...(canPrev ? null : r.disabledBtn) }}
                            disabled={!canPrev}
                            onClick={() => {
                                setChapter((c) => Math.max(1, c - 1));
                                setFocusVerse(null);
                            }}
                            onMouseDown={() => setPressPrev(true)}
                            onMouseUp={() => setPressPrev(false)}
                            onMouseLeave={() => setPressPrev(false)}
                            onTouchStart={() => setPressPrev(true)}
                            onTouchEnd={() => setPressPrev(false)}
                            aria-label="Previous chapter"
                        >
                            ←
                        </button>

                        <div style={r.chapterPill} aria-label="Current chapter">
              <span style={r.chapterPillText}>
                {bookId} {chapter}
                  {maxChapters ? ` / ${maxChapters}` : ""}
              </span>
                        </div>

                        <button
                            type="button"
                            style={{ ...nextStyle, ...(canNext ? null : r.disabledBtn) }}
                            disabled={!canNext}
                            onClick={() => {
                                setChapter((c) => (maxChapters ? Math.min(maxChapters, c + 1) : c + 1));
                                setFocusVerse(null);
                            }}
                            onMouseDown={() => setPressNext(true)}
                            onMouseUp={() => setPressNext(false)}
                            onMouseLeave={() => setPressNext(false)}
                            onTouchStart={() => setPressNext(true)}
                            onTouchEnd={() => setPressNext(false)}
                            aria-label="Next chapter"
                        >
                            →
                        </button>
                    </div>
                </div>

                <div style={r.body}>
                    {err && <div style={r.error}>{err}</div>}

                    {loading && (
                        <div style={r.loadingWrap}>
                            <div style={r.loadingBar} />
                            <div style={r.loadingText}>Loading…</div>
                        </div>
                    )}

                    <div ref={contentRef} />

                    {data && <ChapterView data={data} focusVerse={focusVerse} />}
                </div>
            </div>
        </main>
    );
}

function verseDomId(bookId: string, chapter: number, verse: number): string {
    return `v-${bookId}-${chapter}-${verse}`;
}

function ChapterView(props: { data: ChapterPayload; focusVerse: number | null }) {
    const { data, focusVerse } = props;

    return (
        <article style={r.chapter}>
            <header style={r.chapterHeader}>
                <div style={r.chapterKicker}>SCRIPTURE</div>
                <h1 style={r.chapterTitle}>
                    {data.bookId} {data.chapter}
                </h1>
                <div style={r.chapterSub}>
          <span style={r.chapterSubText}>
            Translation: <strong>{data.translationId}</strong>
          </span>
                </div>
            </header>

            <div style={r.verses}>
                {data.verses.map((v) => (
                    <VerseRow
                        key={v.verseKey ?? `${v.chapter}:${v.verse}`}
                        id={verseDomId(data.bookId, data.chapter, v.verse)}
                        verse={v.verse}
                        text={v.text}
                        active={focusVerse === v.verse}
                    />
                ))}
            </div>
        </article>
    );
}

function VerseRow(props: { id: string; verse: number; text: string | null; active: boolean }) {
    const { id, verse, text, active } = props;

    return (
        <div id={id} style={{ ...r.verseRow, ...(active ? r.verseRowActive : null) }}>
            <div style={r.verseNum}>{verse}</div>
            <div style={r.verseText} className="scripture">
                {text ?? ""}
            </div>
        </div>
    );
}

const r: Record<string, React.CSSProperties> = {
    page: {
        minHeight: "100vh",
        padding: "16px 0 80px",
        color: "var(--fg)",
    },

    topBar: {
        display: "flex",
        alignItems: "center",
        gap: 10,
    },

    backBtn: {
        fontSize: 12,
        padding: "6px 8px",
        borderRadius: 10,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        cursor: "pointer",
        color: "inherit",
        lineHeight: 1,
        transition: "transform 140ms ease, opacity 140ms ease",
    },

    select: {
        fontSize: 12,
        padding: "7px 10px",
        borderRadius: 12,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        color: "inherit",
        outline: "none",
        maxWidth: 240,
    },

    chapterNav: {
        display: "flex",
        alignItems: "center",
        gap: 8,
    },

    navBtn: {
        fontSize: 12,
        width: 34,
        height: 30,
        borderRadius: 12,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        color: "inherit",
        cursor: "pointer",
        transition: "transform 140ms ease, opacity 140ms ease",
    },

    disabledBtn: {
        opacity: 0.35,
        cursor: "default",
    },

    chapterPill: {
        height: 30,
        padding: "0 10px",
        borderRadius: 999,
        border: "1px solid var(--hairline)",
        background: "transparent",
        display: "flex",
        alignItems: "center",
    },
    chapterPillText: {
        fontSize: 11,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--muted)",
    },

    body: {
        marginTop: 14,
    },

    loadingWrap: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginTop: 10,
        marginBottom: 12,
    },
    loadingBar: {
        width: 22,
        height: 6,
        borderRadius: 999,
        background: "var(--hairline)",
    },
    loadingText: {
        fontSize: 11,
        color: "var(--muted)",
        letterSpacing: "0.08em",
    },

    error: {
        fontSize: 12,
        color: "var(--muted)",
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        padding: "10px 12px",
        borderRadius: 12,
        marginBottom: 12,
        whiteSpace: "pre-wrap",
    },

    chapter: {
        borderRadius: 18,
        border: "1px solid var(--hairline)",
        background: "transparent",
        padding: "16px 14px",
    },
    chapterHeader: {
        paddingBottom: 10,
        borderBottom: "1px solid var(--hairline)",
    },
    chapterKicker: {
        fontSize: 9,
        letterSpacing: "0.33em",
        textTransform: "uppercase",
        color: "var(--muted)",
    },
    chapterTitle: {
        marginTop: 8,
        marginBottom: 0,
        fontSize: 20,
        letterSpacing: "-0.02em",
        lineHeight: 1.1,
    },
    chapterSub: {
        marginTop: 8,
    },
    chapterSubText: {
        fontSize: 11,
        color: "var(--muted)",
        letterSpacing: "0.03em",
    },

    verses: {
        marginTop: 14,
        display: "flex",
        flexDirection: "column",
        gap: 12,
    },
    verseRow: {
        display: "grid",
        gridTemplateColumns: "30px 1fr",
        gap: 12,
        alignItems: "start",
        borderRadius: 12,
        padding: "6px 6px",
    },
    verseRowActive: {
        background: "rgba(255,255,255,0.04)",
        outline: "1px solid var(--hairline)",
    },
    verseNum: {
        fontSize: 10,
        color: "var(--muted)",
        letterSpacing: "0.12em",
        textAlign: "right",
        paddingTop: 4,
        userSelect: "none",
    },
    verseText: {
        fontSize: 0,
        lineHeight: 0,
        color: "var(--fg)",
    },
};