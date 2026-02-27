// apps/web/src/Reader.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGetBooks, apiGetChapter, type BookRow, type ChapterPayload } from "./api";

type Props = {
    styles: Record<string, React.CSSProperties>;
    onBackHome: () => void;
};

export function Reader(props: Props) {
    const { styles } = props;

    const [books, setBooks] = useState<BookRow[] | null>(null);
    const [bookId, setBookId] = useState<string>("GEN");
    const [chapter, setChapter] = useState<number>(1);

    const [data, setData] = useState<ChapterPayload | null>(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [pressBack, setPressBack] = useState(false);
    const [pressPrev, setPressPrev] = useState(false);
    const [pressNext, setPressNext] = useState(false);

    const contentRef = useRef<HTMLDivElement | null>(null);

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
    }, [bookId, chapter]);

    const book = useMemo(() => books?.find((b) => b.bookId === bookId) ?? null, [books, bookId]);

    const canPrev = chapter > 1;
    const canNext = book ? chapter < book.chaptersCount : true;

    const backStyle: React.CSSProperties = { ...r.backBtn, ...(pressBack ? styles.btnPressed : null) };
    const prevStyle: React.CSSProperties = { ...r.navBtn, ...(pressPrev ? styles.btnPressed : null) };
    const nextStyle: React.CSSProperties = { ...r.navBtn, ...(pressNext ? styles.btnPressed : null) };

    return (
        <main style={r.page}>
            {/* Centered / narrower bars (uses your new base.css container-reading width) */}
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
                            onClick={() => setChapter((c) => Math.max(1, c - 1))}
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
              </span>
                        </div>

                        <button
                            type="button"
                            style={{ ...nextStyle, ...(canNext ? null : r.disabledBtn) }}
                            disabled={!canNext}
                            onClick={() => setChapter((c) => c + 1)}
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

                    {data && <ChapterView data={data} />}
                </div>
            </div>
        </main>
    );
}

function ChapterView(props: { data: ChapterPayload }) {
    const { data } = props;

    return (
        <article style={r.chapter}>
            <header style={r.chapterHeader}>
                <div style={r.chapterKicker}>SCRIPTURE</div>
                <h1 style={r.chapterTitle}>
                    {data.bookId} {data.chapter}
                </h1>
            </header>

            <div style={r.verses}>
                {data.verses.map((v) => (
                    <VerseRow key={`${v.chapter}:${v.verse}`} verse={v.verse} text={v.text} />
                ))}
            </div>
        </article>
    );
}

function VerseRow(props: { verse: number; text: string }) {
    const { verse, text } = props;
    return (
        <div style={r.verseRow}>
            <div style={r.verseNum}>{verse}</div>
            {/* Slightly more “book” feel: serif + calmer size */}
            <div style={r.verseText} className="scripture">
                {text}
            </div>
        </div>
    );
}

const r: Record<string, React.CSSProperties> = {
    page: {
        minHeight: "100vh",
        padding: "16px 0 80px", // let container handle horizontal padding
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
        maxWidth: 240, // less wide
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

    verses: {
        marginTop: 14,
        display: "flex",
        flexDirection: "column",
        gap: 12, // slightly more breathing room for reading
    },
    verseRow: {
        display: "grid",
        gridTemplateColumns: "30px 1fr",
        gap: 12,
        alignItems: "start",
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
        fontSize: 0, // let .scripture set font-size; keep this as override hook if needed
        lineHeight: 0,
        color: "var(--fg)",
    },
};