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

function safeJsonParse<T>(text: string | null): T | null {
    if (!text) return null;
    try { return JSON.parse(text) as T; } catch { return null; }
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
        add(b.osised ?? null);
        add((b.nameShort ?? "").replace(/\./g, ""));
        add(b.name.replace(/\./g, ""));
    }

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
    addAlias("1 sam", "1SA");
    addAlias("2 sam", "2SA");
    addAlias("1 kings", "1KI");
    addAlias("2 kings", "2KI");
    addAlias("1 cor", "1CO");
    addAlias("2 cor", "2CO");
    addAlias("1 thess", "1TH");
    addAlias("2 thess", "2TH");
    addAlias("1 tim", "1TI");
    addAlias("2 tim", "2TI");
    addAlias("1 pet", "1PE");
    addAlias("2 pet", "2PE");
    addAlias("1 john", "1JN");
    addAlias("2 john", "2JN");
    addAlias("3 john", "3JN");

    return m;
}

function parseReference(
    raw: string,
    lookup: Map<string, string> | null,
    bookNameById: Map<string, string> | null
): RefParse {
    if (!lookup) return { ok: false };
    let q = normalizeSpaces(raw);
    if (!q) return { ok: false };

    q = q.replace(/\s+(\d{1,3})\s+(\d{1,3})\s*$/g, " $1:$2");
    q = insertSpaceBeforeDigits(q);
    q = normalizeSpaces(q);

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

    const tryKey = (k: string): string | null => lookup.get(toKey(k)) ?? null;
    let bookId = tryKey(bookPart);
    if (!bookId) bookId = tryKey(bookPart.replace(/\s+/g, ""));
    if (!bookId) bookId = tryKey(bookPart.replace(/[^a-zA-Z0-9\s]/g, ""));
    if (!bookId) return { ok: false };

    const fullName = bookNameById?.get(bookId) ?? bookId;
    const label = verse ? `${fullName} ${chap}:${verse}` : `${fullName} ${chap}`;
    return { ok: true, loc: { bookId, chapter: chap, verse }, label };
}

function splitSnippet(snippet: string): Array<{ text: string; hi: boolean }> {
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

function isEditableTarget(t: EventTarget | null): boolean {
    if (!(t instanceof HTMLElement)) return false;
    const tag = t.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    return t.isContentEditable;
}

type HistoryItem = Readonly<{ q: string; at: number }>;

const HISTORY_KEY = "bp_search_history_v1";
const MAX_HISTORY = 8;

function loadHistory(): HistoryItem[] {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(HISTORY_KEY) : null;
    const parsed = safeJsonParse<HistoryItem[]>(raw);
    if (!parsed || !Array.isArray(parsed)) return [];

    const out: HistoryItem[] = [];
    for (const it of parsed) {
        if (!it || typeof it !== "object") continue;
        const q = typeof (it as any).q === "string" ? (it as any).q : "";
        const at = typeof (it as any).at === "number" ? (it as any).at : 0;
        const qq = normalizeSpaces(q);
        if (!qq || !Number.isFinite(at) || at <= 0) continue;
        out.push({ q: qq, at });
    }

    out.sort((a, b) => b.at - a.at);
    const seen = new Set<string>();
    const uniq: HistoryItem[] = [];
    for (const it of out) {
        const k = it.q.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        uniq.push(it);
        if (uniq.length >= MAX_HISTORY) break;
    }
    return uniq;
}

function saveHistory(q: string): void {
    if (typeof window === "undefined") return;
    const qq = normalizeSpaces(q);
    if (!qq) return;
    const prev = loadHistory();
    const now: HistoryItem = { q: qq, at: Date.now() };
    const merged = [now, ...prev.filter((it) => it.q.toLowerCase() !== qq.toLowerCase())].slice(0, MAX_HISTORY);
    try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(merged));
    } catch {}
}

export function Search(props: Props) {
    const { styles, onNavigate, onStartReading, autoFocus } = props;

    const inputRef = useRef<HTMLInputElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);

    const [books, setBooks] = useState<BookRow[] | null>(null);
    const [q, setQ] = useState(props.initialQuery ?? "");
    const [focused, setFocused] = useState(false);
    const [loading, setLoading] = useState(false);
    const [payload, setPayload] = useState<SearchPayload | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [activeIdx, setActiveIdx] = useState(0);
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());

    // Load books
    useEffect(() => {
        let alive = true;
        apiGetBooks()
            .then((r) => alive && setBooks(r.books))
            .catch(() => alive && setBooks(null));
        return () => { alive = false; };
    }, []);

    const bookLookup = useMemo(() => (books && books.length ? buildBookLookup(books) : null), [books]);
    const bookNameById = useMemo(() => {
        const m = new Map<string, string>();
        for (const b of books ?? []) m.set(b.bookId, b.name);
        return m;
    }, [books]);

    // Autofocus
    useEffect(() => {
        if (!autoFocus) return;
        const t = setTimeout(() => inputRef.current?.focus(), 50);
        return () => clearTimeout(t);
    }, [autoFocus]);

    const ref = useMemo(() => parseReference(q, bookLookup, bookNameById), [q, bookLookup, bookNameById]);

    // Debounced search
    useEffect(() => {
        const qq = q.trim();
        setErr(null);
        setPayload(null);
        setActiveIdx(0);
        if (!qq) {
            setLoading(false);
            return;
        }

        const ctrl = new AbortController();
        setLoading(true);

        const timer = setTimeout(() => {
            apiSearch(qq, 30, { signal: ctrl.signal })
                .then((p) => {
                    setPayload(p);
                    setLoading(false);
                })
                .catch((e) => {
                    if (ctrl.signal.aborted) return;
                    setErr(String(e?.message ?? e));
                    setLoading(false);
                });
        }, 180);

        return () => {
            ctrl.abort();
            clearTimeout(timer);
        };
    }, [q]);

    const results = payload?.results ?? [];

    const hasHistory = history.length > 0;
    const showPanel = focused && (q.trim().length > 0 || loading || err != null || hasHistory);

    const items = useMemo(() => {
        const list: Array<
            | { kind: "ref"; label: string; loc: ReaderLocation }
            | { kind: "result"; label: string; result: SearchResult }
            | { kind: "history"; label: string; q: string }
        > = [];

        if (ref.ok) list.push({ kind: "ref", label: `Go to ${ref.label}`, loc: ref.loc });

        if (!q.trim()) {
            for (const h of history) list.push({ kind: "history", label: h.q, q: h.q });
            return list;
        }

        for (const r of results) {
            const fullBook = bookNameById.get(r.bookId) ?? r.bookId;
            list.push({ kind: "result", label: `${fullBook} ${r.chapter}:${r.verse}`, result: r });
        }
        return list;
    }, [ref, results, bookNameById, history, q]);

    // Scroll active item into view
    useEffect(() => {
        const el = itemRefs.current[activeIdx];
        if (el) el.scrollIntoView({ block: "nearest" });
    }, [activeIdx]);

    // Click outside to close panel
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
            e.preventDefault();
            setActiveIdx((i) => Math.min(items.length - 1, Math.max(0, i + 1)));
            return;
        }

        if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(0, i - 1));
            return;
        }
    }

    const searchRowStyle: React.CSSProperties = {
        ...(styles.searchRow ?? {}),
        ...(focused ? (styles.searchRowFocused ?? {}) : null),
    };

    return (
        <div style={{ position: "relative", maxWidth: "440px" }}>
            <div style={searchRowStyle} aria-label="Search" onMouseDown={() => inputRef.current?.focus()}>
                <span style={styles.searchIcon} aria-hidden>⌕</span>
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

            {!showPanel ? (
                props.hint ? <div style={sx.hint}>{props.hint}</div> : null
            ) : (
                <div ref={panelRef} style={sx.panel} role="listbox" aria-label="Search results">
                    {/* Status row */}
                    {err ? (
                        <div style={sx.panelMsg}>{err}</div>
                    ) : loading ? (
                        <div style={sx.panelMsg}>Searching…</div>
                    ) : q.trim() ? (
                        <div style={sx.panelMsg}>
                            {items.length ? `${items.length}${items.length === 1 ? " result" : " results"}` : "No results."}
                            <span style={sx.panelMeta}> {payload?.mode ?? "search"}</span>
                        </div>
                    ) : history.length ? (
                        <div style={sx.panelMsg}>
                            Recent <span style={sx.panelMeta}>(Enter to search)</span>
                        </div>
                    ) : (
                        <div style={sx.panelMsg}>Type to search.</div>
                    )}

                    {items.length > 0 && (
                        <div style={sx.list}>
                            {items.map((it, idx) => {
                                const active = idx === activeIdx;
                                return (
                                    <button
                                        key={`${it.kind}:${idx}`}
                                        ref={(el) => { itemRefs.current[idx] = el; }}
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
                                            <span style={sx.itemMeta}>
                                                {it.kind === "ref"
                                                    ? "ref"
                                                    : it.kind === "history"
                                                        ? "recent"
                                                        : payload?.mode ?? "search"}
                                            </span>
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
            )}
        </div>
    );
}

const sx: Record<string, React.CSSProperties> = {
    panel: {
        position: "absolute",
        left: 0,
        right: 0,
        marginTop: 8,
        maxWidth: "440px",
        borderRadius: 16,
        border: "1px solid var(--hairline)",
        background: "color-mix(in oklab, var(--bg) 94%, transparent)",
        boxShadow: "0 28px 92px rgba(0,0,0,0.22)",
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
        transition: "background 160ms ease, transform 80ms ease",
        fontSize: 13,
    },
    itemActive: {
        background: "color-mix(in oklab, var(--focus) 8%, transparent)",
        transform: "translateX(2px)",
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
        background: "color-mix(in oklab, var(--bg) 96%, transparent)",
        fontSize: 10.2,
    },
    footerText: { fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" },
    footerSep: { fontSize: 10, opacity: 0.75 },
    footerDot: { opacity: 0.5, fontSize: 10, paddingInline: 4 },
    hint: {
        marginTop: 8,
        fontSize: 10.5,
        letterSpacing: "0.12em",
        color: "var(--muted)",
        opacity: 0.85,
        userSelect: "none",
    },
};