import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGetBooks, apiSearch, type BookRow, type SearchPayload, type SearchResult } from "./api";

export type ReaderLocation = {
    bookId: string;
    chapter: number;
    verse?: number;
};

type Props = {
    styles: Record<string, React.CSSProperties>;
    /** Called when user chooses a ref/result */
    onNavigate: (loc: ReaderLocation) => void;

    /** Optional: called if user presses Enter with empty query */
    onStartReading?: () => void;

    /** Optional initial query */
    initialQuery?: string;

    /** Enable Ctrl/Cmd+K focus */
    enableHotkey?: boolean;

    /** Optional hint text under input */
    hint?: string;
};

type RefParse = { ok: true; loc: ReaderLocation; label: string } | { ok: false };

function normalizeSpaces(s: string): string {
    return s.replace(/\s+/g, " ").trim();
}

function toKey(s: string): string {
    return normalizeSpaces(s.toLowerCase().replace(/[.,]/g, " "));
}

function buildBookLookup(books: BookRow[]): Map<string, string> {
    const m = new Map<string, string>();

    for (const b of books) {
        const id = b.bookId;

        const add = (k: string | null | undefined) => {
            if (!k) return;
            const kk = toKey(k);
            if (!kk) return;
            if (!m.has(kk)) m.set(kk, id);
        };

        add(id);
        add(b.name);
        add(b.nameShort);
        add(b.osised ?? null);

        // extra friendly keys
        add(b.nameShort.replace(/\./g, "")); // "Jn."
        add(b.name.replace(/\./g, ""));
    }

    // Hand-friendly aliases (minimal)
    const addAlias = (alias: string, bookId: string) => {
        const k = toKey(alias);
        if (!m.has(k)) m.set(k, bookId);
    };

    addAlias("psalm", "PSA");
    addAlias("psalms", "PSA");
    addAlias("song of songs", "SNG");
    addAlias("song", "SNG");
    addAlias("canticles", "SNG");

    addAlias("jn", "JHN");
    addAlias("joh", "JHN");
    addAlias("mt", "MAT");
    addAlias("mk", "MRK");
    addAlias("lk", "LUK");
    addAlias("rom", "ROM");
    addAlias("rev", "REV");

    return m;
}

function insertSpaceBeforeDigits(s: string): string {
    // "john3:16" -> "john 3:16"
    // "1cor13:4" -> "1cor 13:4"
    return s.replace(/([a-zA-Z])(\d)/g, "$1 $2");
}

function parseReference(raw: string, books: BookRow[] | null): RefParse {
    if (!books || books.length === 0) return { ok: false };

    let q = normalizeSpaces(raw);
    if (!q) return { ok: false };

    q = insertSpaceBeforeDigits(q);
    q = normalizeSpaces(q);

    // Split last token as chap[:verse]
    const parts = q.split(" ");
    if (parts.length < 2) return { ok: false };

    const last = parts[parts.length - 1] ?? "";
    const m = last.match(/^(\d{1,3})(?::(\d{1,3}))?$/);
    if (!m) return { ok: false };

    const chap = Number(m[1]);
    const verse = m[2] ? Number(m[2]) : undefined;
    if (!Number.isFinite(chap) || chap < 1) return { ok: false };
    if (verse != null && (!Number.isFinite(verse) || verse < 1)) return { ok: false };

    const bookPart = normalizeSpaces(parts.slice(0, -1).join(" "));
    if (!bookPart) return { ok: false };

    const lookup = buildBookLookup(books);

    const tryKey = (k: string): string | null => lookup.get(toKey(k)) ?? null;

    // Try exact
    let bookId = tryKey(bookPart);

    // Try without spaces: "1 cor" -> "1cor"
    if (!bookId) bookId = tryKey(bookPart.replace(/\s+/g, ""));

    // Try removing punctuation
    if (!bookId) bookId = tryKey(bookPart.replace(/[^a-zA-Z0-9\s]/g, ""));

    if (!bookId) return { ok: false };

    const label = verse ? `${bookId} ${chap}:${verse}` : `${bookId} ${chap}`;
    return { ok: true, loc: { bookId, chapter: chap, verse }, label };
}

function splitSnippet(snippet: string): Array<{ text: string; hi: boolean }> {
    // Server uses ‹ and › for FTS snippet markers.
    if (!snippet.includes("‹")) return [{ text: snippet, hi: false }];

    const out: Array<{ text: string; hi: boolean }> = [];
    let hi = false;
    let buf = "";

    for (let i = 0; i < snippet.length; i++) {
        const ch = snippet[i]!;
        if (ch === "‹") {
            if (buf) out.push({ text: buf, hi });
            buf = "";
            hi = true;
            continue;
        }
        if (ch === "›") {
            if (buf) out.push({ text: buf, hi });
            buf = "";
            hi = false;
            continue;
        }
        buf += ch;
    }
    if (buf) out.push({ text: buf, hi });
    return out;
}

function refLabel(r: SearchResult): string {
    return `${r.bookId} ${r.chapter}:${r.verse}`;
}

export function Search(props: Props) {
    const { styles, onNavigate, onStartReading, enableHotkey = true } = props;

    const inputRef = useRef<HTMLInputElement | null>(null);

    const [books, setBooks] = useState<BookRow[] | null>(null);

    const [q, setQ] = useState(props.initialQuery ?? "");
    const [focused, setFocused] = useState(false);

    const [loading, setLoading] = useState(false);
    const [payload, setPayload] = useState<SearchPayload | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const [activeIdx, setActiveIdx] = useState(0);

    // Load books for reference parsing
    useEffect(() => {
        let alive = true;
        apiGetBooks()
            .then((r) => alive && setBooks(r.books))
            .catch(() => {
                // non-fatal; search still works without ref parsing
                if (alive) setBooks(null);
            });
        return () => {
            alive = false;
        };
    }, []);

    // Hotkey: Ctrl/Cmd+K
    useEffect(() => {
        if (!enableHotkey) return;
        function onKeyDown(e: KeyboardEvent) {
            const meta = e.metaKey || e.ctrlKey;
            if (meta && e.key.toLowerCase() === "k") {
                e.preventDefault();
                inputRef.current?.focus();
            }
            if (e.key === "Escape" && document.activeElement === inputRef.current) {
                e.preventDefault();
                if (q.trim()) setQ("");
                else inputRef.current?.blur();
            }
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [enableHotkey, q]);

    const ref = useMemo(() => parseReference(q, books), [q, books]);

    // Debounced search
    useEffect(() => {
        let alive = true;
        const qq = q.trim();

        setErr(null);
        setPayload(null);
        setActiveIdx(0);

        if (!qq) {
            setLoading(false);
            return () => {
                alive = false;
            };
        }

        // If it looks like a pure reference, we still search (nice),
        // but we also show a "Go to ..." action at the top.
        setLoading(true);
        const t = setTimeout(() => {
            apiSearch(qq, 30)
                .then((p) => {
                    if (!alive) return;
                    setPayload(p);
                    setLoading(false);
                })
                .catch((e) => {
                    if (!alive) return;
                    setErr(String(e?.message ?? e));
                    setLoading(false);
                });
        }, 180);

        return () => {
            alive = false;
            clearTimeout(t);
        };
    }, [q]);

    const results = payload?.results ?? [];
    const showPanel = focused && (q.trim().length > 0 || loading || err != null);

    const items = useMemo(() => {
        const list: Array<{ kind: "ref" | "result"; label: string; result?: SearchResult; loc?: ReaderLocation }> = [];
        if (ref.ok) list.push({ kind: "ref", label: `Go to ${ref.label}`, loc: ref.loc });
        for (const r of results) list.push({ kind: "result", label: refLabel(r), result: r });
        return list;
    }, [ref, results]);

    function commitSelection(idx: number): void {
        const item = items[idx];
        if (!item) return;

        if (item.kind === "ref" && item.loc) {
            onNavigate(item.loc);
            setFocused(false);
            inputRef.current?.blur();
            return;
        }

        if (item.kind === "result" && item.result) {
            onNavigate({ bookId: item.result.bookId, chapter: item.result.chapter, verse: item.result.verse });
            setFocused(false);
            inputRef.current?.blur();
        }
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
        if (e.key === "Enter") {
            e.preventDefault();
            if (!q.trim()) {
                onStartReading?.();
                return;
            }
            if (items.length > 0) commitSelection(activeIdx);
            else if (ref.ok) onNavigate(ref.loc);
            return;
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(items.length - 1, i + 1));
            return;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(0, i - 1));
            return;
        }
    }

    const searchRowStyle: React.CSSProperties = {
        ...styles.searchRow,
        ...(focused ? styles.searchRowFocused : null),
    };

    return (
        <div style={{ position: "relative" }}>
            <div style={searchRowStyle} aria-label="Search" onMouseDown={() => inputRef.current?.focus()}>
        <span style={styles.searchIcon} aria-hidden>
          ⌕
        </span>

                <input
                    ref={inputRef}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search… (or type a reference like John 3:16)"
                    style={styles.searchInput}
                    aria-label="Search scripture"
                    spellCheck={false}
                    inputMode="search"
                    onFocus={() => setFocused(true)}
                    onBlur={() => {
                        // delay so click selection works
                        setTimeout(() => setFocused(false), 120);
                    }}
                    onKeyDown={onKeyDown}
                />
            </div>

            {!showPanel ? (
                props.hint ? <div style={sx.hint}>{props.hint}</div> : null
            ) : (
                <div style={sx.panel} role="listbox" aria-label="Search results">
                    {err && <div style={sx.panelMsg}>{err}</div>}
                    {!err && loading && <div style={sx.panelMsg}>Searching…</div>}

                    {!err && !loading && items.length === 0 && <div style={sx.panelMsg}>No results.</div>}

                    {!err && !loading && items.length > 0 && (
                        <div style={sx.list}>
                            {items.map((it, idx) => {
                                const active = idx === activeIdx;
                                return (
                                    <button
                                        key={`${it.kind}:${it.label}:${idx}`}
                                        type="button"
                                        style={{ ...sx.item, ...(active ? sx.itemActive : null) }}
                                        onMouseEnter={() => setActiveIdx(idx)}
                                        onMouseDown={(e) => {
                                            // prevent input blur before click
                                            e.preventDefault();
                                            commitSelection(idx);
                                        }}
                                    >
                                        <div style={sx.itemTop}>
                                            <span style={sx.itemLabel}>{it.label}</span>
                                            {it.kind === "result" ? <span style={sx.itemMeta}>{payload?.mode ?? "search"}</span> : <span style={sx.itemMeta}>ref</span>}
                                        </div>

                                        {it.kind === "result" && it.result?.snippet ? (
                                            <div style={sx.snippet}>
                                                {splitSnippet(it.result.snippet).map((seg, i) => (
                                                    <span key={i} style={seg.hi ? sx.hi : undefined}>
                            {seg.text}
                          </span>
                                                ))}
                                            </div>
                                        ) : null}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div style={sx.footer}>
                        <span style={sx.footerText}>↑↓ navigate</span>
                        <span style={sx.footerDot}>•</span>
                        <span style={sx.footerText}>Enter open</span>
                        <span style={sx.footerDot}>•</span>
                        <span style={sx.footerText}>Esc clear</span>
                        <span style={sx.footerDot}>•</span>
                        <span style={sx.footerText}>{navigator.platform.toLowerCase().includes("mac") ? "⌘K" : "Ctrl+K"} focus</span>
                    </div>
                </div>
            )}
        </div>
    );
}

const sx: Record<string, React.CSSProperties> = {
    panel: {
        position: "absolute",
        left: 0,
        right: 0,
        marginTop: 10,
        borderRadius: 16,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        boxShadow: "var(--shadowSoft)",
        overflow: "hidden",
        zIndex: 20,
        backdropFilter: "blur(10px)",
    },
    panelMsg: {
        padding: "12px 12px",
        fontSize: 12,
        color: "var(--muted)",
        whiteSpace: "pre-wrap",
    },
    list: {
        display: "flex",
        flexDirection: "column",
        maxHeight: 320,
        overflowY: "auto",
    },
    item: {
        textAlign: "left",
        border: "none",
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
        padding: "10px 12px",
        borderTop: "1px solid var(--hairline)",
    },
    itemActive: {
        background: "rgba(255,255,255,0.04)",
    },
    itemTop: {
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 10,
    },
    itemLabel: {
        fontSize: 12,
        letterSpacing: "0.04em",
    },
    itemMeta: {
        fontSize: 10,
        color: "var(--muted)",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
    },
    snippet: {
        marginTop: 6,
        fontSize: 12,
        color: "var(--muted)",
        lineHeight: 1.6,
    },
    hi: {
        color: "var(--fg)",
    },
    footer: {
        borderTop: "1px solid var(--hairline)",
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        color: "var(--muted)",
    },
    footerText: { fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" },
    footerDot: { opacity: 0.6, fontSize: 10 },
    hint: {
        marginTop: 8,
        fontSize: 10,
        letterSpacing: "0.12em",
        color: "var(--muted)",
        opacity: 0.85,
        userSelect: "none",
    },
};