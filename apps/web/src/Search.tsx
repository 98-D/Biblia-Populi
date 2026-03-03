// apps/web/src/Search.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGetBooks, apiSearch, type BookRow, type SearchPayload, type SearchResult } from "./api";

export type ReaderLocation = {
    bookId: string;
    chapter: number;
    verse?: number;
};

type Props = {
    styles: Record<string, React.CSSProperties>;
    onNavigate: (loc: ReaderLocation) => void;
    onStartReading?: () => void;
    initialQuery?: string;
    hint?: string;
    autoFocus?: boolean;
};

type RefParse = { ok: true; loc: ReaderLocation; label: string } | { ok: false };

function normalizeSpaces(s: string): string {
    return s.replace(/\s+/g, " ").trim();
}

function toKey(s: string): string {
    return normalizeSpaces(s.toLowerCase().replace(/[.,]/g, " "));
}

function insertSpaceBeforeDigits(s: string): string {
    return s.replace(/([a-zA-Z])(\d)/g, "$1 $2");
}

function safeJsonParseUnknown(text: string | null): unknown {
    if (!text) return null;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return null;
    }
}

function parseAbbrs(abbrs: string | null): string[] {
    if (!abbrs) return [];
    const v = safeJsonParseUnknown(abbrs);

    if (Array.isArray(v)) {
        return v
            .map((x) => (typeof x === "string" ? x : ""))
            .map((s) => s.trim())
            .filter(Boolean);
    }

    // fallback: comma / pipe separated string
    return abbrs
        .split(/[,|]/g)
        .map((s) => s.trim())
        .filter(Boolean);
}

function buildBookLookup(books: BookRow[]): Map<string, string> {
    const m = new Map<string, string>();

    for (const b of books) {
        const id = b.bookId;

        const add = (k: string | null | undefined) => {
            if (!k) return;
            const kk = toKey(k);
            if (!kk || m.has(kk)) return;
            m.set(kk, id);
        };

        add(id);
        add(b.name);
        add(b.nameShort);
        add(b.osised);

        for (const a of parseAbbrs(b.abbrs)) add(a);
    }

    return m;
}

function parseRef(books: BookRow[] | null, raw: string): RefParse {
    const q = normalizeSpaces(insertSpaceBeforeDigits(raw));
    if (!q) return { ok: false };

    // patterns:
    //  - "John 3"
    //  - "John 3:16"
    //  - "1 Cor 13:4"
    const m = q.match(/^(.+?)\s+(\d+)(?::(\d+))?$/);
    if (!m) return { ok: false };

    const book = toKey(m[1] ?? "");
    const chapter = Number(m[2] ?? "NaN");
    const verse = m[3] ? Number(m[3]) : undefined;

    if (!Number.isFinite(chapter) || chapter < 1) return { ok: false };
    if (verse != null && (!Number.isFinite(verse) || verse < 1)) return { ok: false };

    if (!books) return { ok: false };
    const lookup = buildBookLookup(books);
    const bookId = lookup.get(book);
    if (!bookId) return { ok: false };

    const label = verse != null ? `${bookId} ${chapter}:${verse}` : `${bookId} ${chapter}`;
    return { ok: true, label, loc: { bookId, chapter, verse } };
}

/* ---------------- Search history ---------------- */
type HistoryItem = { q: string; at: number };
const HISTORY_KEY = "bp_search_history_v1";
const MAX_HISTORY = 14;

function isHistoryItem(v: unknown): v is HistoryItem {
    if (!v || typeof v !== "object") return false;
    const o = v as Record<string, unknown>;
    return typeof o.q === "string" && typeof o.at === "number";
}

function loadHistory(): HistoryItem[] {
    if (typeof window === "undefined") return [];
    const raw = safeJsonParseUnknown(window.localStorage.getItem(HISTORY_KEY));
    if (!Array.isArray(raw)) return [];

    return raw
        .filter(isHistoryItem)
        .map((x) => ({ q: normalizeSpaces(x.q), at: x.at }))
        .filter((x) => x.q.length > 0 && Number.isFinite(x.at))
        .sort((a, b) => b.at - a.at)
        .slice(0, MAX_HISTORY);
}

function saveHistory(q: string): void {
    if (typeof window === "undefined") return;

    const qq = normalizeSpaces(q);
    if (!qq) return;

    const now = Date.now();
    const cur = loadHistory();
    const merged = [{ q: qq, at: now }, ...cur.filter((it) => it.q.toLowerCase() !== qq.toLowerCase())].slice(
        0,
        MAX_HISTORY,
    );

    try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(merged));
    } catch {}
}

/* ---------------- Snippet helper ---------------- */
function splitSnippet(snippet: string): Array<{ text: string; hi: boolean }> {
    const parts: Array<{ text: string; hi: boolean }> = [];
    const re = /<em>(.*?)<\/em>/gi;

    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = re.exec(snippet))) {
        const start = m.index;
        const end = start + m[0].length;

        if (start > last) parts.push({ text: snippet.slice(last, start), hi: false });
        parts.push({ text: m[1] ?? "", hi: true });
        last = end;
    }

    if (last < snippet.length) parts.push({ text: snippet.slice(last), hi: false });

    return parts.map((p) => ({ ...p, text: p.text.replace(/<\/?[^>]+>/g, "") }));
}

export function Search(props: Props) {
    const { styles, onNavigate, onStartReading, autoFocus } = props;

    const inputRef = useRef<HTMLInputElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);

    const [books, setBooks] = useState<BookRow[] | null>(null);
    const [q, setQ] = useState(props.initialQuery ?? "");
    const [focused, setFocused] = useState(false);
    const [loading, setLoading] = useState(false);
    const [payload, setPayload] = useState<SearchPayload | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [activeIdx, setActiveIdx] = useState(0);

    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());

    useEffect(() => {
        let alive = true;
        apiGetBooks()
            .then((r) => {
                if (!alive) return;
                setBooks(r.books);
            })
            .catch(() => {
                if (!alive) return;
                setBooks(null);
            });
        return () => {
            alive = false;
        };
    }, []);

    const ref = useMemo(() => parseRef(books, q), [books, q]);

    const bookNameById = useMemo(() => {
        const m = new Map<string, string>();
        for (const b of books ?? []) m.set(b.bookId, b.name ?? b.bookId);
        return m;
    }, [books]);

    useEffect(() => {
        if (!autoFocus) return;
        inputRef.current?.focus();
        setFocused(true);
    }, [autoFocus]);

    // Query -> search (debounced)
    useEffect(() => {
        const qq = q.trim();
        if (!qq) {
            setPayload(null);
            setErr(null);
            setLoading(false);
            setActiveIdx(0);
            return;
        }

        let alive = true;
        const ctrl = new AbortController();

        setLoading(true);
        setErr(null);

        const timer = window.setTimeout(() => {
            // ✅ apiSearch signature: (q, limit?, opts?)
            apiSearch(qq, 30, { signal: ctrl.signal })
                .then((r) => {
                    if (!alive) return;
                    setPayload(r);
                    setLoading(false);
                    setErr(null);
                    setActiveIdx(0);
                })
                .catch((e) => {
                    if (!alive) return;
                    if (String((e as any)?.name ?? "") === "AbortError") return;
                    setPayload(null);
                    setErr(String((e as any)?.message ?? e));
                    setLoading(false);
                });
        }, 180);

        return () => {
            alive = false;
            ctrl.abort();
            clearTimeout(timer);
        };
    }, [q]);

    const results = payload?.results ?? [];

    // ✅ stability: do NOT open dropdown on focus when query is empty
    const showPanel = focused && (q.trim().length > 0 || loading || err != null);

    const items = useMemo(() => {
        const list: Array<
            | { kind: "ref"; label: string; loc: ReaderLocation }
            | { kind: "result"; label: string; result: SearchResult }
            | { kind: "history"; label: string; q: string }
        > = [];

        if (ref.ok) list.push({ kind: "ref", label: `Go to ${ref.label}`, loc: ref.loc });

        if (!q.trim()) {
            // history is *stored* but not shown until user types (keeps landing stable)
            return list;
        }

        for (const r of results) {
            const fullBook = bookNameById.get(r.bookId) ?? r.bookId;
            list.push({ kind: "result", label: `${fullBook} ${r.chapter}:${r.verse}`, result: r });
        }

        return list;
    }, [ref, results, bookNameById, q]);

    // Keep active option visible WITHOUT scrollIntoView (avoids page jumps)
    useEffect(() => {
        const el = itemRefs.current[activeIdx];
        const list = listRef.current;
        if (!el || !list) return;

        const top = el.offsetTop;
        const bottom = top + el.offsetHeight;
        const viewTop = list.scrollTop;
        const viewBottom = viewTop + list.clientHeight;

        if (top < viewTop) list.scrollTop = top;
        else if (bottom > viewBottom) list.scrollTop = bottom - list.clientHeight;
    }, [activeIdx]);

    // Click outside -> close
    useEffect(() => {
        if (!showPanel) return;

        const onDown = (e: MouseEvent) => {
            const panel = panelRef.current;
            const input = inputRef.current;
            const t = e.target instanceof Node ? e.target : null;
            if (!t) return;
            if (panel && panel.contains(t)) return;
            if (input && input.contains(t)) return;
            setFocused(false);
        };

        window.addEventListener("mousedown", onDown, { capture: true });
        return () => window.removeEventListener("mousedown", onDown, { capture: true } as any);
    }, [showPanel]);

    function commitSelection(idx: number): void {
        const item = items[idx];
        if (!item) return;

        if (item.kind === "ref") {
            saveHistory(q);
            setHistory(loadHistory());
            onNavigate(item.loc);
            setFocused(false);
            inputRef.current?.blur();
            return;
        }

        if (item.kind === "result") {
            saveHistory(q);
            setHistory(loadHistory());
            const r = item.result;
            onNavigate({ bookId: r.bookId, chapter: r.chapter, verse: r.verse });
            setFocused(false);
            inputRef.current?.blur();
            return;
        }

        if (item.kind === "history") {
            setQ(item.q);
            inputRef.current?.focus();
        }
    }

    function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
        if (e.key === "Escape") {
            e.preventDefault();
            if (q.trim()) {
                setQ("");
                setPayload(null);
                setErr(null);
                setActiveIdx(0);
                return;
            }
            setFocused(false);
            inputRef.current?.blur();
            return;
        }

        if (e.key === "Enter") {
            e.preventDefault();

            if (!q.trim()) {
                onStartReading?.();
                setFocused(false);
                inputRef.current?.blur();
                return;
            }

            if (items.length > 0) {
                commitSelection(activeIdx);
                return;
            }

            if (ref.ok) {
                saveHistory(q);
                setHistory(loadHistory());
                onNavigate(ref.loc);
                setFocused(false);
                inputRef.current?.blur();
            }
            return;
        }

        if (e.key === "ArrowDown") {
            if (!showPanel) return;
            e.preventDefault();
            setActiveIdx((i) => Math.min(items.length - 1, Math.max(0, i + 1)));
            return;
        }

        if (e.key === "ArrowUp") {
            if (!showPanel) return;
            e.preventDefault();
            setActiveIdx((i) => Math.max(0, i - 1));
            return;
        }
    }

    const searchRowStyle: React.CSSProperties = {
        ...(styles.searchRow ?? {}),
        ...(focused ? (styles.searchRowFocused ?? {}) : null),
    };

    const maxW = (styles.searchWrap?.maxWidth as any) ?? (styles.searchRow?.maxWidth as any) ?? 440;

    const wrapStyle: React.CSSProperties = {
        position: "relative",
        width: "100%",
        maxWidth: maxW,
        ...(styles.searchWrap ?? null),
    };

    const panelStyle: React.CSSProperties = {
        ...sx.panel,
        ...(styles.searchPanel ?? null),
    };

    const hintText = props.hint ?? "";

    return (
        <div style={wrapStyle}>
            <div
                style={searchRowStyle}
                aria-label="Search"
                onPointerDown={(e) => {
                    // keeps focus stable without weird selection / blur side-effects
                    e.preventDefault();
                    inputRef.current?.focus();
                }}
            >
        <span style={styles.searchIcon} aria-hidden>
          ⌕
        </span>

                <input
                    ref={inputRef}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search… (or John 3:16)"
                    style={{ ...styles.searchInput, maxWidth: "100%" }}
                    aria-label="Search scripture"
                    spellCheck={false}
                    inputMode="search"
                    onFocus={() => setFocused(true)}
                    onKeyDown={onInputKeyDown}
                />
            </div>

            {/* ✅ stability: reserve hint height so center-layout never re-centers/jitters */}
            <div style={{ ...sx.hintSlot, ...(showPanel ? sx.hintHidden : null) }} aria-hidden={showPanel}>
                {hintText ? <div style={sx.hint}>{hintText}</div> : null}
            </div>

            {showPanel ? (
                <div ref={panelRef} style={panelStyle} role="listbox" aria-label="Search results">
                    {err ? (
                        <div style={sx.panelMsg}>{err}</div>
                    ) : loading ? (
                        <div style={sx.panelMsg}>Searching…</div>
                    ) : q.trim() ? (
                        <div style={sx.panelMsg}>
                            {items.length ? `${items.length}${items.length === 1 ? " result" : " results"}` : "No results."}
                            <span style={sx.panelMeta}> {payload?.mode ?? "search"}</span>
                        </div>
                    ) : (
                        <div style={sx.panelMsg}>Type to search.</div>
                    )}

                    {items.length > 0 && (
                        <div ref={listRef} style={sx.list}>
                            {items.map((it, idx) => {
                                const active = idx === activeIdx;
                                return (
                                    <button
                                        key={`${it.kind}:${idx}`}
                                        ref={(el) => {
                                            itemRefs.current[idx] = el;
                                        }}
                                        type="button"
                                        style={{ ...sx.item, ...(active ? sx.itemActive : null) }}
                                        onMouseEnter={() => setActiveIdx(idx)}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            commitSelection(idx);
                                        }}
                                        role="option"
                                        aria-selected={active}
                                    >
                                        <div style={sx.itemTop}>
                                            <span style={sx.itemLabel}>{it.label}</span>
                                            <span style={sx.itemMeta}>{it.kind === "ref" ? "ref" : payload?.mode ?? "search"}</span>
                                        </div>

                                        {it.kind === "result" && it.result?.snippet && (
                                            <div style={sx.snippet}>
                                                {splitSnippet(it.result.snippet).map((seg, i) => (
                                                    <span key={i} style={seg.hi ? sx.hi : undefined}>
                            {seg.text}
                          </span>
                                                ))}
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div style={sx.footer}>
                        <span style={sx.footerText}>↑↓</span>
                        <span style={sx.footerSep}>navigate</span>
                        <span style={sx.footerDot}>•</span>
                        <span style={sx.footerText}>Enter</span>
                        <span style={sx.footerSep}>open</span>
                        <span style={sx.footerDot}>•</span>
                        <span style={sx.footerText}>Esc</span>
                        <span style={sx.footerSep}>clear</span>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

const sx: Record<string, React.CSSProperties> = {
    panel: {
        position: "absolute",
        left: 0,
        right: 0,
        marginTop: 8,
        borderRadius: 16,
        border: "1px solid var(--hairline)",
        background: "var(--overlay)",
        boxShadow: "var(--shadowPop)",
        overflow: "hidden",
        zIndex: 20,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
    },
    panelMsg: {
        padding: "9px 12px",
        fontSize: 12,
        color: "var(--muted)",
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 8,
        borderBottom: "1px solid var(--hairline)",
        background: "var(--overlay2)",
    },
    panelMeta: {
        fontSize: 9.8,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        opacity: 0.85,
        userSelect: "none",
    },
    list: {
        display: "flex",
        flexDirection: "column",
        maxHeight: 340,
        overflowY: "auto",
    },
    item: {
        textAlign: "left",
        border: "none",
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
        padding: "10px 14px",
        borderTop: "1px solid var(--hairline)",
        transition: "background 140ms ease",
        fontSize: 13,
    },
    itemActive: {
        background: "var(--activeBg)",
    },
    itemTop: {
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 10,
    },
    itemLabel: { fontSize: 13.2, letterSpacing: "0.01em" },
    itemMeta: {
        fontSize: 10,
        color: "var(--muted)",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        userSelect: "none",
        whiteSpace: "nowrap",
    },
    snippet: {
        marginTop: 5,
        fontSize: 12.2,
        color: "var(--muted)",
        lineHeight: 1.55,
    },
    hi: { color: "var(--fg)", fontWeight: 550 },
    footer: {
        borderTop: "1px solid var(--hairline)",
        padding: "9px 14px",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 6,
        color: "var(--muted)",
        background: "var(--overlay2)",
        fontSize: 10.2,
    },
    footerText: { fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" },
    footerSep: { fontSize: 10, opacity: 0.75 },
    footerDot: { opacity: 0.5, fontSize: 10, paddingInline: 4 },

    // reserves vertical space so Home stays perfectly still (centered layout won’t “re-center”)
    hintSlot: {
        height: 18,
        marginTop: 8,
    },
    hintHidden: {
        opacity: 0,
        pointerEvents: "none",
    },
    hint: {
        fontSize: 10.5,
        letterSpacing: "0.12em",
        color: "var(--muted)",
        opacity: 0.85,
        userSelect: "none",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
};