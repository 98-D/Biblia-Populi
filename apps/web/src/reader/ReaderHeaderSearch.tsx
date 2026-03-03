// apps/web/src/reader/ReaderHeaderSearch.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGetBooks, apiSearch, type BookRow, type SearchPayload, type SearchResult } from "../api";
import type { ReaderLocation } from "../Search";

/**
 * ReaderHeaderSearch — compact, header-only search
 * - Smaller height + tighter padding (fixes “too tall” in header)
 * - Uses same reference parsing + results panel logic
 * - Accepts `books` from parent to avoid redundant API call
 */

type Props = {
    onNavigate: (loc: ReaderLocation) => void;

    /** Optional: pass already-loaded books (recommended for Reader header) */
    books?: BookRow[] | null;

    /** Enable Ctrl/Cmd+K focus */
    enableHotkey?: boolean;

    /** Placeholder override */
    placeholder?: string;

    /** Max results */
    limit?: number;
};

type RefParse = { ok: true; loc: ReaderLocation; label: string } | { ok: false };

function normalizeSpaces(s: string): string {
    return s.replace(/\s+/g, " ").trim();
}

function toKey(s: string): string {
    return normalizeSpaces(s.toLowerCase().replace(/[.,]/g, " "));
}

function insertSpaceBeforeDigits(s: string): string {
    // "john3:16" -> "john 3:16"
    // "1cor13:4" -> "1cor 13:4"
    return s.replace(/([a-zA-Z])(\d)/g, "$1 $2");
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
        add((b.nameShort ?? "").replace(/\./g, "")); // "Jn."
        add(b.name.replace(/\./g, ""));
    }

    // hand-friendly aliases (minimal)
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

function parseReference(raw: string, lookup: Map<string, string> | null, bookNameById: Map<string, string> | null): RefParse {
    if (!lookup) return { ok: false };

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

    const tryKey = (k: string): string | null => lookup.get(toKey(k)) ?? null;

    // Try exact
    let bookId = tryKey(bookPart);

    // Try without spaces: "1 cor" -> "1cor"
    if (!bookId) bookId = tryKey(bookPart.replace(/\s+/g, ""));

    // Try removing punctuation
    if (!bookId) bookId = tryKey(bookPart.replace(/[^a-zA-Z0-9\s]/g, ""));

    if (!bookId) return { ok: false };

    const fullName = bookNameById?.get(bookId) ?? bookId;
    const label = verse ? `${fullName} ${chap}:${verse}` : `${fullName} ${chap}`;
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

function isMacPlatform(): boolean {
    if (typeof navigator === "undefined") return false;
    const p = (navigator.platform || navigator.userAgent || "").toLowerCase();
    return p.includes("mac");
}

export function ReaderHeaderSearch(props: Props) {
    const { onNavigate, enableHotkey = true, placeholder, limit = 20 } = props;

    const inputRef = useRef<HTMLInputElement | null>(null);

    const [books, setBooks] = useState<BookRow[] | null>(props.books ?? null);

    const [q, setQ] = useState("");
    const [focused, setFocused] = useState(false);

    const [loading, setLoading] = useState(false);
    const [payload, setPayload] = useState<SearchPayload | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const [activeIdx, setActiveIdx] = useState(0);
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

    // Prefer parent-provided books; else load.
    useEffect(() => {
        if (props.books) {
            setBooks(props.books);
            return;
        }

        let alive = true;
        apiGetBooks()
            .then((r) => alive && setBooks(r.books))
            .catch(() => alive && setBooks(null));

        return () => {
            alive = false;
        };
    }, [props.books]);

    const bookLookup = useMemo(() => (books && books.length ? buildBookLookup(books) : null), [books]);

    const bookNameById = useMemo(() => {
        const m = new Map<string, string>();
        for (const b of books ?? []) m.set(b.bookId, b.name);
        return m;
    }, [books]);

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

    const ref = useMemo(() => parseReference(q, bookLookup, bookNameById), [q, bookLookup, bookNameById]);

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

        setLoading(true);
        const t = setTimeout(() => {
            apiSearch(qq, limit)
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
        }, 160);

        return () => {
            alive = false;
            clearTimeout(t);
        };
    }, [q, limit]);

    const results = payload?.results ?? [];
    const showPanel = focused && (q.trim().length > 0 || loading || err != null);

    const items = useMemo(() => {
        const list: Array<
            | { kind: "ref"; label: string; loc: ReaderLocation }
            | { kind: "result"; label: string; result: SearchResult }
        > = [];

        if (ref.ok) list.push({ kind: "ref", label: `Go to ${ref.label}`, loc: ref.loc });

        for (const r of results) {
            const fullBook = bookNameById.get(r.bookId) ?? r.bookId;
            list.push({
                kind: "result",
                label: `${fullBook} ${r.chapter}:${r.verse}`,
                result: r,
            });
        }

        return list;
    }, [ref, results, bookNameById]);

    // keep active item visible
    useEffect(() => {
        const el = itemRefs.current[activeIdx];
        if (!el) return;
        el.scrollIntoView({ block: "nearest" });
    }, [activeIdx]);

    function commitSelection(idx: number): void {
        const item = items[idx];
        if (!item) return;

        if (item.kind === "ref") {
            onNavigate(item.loc);
            setFocused(false);
            inputRef.current?.blur();
            return;
        }

        const r = item.result;
        onNavigate({ bookId: r.bookId, chapter: r.chapter, verse: r.verse });
        setFocused(false);
        inputRef.current?.blur();
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
        if (e.key === "Enter") {
            e.preventDefault();
            if (!q.trim()) return;
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

    const hotkeyLabel = isMacPlatform() ? "⌘K" : "Ctrl+K";

    return (
        <div style={{ position: "relative" }}>
            <div
                style={{ ...hxs.row, ...(focused ? hxs.rowFocused : null) }}
                aria-label="Search"
                onMouseDown={() => inputRef.current?.focus()}
            >
        <span style={hxs.icon} aria-hidden>
          ⌕
        </span>

                <input
                    ref={inputRef}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={placeholder ?? "Search… (John 3:16)"}
                    style={hxs.input}
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

                <span style={hxs.hotkey} aria-hidden>
          {hotkeyLabel}
        </span>
            </div>

            {!showPanel ? null : (
                <div style={hxs.panel} role="listbox" aria-label="Search results">
                    {err ? <div style={hxs.panelMsg}>{err}</div> : null}
                    {!err && loading ? <div style={hxs.panelMsg}>Searching…</div> : null}
                    {!err && !loading && items.length === 0 ? <div style={hxs.panelMsg}>No results.</div> : null}

                    {!err && !loading && items.length > 0 ? (
                        <div style={hxs.list}>
                            {items.map((it, idx) => {
                                const active = idx === activeIdx;
                                return (
                                    <button
                                        key={`${it.kind}:${it.label}:${idx}`}
                                        ref={(el) => {
                                            itemRefs.current[idx] = el;
                                        }}
                                        type="button"
                                        style={{ ...hxs.item, ...(active ? hxs.itemActive : null) }}
                                        onMouseEnter={() => setActiveIdx(idx)}
                                        onMouseDown={(e) => {
                                            // prevent input blur before click
                                            e.preventDefault();
                                            commitSelection(idx);
                                        }}
                                    >
                                        <div style={hxs.itemTop}>
                                            <span style={hxs.itemLabel}>{it.label}</span>
                                            <span style={hxs.itemMeta}>{it.kind === "ref" ? "ref" : payload?.mode ?? "search"}</span>
                                        </div>

                                        {it.kind === "result" && it.result?.snippet ? (
                                            <div style={hxs.snippet}>
                                                {splitSnippet(it.result.snippet).map((seg, i) => (
                                                    <span key={i} style={seg.hi ? hxs.hi : undefined}>
                            {seg.text}
                          </span>
                                                ))}
                                            </div>
                                        ) : null}
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}

const hxs: Record<string, React.CSSProperties> = {
    row: {
        height: 30,
        display: "grid",
        gridTemplateColumns: "18px 1fr auto",
        alignItems: "center",
        gap: 6,
        padding: "0 10px",
        borderRadius: 999,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        boxShadow: "none",
        cursor: "text",
        userSelect: "none",
    },
    rowFocused: {
        borderColor: "var(--focus)",
        outline: "1px solid var(--focusRing)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
    },
    icon: {
        width: 18,
        textAlign: "center",
        color: "var(--muted)",
        fontSize: 12,
        transform: "translateY(-0.5px)",
    },
    input: {
        width: "100%",
        height: 30,
        border: "none",
        outline: "none",
        background: "transparent",
        color: "inherit",
        fontSize: 12,
        padding: 0,
        lineHeight: "30px",
    },
    hotkey: {
        fontSize: 10,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--muted)",
        opacity: 0.75,
        userSelect: "none",
        paddingLeft: 6,
    },

    panel: {
        position: "absolute",
        left: 0,
        right: 0,
        marginTop: 8,
        borderRadius: 14,
        border: "1px solid var(--hairline)",
        background: "var(--bg)",
        boxShadow: "0 24px 90px rgba(0,0,0,0.20)",
        overflow: "hidden",
        zIndex: 20,
    },
    panelMsg: {
        padding: "10px 10px",
        fontSize: 12,
        color: "var(--muted)",
        whiteSpace: "pre-wrap",
    },
    list: {
        display: "flex",
        flexDirection: "column",
        maxHeight: 280,
        overflowY: "auto",
    },
    item: {
        textAlign: "left",
        border: "none",
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
        padding: "9px 10px",
        borderTop: "1px solid var(--hairline)",
    },
    itemActive: {
        background: "var(--panel)",
    },
    itemTop: {
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 10,
    },
    itemLabel: {
        fontSize: 12,
        letterSpacing: "0.02em",
    },
    itemMeta: {
        fontSize: 10,
        color: "var(--muted)",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        userSelect: "none",
    },
    snippet: {
        marginTop: 5,
        fontSize: 11.5,
        color: "var(--muted)",
        lineHeight: 1.55,
    },
    hi: {
        color: "var(--fg)",
    },
};