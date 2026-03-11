// apps/web/src/Search.tsx
import React, {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ArrowUpRight,
    BookOpen,
    Clock3,
    CornerDownLeft,
    Search as SearchIcon,
    X,
} from "lucide-react";
import {
    apiGetBooks,
    apiSearch,
    type BookRow,
    type SearchPayload,
    type SearchResult,
} from "./api";

export type ReaderLocation = {
    bookId: string;
    chapter: number;
    verse?: number;
};

type Props = Readonly<{
    styles: Record<string, React.CSSProperties>;
    onNavigate: (loc: ReaderLocation) => void;
    onStartReading?: () => void;
    initialQuery?: string;
    hint?: string;
    autoFocus?: boolean;
}>;

type RefParse =
    | { ok: true; loc: ReaderLocation; label: string }
    | { ok: false };

type SearchItem =
    | {
    kind: "ref";
    key: string;
    label: string;
    meta: string;
    loc: ReaderLocation;
}
    | {
    kind: "result";
    key: string;
    label: string;
    meta: string;
    result: SearchResult;
}
    | {
    kind: "history";
    key: string;
    label: string;
    meta: string;
    q: string;
};

type HistoryItem = Readonly<{
    q: string;
    at: number;
}>;

const HISTORY_KEY = "bp_search_history_v1";
const MAX_HISTORY = 14;
const SEARCH_DEBOUNCE_MS = 180;
const MAX_RESULTS = 30;

function normalizeSpaces(s: string): string {
    return s.replace(/\s+/g, " ").trim();
}

function toKey(s: string): string {
    return normalizeSpaces(
        s
            .toLowerCase()
            .replace(/[.,]/g, " ")
            .replace(/\s*:\s*/g, ":"),
    );
}

function insertSpaceBeforeDigits(s: string): string {
    return s.replace(/([a-zA-Z])(\d)/g, "$1 $2");
}

function normalizeRefInput(s: string): string {
    return normalizeSpaces(insertSpaceBeforeDigits(s).replace(/\s*:\s*/g, ":"));
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

        for (const a of parseAbbrs(b.abbrs)) {
            add(a);
        }
    }

    return m;
}

function parseRef(
    bookLookup: Map<string, string>,
    bookNameById: Map<string, string>,
    raw: string,
): RefParse {
    const q = normalizeRefInput(raw);
    if (!q) return { ok: false };

    const m = q.match(/^(.+?)\s+(\d+)(?::(\d+))?$/);
    if (!m) return { ok: false };

    const book = toKey(m[1] ?? "");
    const chapter = Number(m[2] ?? "NaN");
    const verse = m[3] ? Number(m[3]) : undefined;

    if (!Number.isFinite(chapter) || chapter < 1) return { ok: false };
    if (verse != null && (!Number.isFinite(verse) || verse < 1)) return { ok: false };

    const bookId = bookLookup.get(book);
    if (!bookId) return { ok: false };

    const bookName = bookNameById.get(bookId) ?? bookId;
    const label = verse != null ? `${bookName} ${chapter}:${verse}` : `${bookName} ${chapter}`;

    return {
        ok: true,
        label,
        loc: { bookId, chapter, verse },
    };
}

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

function persistHistory(history: HistoryItem[]): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
        // ignore
    }
}

function saveHistory(q: string): HistoryItem[] {
    const qq = normalizeSpaces(q);
    if (!qq) return loadHistory();

    const now = Date.now();
    const cur = loadHistory();

    const merged = [
        { q: qq, at: now },
        ...cur.filter((it) => it.q.toLowerCase() !== qq.toLowerCase()),
    ].slice(0, MAX_HISTORY);

    persistHistory(merged);
    return merged;
}

function clearHistory(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(HISTORY_KEY);
    } catch {
        // ignore
    }
}

function decodeHtmlEntities(text: string): string {
    if (typeof document === "undefined") {
        return text
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
    }

    const el = document.createElement("textarea");
    el.innerHTML = text;
    return el.value;
}

function splitSnippet(snippet: string): Array<{ text: string; hi: boolean }> {
    const parts: Array<{ text: string; hi: boolean }> = [];
    const re = /<em>(.*?)<\/em>/gi;

    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = re.exec(snippet))) {
        const start = m.index;
        const end = start + m[0].length;

        if (start > last) {
            parts.push({ text: snippet.slice(last, start), hi: false });
        }

        parts.push({ text: m[1] ?? "", hi: true });
        last = end;
    }

    if (last < snippet.length) {
        parts.push({ text: snippet.slice(last), hi: false });
    }

    return parts
        .map((p) => ({
            ...p,
            text: decodeHtmlEntities(p.text.replace(/<\/?[^>]+>/g, "")),
        }))
        .filter((p) => p.text.length > 0);
}

function eventComposedPath(e: Event): EventTarget[] | null {
    const maybe = e as Event & { composedPath?: () => EventTarget[] };
    return typeof maybe.composedPath === "function" ? maybe.composedPath() : null;
}

function pathContainsNode(path: EventTarget[] | null, node: Node | null): boolean {
    if (!path || !node) return false;
    for (const entry of path) {
        if (entry === node) return true;
    }
    return false;
}

function isWithinEventTarget(
    target: Node | null,
    path: EventTarget[] | null,
    el: HTMLElement | null,
): boolean {
    if (!el) return false;
    if (target && el.contains(target)) return true;
    return pathContainsNode(path, el);
}

function itemMetaLabel(kind: SearchItem["kind"], payload: SearchPayload | null): string {
    if (kind === "ref") return "ref";
    if (kind === "history") return "history";
    return payload?.mode ?? "search";
}

function itemIcon(kind: SearchItem["kind"]): React.ReactNode {
    if (kind === "ref") return <ArrowUpRight size={14} />;
    if (kind === "history") return <Clock3 size={14} />;
    return <BookOpen size={14} />;
}

export function Search(props: Props) {
    const { styles, onNavigate, onStartReading, autoFocus } = props;

    const inputRef = useRef<HTMLInputElement | null>(null);
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const requestSeqRef = useRef(0);
    const composingRef = useRef(false);

    const listboxId = useId();

    const [books, setBooks] = useState<BookRow[] | null>(null);
    const [q, setQ] = useState(props.initialQuery ?? "");
    const [focused, setFocused] = useState(false);
    const [loading, setLoading] = useState(false);
    const [payload, setPayload] = useState<SearchPayload | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [activeIdx, setActiveIdx] = useState(0);
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

    const bookLookup = useMemo(() => buildBookLookup(books ?? []), [books]);

    const bookNameById = useMemo(() => {
        const m = new Map<string, string>();
        for (const b of books ?? []) {
            m.set(b.bookId, b.name ?? b.bookId);
        }
        return m;
    }, [books]);

    const ref = useMemo(
        () => parseRef(bookLookup, bookNameById, q),
        [bookLookup, bookNameById, q],
    );

    useEffect(() => {
        if (!autoFocus) return;
        inputRef.current?.focus();
        setFocused(true);
    }, [autoFocus]);

    useEffect(() => {
        const qq = normalizeSpaces(q);
        const myReqId = ++requestSeqRef.current;

        if (!qq) {
            setPayload(null);
            setErr(null);
            setLoading(false);
            setActiveIdx(0);
            return;
        }

        if (ref.ok) {
            setLoading(false);
            setPayload(null);
            setErr(null);
            setActiveIdx(0);
            return;
        }

        let alive = true;
        const ctrl = new AbortController();

        setLoading(true);
        setErr(null);
        setPayload(null);

        const timer = window.setTimeout(() => {
            apiSearch(qq, MAX_RESULTS, { signal: ctrl.signal })
                .then((r) => {
                    if (!alive) return;
                    if (myReqId !== requestSeqRef.current) return;

                    setPayload(r);
                    setLoading(false);
                    setErr(null);
                    setActiveIdx(0);
                })
                .catch((e: unknown) => {
                    if (!alive) return;
                    if (myReqId !== requestSeqRef.current) return;

                    const name =
                        typeof e === "object" &&
                        e !== null &&
                        "name" in e &&
                        typeof (e as { name?: unknown }).name === "string"
                            ? (e as { name: string }).name
                            : "";

                    if (name === "AbortError") return;

                    const message =
                        typeof e === "object" &&
                        e !== null &&
                        "message" in e &&
                        typeof (e as { message?: unknown }).message === "string"
                            ? (e as { message: string }).message
                            : "Search failed.";

                    setPayload(null);
                    setErr(message);
                    setLoading(false);
                });
        }, SEARCH_DEBOUNCE_MS);

        return () => {
            alive = false;
            ctrl.abort();
            clearTimeout(timer);
        };
    }, [q, ref.ok]);

    const hasTypedQuery = normalizeSpaces(q).length > 0;
    const hasVisibleHistory = focused && !hasTypedQuery && history.length > 0;

    const results = payload?.results ?? [];

    const items = useMemo<SearchItem[]>(() => {
        const list: SearchItem[] = [];

        if (ref.ok) {
            list.push({
                kind: "ref",
                key: `ref:${ref.loc.bookId}:${ref.loc.chapter}:${ref.loc.verse ?? 0}`,
                label: `Go to ${ref.label}`,
                meta: "ref",
                loc: ref.loc,
            });
            return list;
        }

        if (!hasTypedQuery) {
            for (const it of history) {
                list.push({
                    kind: "history",
                    key: `history:${it.q.toLowerCase()}`,
                    label: it.q,
                    meta: "history",
                    q: it.q,
                });
            }
            return list;
        }

        for (const r of results) {
            const fullBook = bookNameById.get(r.bookId) ?? r.bookId;
            list.push({
                kind: "result",
                key: `result:${r.bookId}:${r.chapter}:${r.verse}:${r.verseKey ?? ""}`,
                label: `${fullBook} ${r.chapter}:${r.verse}`,
                meta: payload?.mode ?? "search",
                result: r,
            });
        }

        return list;
    }, [bookNameById, hasTypedQuery, history, payload?.mode, ref, results]);

    useEffect(() => {
        itemRefs.current.length = items.length;
        if (activeIdx < items.length) return;
        setActiveIdx(items.length > 0 ? items.length - 1 : 0);
    }, [activeIdx, items.length]);

    useEffect(() => {
        const el = itemRefs.current[activeIdx];
        const list = listRef.current;
        if (!el || !list) return;

        const top = el.offsetTop;
        const bottom = top + el.offsetHeight;
        const viewTop = list.scrollTop;
        const viewBottom = viewTop + list.clientHeight;

        if (top < viewTop) {
            list.scrollTop = top;
        } else if (bottom > viewBottom) {
            list.scrollTop = bottom - list.clientHeight;
        }
    }, [activeIdx]);

    const showPanel = focused && (hasTypedQuery || hasVisibleHistory || loading || err != null);

    useEffect(() => {
        if (!showPanel) return;

        const onPointerDownCapture = (e: PointerEvent) => {
            const target = e.target as Node | null;
            const path = eventComposedPath(e);

            const insideWrap = isWithinEventTarget(target, path, wrapRef.current);
            const insideInput = isWithinEventTarget(target, path, inputRef.current);

            if (!insideWrap && !insideInput) {
                setFocused(false);
            }
        };

        document.addEventListener("pointerdown", onPointerDownCapture, { capture: true });
        return () => {
            document.removeEventListener("pointerdown", onPointerDownCapture, {
                capture: true,
            });
        };
    }, [showPanel]);

    const commitSelection = useCallback(
        (idx: number): void => {
            const item = items[idx];
            if (!item) return;

            if (item.kind === "ref") {
                const nextHistory = saveHistory(q);
                setHistory(nextHistory);
                onNavigate(item.loc);
                setFocused(false);
                inputRef.current?.blur();
                return;
            }

            if (item.kind === "result") {
                const nextHistory = saveHistory(q);
                setHistory(nextHistory);
                const r = item.result;
                onNavigate({ bookId: r.bookId, chapter: r.chapter, verse: r.verse });
                setFocused(false);
                inputRef.current?.blur();
                return;
            }

            setQ(item.q);
            setFocused(true);
            setActiveIdx(0);

            requestAnimationFrame(() => {
                inputRef.current?.focus();
            });
        },
        [items, onNavigate, q],
    );

    const clearQuery = useCallback(() => {
        setQ("");
        setPayload(null);
        setErr(null);
        setLoading(false);
        setActiveIdx(0);
    }, []);

    const onInputKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>): void => {
            if (composingRef.current) return;

            if (e.key === "Escape") {
                e.preventDefault();

                if (normalizeSpaces(q)) {
                    clearQuery();
                    return;
                }

                setFocused(false);
                inputRef.current?.blur();
                return;
            }

            if (e.key === "Enter") {
                e.preventDefault();

                if (!normalizeSpaces(q)) {
                    if (items.length > 0) {
                        commitSelection(activeIdx);
                        return;
                    }

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
                    const nextHistory = saveHistory(q);
                    setHistory(nextHistory);
                    onNavigate(ref.loc);
                    setFocused(false);
                    inputRef.current?.blur();
                }

                return;
            }

            if (e.key === "ArrowDown") {
                if (!showPanel || items.length === 0) return;
                e.preventDefault();
                setActiveIdx((i) => (i + 1) % items.length);
                return;
            }

            if (e.key === "ArrowUp") {
                if (!showPanel || items.length === 0) return;
                e.preventDefault();
                setActiveIdx((i) => (i - 1 + items.length) % items.length);
                return;
            }

            if (e.key === "Home" && showPanel && items.length > 0) {
                e.preventDefault();
                setActiveIdx(0);
                return;
            }

            if (e.key === "End" && showPanel && items.length > 0) {
                e.preventDefault();
                setActiveIdx(items.length - 1);
            }
        },
        [
            q,
            items,
            activeIdx,
            ref,
            showPanel,
            clearQuery,
            commitSelection,
            onNavigate,
            onStartReading,
        ],
    );

    const searchRowStyle: React.CSSProperties = {
        ...(styles.searchRow ?? {}),
        ...(focused ? (styles.searchRowFocused ?? {}) : {}),
    };

    const wrapStyle: React.CSSProperties = {
        position: "relative",
        width: "100%",
        minWidth: 0,
        ...(styles.searchWrap ?? {}),
    };

    const panelStyle: React.CSSProperties = {
        ...sx.panel,
        ...(styles.searchPanel ?? {}),
    };

    const hintText = props.hint ?? "Type a word or a reference";
    const placeholder = props.hint ?? "Search… (or John 3:16)";
    const activeDescendant =
        showPanel && items[activeIdx] ? `${listboxId}-option-${activeIdx}` : undefined;

    const panelStatus = err
        ? "error"
        : loading
            ? "loading"
            : !hasTypedQuery && hasVisibleHistory
                ? "history"
                : ref.ok
                    ? "ref"
                    : hasTypedQuery
                        ? "results"
                        : "idle";

    return (
        <div ref={wrapRef} style={wrapStyle}>
            <div
                style={searchRowStyle}
                aria-label="Search"
                onPointerDown={(e) => {
                    e.preventDefault();
                    inputRef.current?.focus();
                }}
            >
                <span style={sx.searchIcon} aria-hidden>
                    <SearchIcon size={15} strokeWidth={2.1} />
                </span>

                <input
                    ref={inputRef}
                    value={q}
                    onChange={(e) => {
                        setQ(e.target.value);
                        setFocused(true);
                    }}
                    placeholder={placeholder}
                    style={{
                        ...styles.searchInput,
                        width: "100%",
                        maxWidth: "100%",
                        minWidth: 0,
                    }}
                    aria-label="Search scripture"
                    aria-expanded={showPanel}
                    aria-controls={showPanel ? listboxId : undefined}
                    aria-activedescendant={activeDescendant}
                    aria-autocomplete="list"
                    role="combobox"
                    spellCheck={false}
                    inputMode="search"
                    onFocus={() => setFocused(true)}
                    onKeyDown={onInputKeyDown}
                    onCompositionStart={() => {
                        composingRef.current = true;
                    }}
                    onCompositionEnd={() => {
                        composingRef.current = false;
                    }}
                />

                {normalizeSpaces(q) ? (
                    <button
                        type="button"
                        style={sx.clearBtn}
                        aria-label="Clear search"
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => {
                            clearQuery();
                            inputRef.current?.focus();
                        }}
                    >
                        <X size={12} strokeWidth={2.4} />
                    </button>
                ) : null}
            </div>

            <div
                style={{ ...sx.hintSlot, ...(showPanel ? sx.hintHidden : null) }}
                aria-hidden={showPanel}
            >
                {hintText ? <div style={sx.hint}>{hintText}</div> : null}
            </div>

            {showPanel ? (
                <div style={panelStyle}>
                    <div style={sx.panelMsg}>
                        {panelStatus === "error" ? (
                            <>
                                <div style={sx.panelMsgLeft}>
                                    <span style={sx.panelBadge}>Error</span>
                                    <span>{err}</span>
                                </div>
                            </>
                        ) : panelStatus === "loading" ? (
                            <>
                                <div style={sx.panelMsgLeft}>
                                    <span style={sx.panelBadge}>Search</span>
                                    <span>Searching…</span>
                                </div>
                            </>
                        ) : panelStatus === "history" ? (
                            <>
                                <div style={sx.panelMsgLeft}>
                                    <span style={sx.panelBadge}>Recent</span>
                                    <span>Recent searches</span>
                                </div>

                                <button
                                    type="button"
                                    style={sx.inlineBtn}
                                    onPointerDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        clearHistory();
                                        setHistory([]);
                                        setActiveIdx(0);
                                        inputRef.current?.focus();
                                    }}
                                >
                                    Clear
                                </button>
                            </>
                        ) : panelStatus === "ref" ? (
                            <>
                                <div style={sx.panelMsgLeft}>
                                    <span style={sx.panelBadge}>Ref</span>
                                    <span>Direct reference match</span>
                                </div>
                                <span style={sx.panelMeta}>ref</span>
                            </>
                        ) : panelStatus === "results" ? (
                            <>
                                <div style={sx.panelMsgLeft}>
                                    <span style={sx.panelBadge}>Search</span>
                                    <span>
                                        {items.length
                                            ? `${items.length}${items.length === 1 ? " result" : " results"}`
                                            : "No results"}
                                    </span>
                                </div>
                                <span style={sx.panelMeta}>{payload?.mode ?? "search"}</span>
                            </>
                        ) : (
                            <div style={sx.panelMsgLeft}>
                                <span style={sx.panelBadge}>Search</span>
                                <span>Type to search</span>
                            </div>
                        )}
                    </div>

                    {items.length > 0 ? (
                        <div
                            id={listboxId}
                            ref={listRef}
                            style={sx.list}
                            role="listbox"
                            aria-label="Search results"
                        >
                            {items.map((it, idx) => {
                                const active = idx === activeIdx;
                                const meta = itemMetaLabel(it.kind, payload);

                                return (
                                    <button
                                        key={it.key}
                                        id={`${listboxId}-option-${idx}`}
                                        ref={(el) => {
                                            itemRefs.current[idx] = el;
                                        }}
                                        type="button"
                                        style={{ ...sx.item, ...(active ? sx.itemActive : null) }}
                                        onMouseEnter={() => setActiveIdx(idx)}
                                        onPointerDown={(e) => {
                                            e.preventDefault();
                                            commitSelection(idx);
                                        }}
                                        role="option"
                                        aria-selected={active}
                                    >
                                        <div style={sx.itemIcon}>{itemIcon(it.kind)}</div>

                                        <div style={sx.itemBody}>
                                            <div style={sx.itemTop}>
                                                <span style={sx.itemLabel}>{it.label}</span>
                                                <span style={sx.itemMeta}>{meta}</span>
                                            </div>

                                            {it.kind === "result" && it.result.snippet ? (
                                                <div style={sx.snippet}>
                                                    {splitSnippet(it.result.snippet).map((seg, i) => (
                                                        <span
                                                            key={`${it.key}-seg-${i}`}
                                                            style={seg.hi ? sx.hi : undefined}
                                                        >
                                                            {seg.text}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : null}

                                            {it.kind === "history" ? (
                                                <div style={sx.historySub}>
                                                    Press Enter to reuse this search.
                                                </div>
                                            ) : null}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}

                    <div style={sx.footer}>
                        <span style={sx.footerKey}>↑↓</span>
                        <span style={sx.footerText}>move</span>
                        <span style={sx.footerDot}>•</span>
                        <CornerDownLeft size={11} />
                        <span style={sx.footerText}>open</span>
                        <span style={sx.footerDot}>•</span>
                        <span style={sx.footerKey}>Esc</span>
                        <span style={sx.footerText}>{normalizeSpaces(q) ? "clear" : "close"}</span>
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
        border: "1px solid color-mix(in srgb, var(--hairline) 92%, transparent)",
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
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        borderBottom: "1px solid color-mix(in srgb, var(--hairline) 92%, transparent)",
        background: "var(--overlay2)",
        minWidth: 0,
    },

    panelMsgLeft: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },

    panelBadge: {
        fontSize: 9.8,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        opacity: 0.9,
        userSelect: "none",
        whiteSpace: "nowrap",
    },

    panelMeta: {
        fontSize: 9.8,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        opacity: 0.85,
        userSelect: "none",
        whiteSpace: "nowrap",
        flex: "0 0 auto",
    },

    list: {
        display: "flex",
        flexDirection: "column",
        maxHeight: 340,
        overflowY: "auto",
    },

    item: {
        display: "grid",
        gridTemplateColumns: "16px minmax(0, 1fr)",
        alignItems: "start",
        gap: 10,
        textAlign: "left",
        border: "none",
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
        padding: "10px 14px",
        borderTop: "1px solid color-mix(in srgb, var(--hairline) 92%, transparent)",
        transition: "background 140ms ease",
        fontSize: 13,
        width: "100%",
        minWidth: 0,
    },

    itemActive: {
        background: "var(--activeBg)",
    },

    itemIcon: {
        display: "grid",
        placeItems: "center",
        marginTop: 2,
        color: "var(--muted)",
        opacity: 0.9,
    },

    itemBody: {
        minWidth: 0,
    },

    itemTop: {
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 10,
        minWidth: 0,
    },

    itemLabel: {
        fontSize: 13.2,
        letterSpacing: "0.01em",
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },

    itemMeta: {
        fontSize: 10,
        color: "var(--muted)",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        userSelect: "none",
        whiteSpace: "nowrap",
        flex: "0 0 auto",
    },

    snippet: {
        marginTop: 5,
        fontSize: 12.15,
        color: "var(--muted)",
        lineHeight: 1.55,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
    },

    historySub: {
        marginTop: 5,
        fontSize: 11.5,
        color: "var(--muted)",
        lineHeight: 1.4,
    },

    hi: {
        color: "var(--fg)",
        fontWeight: 600,
    },

    footer: {
        borderTop: "1px solid color-mix(in srgb, var(--hairline) 92%, transparent)",
        padding: "9px 14px",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 6,
        color: "var(--muted)",
        background: "var(--overlay2)",
        fontSize: 10.2,
    },

    footerKey: {
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
    },

    footerText: {
        fontSize: 10,
        opacity: 0.78,
    },

    footerDot: {
        opacity: 0.5,
        fontSize: 10,
        paddingInline: 3,
    },

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

    searchIcon: {
        display: "inline-grid",
        placeItems: "center",
        flex: "0 0 auto",
        color: "var(--muted)",
    },

    clearBtn: {
        border: "none",
        background: "transparent",
        color: "var(--muted)",
        cursor: "pointer",
        padding: 0,
        marginLeft: 8,
        width: 18,
        height: 18,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 999,
        flex: "0 0 auto",
    },

    inlineBtn: {
        border: "none",
        background: "transparent",
        color: "var(--fg)",
        cursor: "pointer",
        padding: 0,
        fontSize: 11.5,
        lineHeight: 1.2,
        textDecoration: "underline",
        textUnderlineOffset: "0.14em",
        flex: "0 0 auto",
    },
};