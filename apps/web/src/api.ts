// apps/web/src/api.ts
// Biblia Populi — tiny typed client (bp_* API)
//
// Upgraded:
// - Translation selection support (global + per-call override)
// - /translations endpoint support
// - MetaPayload includes translations[]
// - All relevant endpoints accept ?t=... (alias ?translationId=... server-side)
//
// Philosophy:
// - Calm, explicit, traceable
// - Same-origin by default (Vite proxy / production reverse-proxy)
// - Optional VITE_API_BASE override for remote API
// - Consistent errors with codes
// - Request timeouts + AbortSignal support
// - Safe JSON parsing + better diagnostics

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: string; message: string } };
export type ApiRes<T> = ApiOk<T> | ApiErr;

export type ApiRequestOptions = {
    /** Abort after N ms (default 12s). Set 0 to disable timeout. */
    timeoutMs?: number;
    /** Extra headers */
    headers?: Record<string, string>;
    /** Optional caller-provided AbortSignal (merged with timeout) */
    signal?: AbortSignal;

    /**
     * Optional translationId override for this request.
     * If omitted, api uses the global translation selection (if set) or server default.
     */
    translationId?: string | null;
};

export type ApiErrorCode =
    | "TIMEOUT"
    | "NETWORK"
    | "HTTP_ERROR"
    | "BAD_RESPONSE"
    | "NOT_JSON"
    | "API_ERROR"
    | "ABORTED";

export class ApiError extends Error {
    readonly code: ApiErrorCode;
    readonly status?: number;
    readonly url?: string;
    readonly bodyText?: string;

    constructor(code: ApiErrorCode, message: string, init?: { status?: number; url?: string; bodyText?: string }) {
        super(`${code}: ${message}`);
        this.name = "ApiError";
        this.code = code;
        this.status = init?.status;
        this.url = init?.url;
        this.bodyText = init?.bodyText;
    }
}

/* --------------------------------- Types --------------------------------- */

export type TranslationMeta = {
    translationId: string;
    name?: string | null;
    language?: string | null;
    derivedFrom?: string | null;
    licenseKind?: string | null;
    licenseText?: string | null;
    sourceUrl?: string | null;
    isDefault?: boolean;
    createdAt?: string | null;
};

export type SpineStats = {
    verseOrdMin: number;
    verseOrdMax: number;
    verseCount: number;
};

export type MetaPayload = {
    translation: TranslationMeta;
    translations?: TranslationMeta[];
    ftsEnabled: boolean;
    spine?: SpineStats;
};

export type BookRow = {
    bookId: string;
    ordinal: number;
    testament: "OT" | "NT" | string;
    name: string;
    nameShort: string;
    chapters: number;
    osised: string | null;
    abbrs: string | null; // JSON string or null
};

export type ChaptersPayload = {
    bookId: string;
    chapters: Array<{
        chapter: number;
        startVerseOrd: number;
        endVerseOrd: number;
        verseCount: number;
    }>;
};

export type ChapterBounds = {
    startVerseOrd: number;
    endVerseOrd: number;
    verseCount?: number;
    source: "bp_chapter" | "computed";
};

export type VerseRow = {
    verseKey: string;
    verseOrd: number;
    chapter: number;
    verse: number;
    text: string | null; // left join => null if missing
    updatedAt: string | null;
};

export type RangeRow = {
    rangeId: string;
    startVerseOrd: number;
    endVerseOrd: number;
    startVerseKey: string;
    endVerseKey: string;
    label: string | null;
};

export type LinkRow = {
    linkId: string;
    rangeId: string;
    targetKind: "ENTITY" | "EVENT" | "ROUTE" | "PLACE_GEO" | string;
    targetId: string;
    linkKind:
        | "MENTIONS"
        | "PRIMARY_SUBJECT"
        | "LOCATION"
        | "SETTING"
        | "JOURNEY_STEP"
        | "PARALLEL_ACCOUNT"
        | "QUOTE_SOURCE"
        | "QUOTE_TARGET"
        | string;
    weight: number;
    source: string;
    confidence: number | null;
};

export type CrossrefRow = {
    crossrefId: string;
    fromRangeId: string;
    toRangeId: string;
    kind: "PARALLEL" | "QUOTE" | "ALLUSION" | "TOPICAL" | string;
    source: string;
    confidence: number | null;
};

export type ChapterPayload = {
    translationId: string;
    bookId: string;
    chapter: number;
    chapterBounds: ChapterBounds;

    verses: VerseRow[];

    ranges: RangeRow[];
    links: LinkRow[];
    crossrefs: CrossrefRow[];

    // legacy placeholders
    marks: unknown[];
    mentions: unknown[];
    footnotes: unknown[];
};

export type SearchMode = "fts" | "like" | "none";

export type SearchResult = {
    bookId: string;
    chapter: number;
    verse: number;
    verseKey: string;
    verseOrd: number;
    snippet: string;
};

export type SearchPayload = {
    q: string;
    mode: SearchMode;
    results: SearchResult[];
};

export type PersonPayload =
    | null
    | {
    entity: {
        entityId: string;
        kind: "PERSON" | string;
        canonicalName: string;
        slug: string;
        summaryNeutral: string | null;
        confidence: number | null;
        createdAt: string;
    };
    names: Array<{
        entityNameId: string;
        name: string;
        language: string | null;
        isPrimary: boolean;
        source: string | null;
        confidence: number | null;
    }>;
    relations: {
        from: Array<{
            relationId: string;
            fromEntityId: string;
            toEntityId: string;
            kind: string;
            timeSpanId: string | null;
            source: string;
            confidence: number | null;
            noteNeutral: string | null;
        }>;
        to: Array<{
            relationId: string;
            fromEntityId: string;
            toEntityId: string;
            kind: string;
            timeSpanId: string | null;
            source: string;
            confidence: number | null;
            noteNeutral: string | null;
        }>;
    };
};

export type PlacePayload =
    | null
    | {
    entity: {
        entityId: string;
        kind: "PLACE" | string;
        canonicalName: string;
        slug: string;
        summaryNeutral: string | null;
        confidence: number | null;
        createdAt: string;
    };
    names: Array<{
        entityNameId: string;
        name: string;
        language: string | null;
        isPrimary: boolean;
        source: string | null;
        confidence: number | null;
    }>;
    geos: Array<{
        placeGeoId: string;
        geoType: string;
        lat: number | null;
        lng: number | null;
        bbox: string | null;
        polygon: string | null;
        precisionM: number | null;
        source: string;
        confidence: number | null;
    }>;
};

export type EventPayload =
    | null
    | {
    event: {
        eventId: string;
        canonicalTitle: string;
        kind: string;
        primaryRangeId: string;
        timeSpanId: string | null;
        primaryPlaceId: string | null;
        source: string;
        confidence: number | null;
    };
    participants: Array<{
        eventParticipantId: string;
        entityId: string;
        role: string;
        confidence: number | null;
    }>;
};

export type SliceVerseRow = {
    verseKey: string;
    verseOrd: number;
    bookId: string;
    chapter: number;
    verse: number;
    text: string | null;
    updatedAt: string | null;
};

export type SlicePayload = {
    translationId: string;
    fromOrd: number;
    limit: number;
    verses: SliceVerseRow[];
    done: boolean;
    nextFromOrd: number | null;
    spine?: SpineStats;
};

export type LocPayload =
    | null
    | {
    verseKey: string;
    verseOrd: number;
    bookId: string;
    chapter: number;
    verse: number;
};

export type TranslationsPayload = {
    translations: TranslationMeta[];
};

/* --------------------------------- Base URL -------------------------------- */

// If VITE_API_BASE is set, use it. Otherwise same-origin (works with Vite proxy).
const API_BASE = (import.meta.env?.VITE_API_BASE ?? "") as string;

function joinUrl(base: string, p: string): string {
    const pathname = p.startsWith("/") ? p : `/${p}`;
    if (!base) return pathname;
    const b = base.endsWith("/") ? base.slice(0, -1) : base;
    return `${b}${pathname}`;
}

/* ------------------------- Translation selection (client) ------------------- */

const TRANSLATION_STORAGE_KEY = "bp_translation_id_v1";

let _translationIdMem: string | null = null;

function safeLocalStorageGet(key: string): string | null {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeLocalStorageSet(key: string, value: string): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // ignore
    }
}

function safeLocalStorageRemove(key: string): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

/**
 * Get the current translationId selection.
 * - If setTranslationId() has been called this session, returns that.
 * - Else attempts localStorage.
 * - Else returns null (server default).
 */
export function getTranslationId(): string | null {
    if (_translationIdMem != null) return _translationIdMem;
    const v = safeLocalStorageGet(TRANSLATION_STORAGE_KEY);
    _translationIdMem = v && v.trim() ? v.trim() : null;
    return _translationIdMem;
}

/**
 * Set translationId selection for subsequent requests.
 * - Pass null to clear (use server default).
 */
export function setTranslationId(id: string | null): void {
    const v = id && id.trim() ? id.trim() : null;
    _translationIdMem = v;

    if (!v) safeLocalStorageRemove(TRANSLATION_STORAGE_KEY);
    else safeLocalStorageSet(TRANSLATION_STORAGE_KEY, v);
}

/**
 * Append ?t=... to a URL path (keeps existing query intact).
 * - Respects per-request override in opts.translationId.
 * - Otherwise uses global getTranslationId().
 */
function withTranslation(path: string, opts?: ApiRequestOptions): string {
    const t = (opts?.translationId ?? getTranslationId())?.trim() || "";
    if (!t) return path;

    // if path already has t= or translationId=, do nothing
    if (/[?&](t|translationId)=/i.test(path)) return path;

    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}t=${encodeURIComponent(t)}`;
}

/* ------------------------------ JSON / Errors ------------------------------ */

function isObj(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
    if (!text) return { ok: true, value: null };
    try {
        return { ok: true, value: JSON.parse(text) as unknown };
    } catch {
        return { ok: false };
    }
}

function mergeSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined {
    if (!a) return b;
    if (!b) return a;

    if (a.aborted) return a;
    if (b.aborted) return b;

    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();

    a.addEventListener("abort", onAbort, { once: true });
    b.addEventListener("abort", onAbort, { once: true });

    return ctrl.signal;
}

function classifyFetchError(e: unknown): ApiError {
    if (e && typeof e === "object" && (e as any).name === "AbortError") {
        return new ApiError("ABORTED", "Request aborted.");
    }
    if (e instanceof ApiError) return e;
    const msg = e instanceof Error ? e.message : String(e);
    return new ApiError("NETWORK", msg || "Network error.");
}

async function getJson<T>(path: string, opts: ApiRequestOptions = {}): Promise<T> {
    // Attach translation selection unless caller says otherwise.
    const pathWithT = withTranslation(path, opts);
    const url = joinUrl(API_BASE, pathWithT);

    const timeoutMs = opts.timeoutMs ?? 12_000;
    const timeoutCtrl = new AbortController();
    const timeoutOn = Number.isFinite(timeoutMs) && timeoutMs > 0;

    const t = timeoutOn ? setTimeout(() => timeoutCtrl.abort(), timeoutMs) : null;

    const signal = mergeSignals(opts.signal, timeoutCtrl.signal);

    try {
        const res = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json", ...(opts.headers ?? {}) },
            signal,
        });

        const bodyText = await res.text();
        const parsed = tryParseJson(bodyText);

        if (!res.ok) {
            if (parsed.ok && isObj(parsed.value) && (parsed.value as any).ok === false) {
                const v = parsed.value as ApiErr;
                throw new ApiError("API_ERROR", v.error?.message ?? res.statusText, { status: res.status, url, bodyText });
            }
            throw new ApiError("HTTP_ERROR", res.statusText || `HTTP ${res.status}`, { status: res.status, url, bodyText });
        }

        if (!parsed.ok) {
            throw new ApiError("NOT_JSON", "Expected JSON response but got non-JSON.", { status: res.status, url, bodyText });
        }

        if (!isObj(parsed.value)) {
            throw new ApiError("BAD_RESPONSE", "Expected JSON object envelope.", { status: res.status, url, bodyText });
        }

        const env = parsed.value as ApiRes<T>;
        if ((env as any).ok === false) {
            const e = env as ApiErr;
            throw new ApiError("API_ERROR", e.error?.message ?? "API error.", { status: res.status, url, bodyText });
        }

        if ((env as any).ok !== true) {
            throw new ApiError("BAD_RESPONSE", "Missing ok:true in response envelope.", { status: res.status, url, bodyText });
        }

        return (env as ApiOk<T>).data;
    } catch (e) {
        if (e && typeof e === "object" && (e as any).name === "AbortError") {
            if (timeoutOn) throw new ApiError("TIMEOUT", "Request took too long.", { url });
            throw new ApiError("ABORTED", "Request aborted.", { url });
        }
        throw classifyFetchError(e);
    } finally {
        if (t) clearTimeout(t);
    }
}

/* -------------------------------- API ------------------------------------- */

export function apiGetMeta(opts?: ApiRequestOptions): Promise<MetaPayload> {
    // Meta should include translation selection; this is where we can also reconcile
    // stored translation against server list (caller can do that).
    return getJson("/meta", opts);
}

export function apiGetTranslations(opts?: ApiRequestOptions): Promise<TranslationsPayload> {
    return getJson("/translations", opts);
}

export function apiGetBooks(opts?: ApiRequestOptions): Promise<{ books: BookRow[] }> {
    return getJson("/books", opts);
}

export function apiGetChapters(bookId: string, opts?: ApiRequestOptions): Promise<ChaptersPayload> {
    return getJson(`/chapters/${encodeURIComponent(bookId)}`, opts);
}

export function apiGetChapter(bookId: string, chapter: number, opts?: ApiRequestOptions): Promise<ChapterPayload> {
    return getJson(`/chapter/${encodeURIComponent(bookId)}/${encodeURIComponent(String(chapter))}`, opts);
}

export function apiSearch(q: string, limit = 30, opts?: ApiRequestOptions): Promise<SearchPayload> {
    const qq = encodeURIComponent(q);
    const lim = encodeURIComponent(String(limit));
    return getJson(`/search?q=${qq}&limit=${lim}`, opts);
}

export function apiGetPerson(id: string, opts?: ApiRequestOptions): Promise<PersonPayload> {
    return getJson(`/people/${encodeURIComponent(id)}`, opts);
}

export function apiGetPlace(id: string, opts?: ApiRequestOptions): Promise<PlacePayload> {
    return getJson(`/places/${encodeURIComponent(id)}`, opts);
}

export function apiGetEvent(id: string, opts?: ApiRequestOptions): Promise<EventPayload> {
    return getJson(`/events/${encodeURIComponent(id)}`, opts);
}

/* --------------------- Infinite-scroll (global spine) ---------------------- */

export function apiGetSpine(opts?: ApiRequestOptions): Promise<SpineStats> {
    return getJson(`/spine`, opts);
}

export function apiGetSlice(fromOrd: number, limit = 240, opts?: ApiRequestOptions): Promise<SlicePayload> {
    const f = encodeURIComponent(String(fromOrd));
    const l = encodeURIComponent(String(limit));
    return getJson(`/slice?fromOrd=${f}&limit=${l}`, opts);
}

export function apiResolveLoc(
    bookId: string,
    chapter: number,
    verse: number | null,
    opts?: ApiRequestOptions,
): Promise<LocPayload> {
    // /loc does not depend on translation (verse_ord is canonical), but allowing
    // the wrapper to attach ?t doesn’t hurt — server ignores it for /loc.
    const b = encodeURIComponent(bookId);
    const c = encodeURIComponent(String(chapter));
    const v = verse != null ? `&verse=${encodeURIComponent(String(verse))}` : "";
    return getJson(`/loc?bookId=${b}&chapter=${c}${v}`, opts);
}