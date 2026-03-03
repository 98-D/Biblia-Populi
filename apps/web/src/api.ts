// apps/web/src/api.ts
// Biblia Populi — tiny typed client (bp_* API)
//
// Upgraded (vNext):
// - Robust base URL resolution (same-origin by default; supports absolute or path-base VITE_API_BASE)
// - Translation selection: global + per-call override + reconciliation helpers (as before)
// - Proper ETag/304 handling with in-memory response cache (fixes “freeze on 304”)
// - Optional cache control knobs per request (no-store / bypass / ttl)
// - GET + POST helpers with AbortSignal + timeout merge
// - Safer JSON parsing (handles 204/304/empty body), clearer classification
// - Better diagnostics: requestId, method, statusText, url, body snippet
// - Credentials policy: same-origin by default; can override
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

export type ApiCacheMode = "default" | "no-store" | "reload";

/**
 * Request options:
 * - cacheMode:
 *   - "default": allow ETag caching (client-side in-memory) + normal fetch
 *   - "no-store": bypass client cache and send Cache-Control: no-store
 *   - "reload": bypass client cache and send Cache-Control: no-cache
 * - cacheTtlMs: client-side TTL for cached entries (default 30s). Set 0 to disable TTL expiry.
 */
export type ApiRequestOptions = {
    /** Abort after N ms (default 12s). Set 0 to disable timeout. */
    timeoutMs?: number;
    /** Extra headers */
    headers?: Record<string, string>;
    /** Optional caller-provided AbortSignal (merged with timeout) */
    signal?: AbortSignal;

    /** Optional translationId override for this request. */
    translationId?: string | null;

    /** Fetch credentials (default "same-origin") */
    credentials?: RequestCredentials;

    /** Client cache mode (default "default") */
    cacheMode?: ApiCacheMode;

    /** Client cache TTL (ms). Default 30s. */
    cacheTtlMs?: number;
};

export type ApiErrorCode =
    | "TIMEOUT"
    | "NETWORK"
    | "HTTP_ERROR"
    | "BAD_RESPONSE"
    | "NOT_JSON"
    | "API_ERROR"
    | "ABORTED"
    | "CACHE_MISS";

export class ApiError extends Error {
    readonly code: ApiErrorCode;
    readonly status?: number;
    readonly url?: string;
    readonly method?: string;
    readonly bodyText?: string;
    readonly requestId?: string;

    constructor(
        code: ApiErrorCode,
        message: string,
        init?: { status?: number; url?: string; method?: string; bodyText?: string; requestId?: string },
    ) {
        super(`${code}: ${message}`);
        this.name = "ApiError";
        this.code = code;
        this.status = init?.status;
        this.url = init?.url;
        this.method = init?.method;
        this.bodyText = init?.bodyText;
        this.requestId = init?.requestId;
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
    auth?: { enabled: boolean; user: unknown | null };
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
    text: string | null;
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

function stripTrailingSlashes(s: string): string {
    return s.replace(/\/+$/g, "");
}

function isAbsoluteUrl(s: string): boolean {
    return /^https?:\/\//i.test(s);
}

function joinUrl(base: string, p: string): string {
    const pathname = p.startsWith("/") ? p : `/${p}`;
    if (!base) return pathname;

    const b = stripTrailingSlashes(base);

    // absolute base: https://example.com/api
    if (isAbsoluteUrl(b)) return `${b}${pathname}`;

    // path-base: /api
    const bb = b.startsWith("/") ? b : `/${b}`;
    return `${stripTrailingSlashes(bb)}${pathname}`;
}

/* ------------------------- Translation selection (client) ------------------- */

const TRANSLATION_STORAGE_KEY = "bp_translation_id_v2";
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

function normalizeTranslationId(id: string): string {
    return id.trim();
}

export function getTranslationId(): string | null {
    if (_translationIdMem != null) return _translationIdMem;

    const v2 = safeLocalStorageGet(TRANSLATION_STORAGE_KEY);
    if (v2 && v2.trim()) {
        _translationIdMem = normalizeTranslationId(v2);
        return _translationIdMem;
    }
    const v1 = safeLocalStorageGet("bp_translation_id_v1");
    if (v1 && v1.trim()) {
        _translationIdMem = normalizeTranslationId(v1);
        safeLocalStorageSet(TRANSLATION_STORAGE_KEY, _translationIdMem);
        safeLocalStorageRemove("bp_translation_id_v1");
        return _translationIdMem;
    }

    _translationIdMem = null;
    return null;
}

export function setTranslationId(id: string | null): void {
    const v = id && id.trim() ? normalizeTranslationId(id) : null;
    _translationIdMem = v;

    if (!v) safeLocalStorageRemove(TRANSLATION_STORAGE_KEY);
    else safeLocalStorageSet(TRANSLATION_STORAGE_KEY, v);
}

export function reconcileTranslationId(translations: TranslationMeta[] | undefined | null): string | null {
    const list = translations ?? [];
    if (list.length === 0) return getTranslationId();

    const current = getTranslationId();
    if (current && list.some((t) => t.translationId === current)) return current;

    const def = list.find((t) => !!t.isDefault)?.translationId ?? null;
    const next = def ?? list[0]!.translationId ?? null;
    setTranslationId(next);
    return next;
}

function withTranslation(path: string, opts?: ApiRequestOptions): string {
    const t = (opts?.translationId ?? getTranslationId())?.trim() || "";
    if (!t) return path;

    if (/[?&](t|translationId)=/i.test(path)) return path;

    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}t=${encodeURIComponent(t)}`;
}

/* ------------------------------ Query helpers ------------------------------ */

type QueryValue = string | number | boolean | null | undefined;

function addQuery(path: string, params: Record<string, QueryValue>): string {
    const url = new URL(path, "http://local");
    for (const [k, v] of Object.entries(params)) {
        if (v == null) continue;
        url.searchParams.set(k, String(v));
    }
    const q = url.search.toString();
    if (!q) return url.pathname;
    return `${url.pathname}${q}`;
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

function isLikelyJson(res: Response): boolean {
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    return ct.includes("application/json") || ct.includes("+json");
}

function formatHttpMessage(res: Response): string {
    const s = res.statusText?.trim();
    return s ? s : `HTTP ${res.status}`;
}

function getRequestId(res: Response): string | undefined {
    const v = res.headers.get("x-request-id") ?? res.headers.get("cf-ray") ?? undefined;
    return v ? v : undefined;
}

/* ----------------------------- ETag 304 cache ------------------------------ */

type CacheEntry = Readonly<{
    at: number;
    etag: string;
    data: unknown;
}>;

const DEFAULT_CACHE_TTL_MS = 30_000;
const _cache = new Map<string, CacheEntry>();

function cacheKey(method: string, url: string): string {
    // method is part of key (POST responses should not be cached by default)
    return `${method} ${url}`;
}

function cacheGet(key: string, ttlMs: number): CacheEntry | null {
    const hit = _cache.get(key);
    if (!hit) return null;
    if (ttlMs <= 0) return hit;
    if (Date.now() - hit.at > ttlMs) {
        _cache.delete(key);
        return null;
    }
    return hit;
}

function cachePut(key: string, etag: string, data: unknown): void {
    if (!etag) return;
    _cache.set(key, Object.freeze({ at: Date.now(), etag, data }));
}

function shouldCacheResponse(method: string, res: Response): boolean {
    if (method !== "GET") return false;
    if (res.status !== 200) return false;
    const etag = (res.headers.get("etag") ?? "").trim();
    return !!etag;
}

/* ------------------------------- Request core ------------------------------ */

async function requestJson<T>(
    method: "GET" | "POST",
    path: string,
    body: unknown | undefined,
    opts: ApiRequestOptions,
): Promise<T> {
    const pathWithT = withTranslation(path, opts);
    const url = joinUrl(API_BASE, pathWithT);

    const timeoutMs = opts.timeoutMs ?? 12_000;
    const timeoutCtrl = new AbortController();
    const timeoutOn = Number.isFinite(timeoutMs) && timeoutMs > 0;
    const timer = timeoutOn ? setTimeout(() => timeoutCtrl.abort(), timeoutMs) : null;

    const signal = mergeSignals(opts.signal, timeoutCtrl.signal);

    const cacheMode: ApiCacheMode = opts.cacheMode ?? "default";
    const cacheTtlMs = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;

    const headers: Record<string, string> = {
        Accept: "application/json",
        ...(opts.headers ?? {}),
    };

    // Client-side cache control preferences
    if (cacheMode === "no-store") headers["Cache-Control"] = headers["Cache-Control"] ?? "no-store";
    if (cacheMode === "reload") headers["Cache-Control"] = headers["Cache-Control"] ?? "no-cache";

    const key = cacheKey(method, url);
    const prior = cacheMode === "default" ? cacheGet(key, cacheTtlMs) : null;

    // If we have an ETag, send conditional request (unless caller forced bypass)
    if (prior?.etag && cacheMode === "default") {
        headers["If-None-Match"] = prior.etag;
    }

    try {
        let payload: string | undefined;
        if (method === "POST") {
            headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
            payload = body === undefined ? undefined : JSON.stringify(body);
        }

        const res = await fetch(url, {
            method,
            headers,
            body: payload,
            signal,
            credentials: opts.credentials ?? "same-origin",
        });

        const requestId = getRequestId(res);

        // 304 => return cached data (must exist)
        if (res.status === 304) {
            if (!prior) {
                throw new ApiError("CACHE_MISS", "Server returned 304 but client has no cached body.", {
                    status: 304,
                    url,
                    method,
                    requestId,
                });
            }
            return prior.data as T;
        }

        // 204 => no content (treat as null)
        if (res.status === 204) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return null as any as T;
        }

        const bodyText = await res.text();
        const parsed = tryParseJson(bodyText);

        if (!res.ok) {
            if (parsed.ok && isObj(parsed.value) && (parsed.value as any).ok === false) {
                const v = parsed.value as ApiErr;
                throw new ApiError("API_ERROR", v.error?.message ?? formatHttpMessage(res), {
                    status: res.status,
                    url,
                    method,
                    bodyText,
                    requestId,
                });
            }
            throw new ApiError("HTTP_ERROR", formatHttpMessage(res), {
                status: res.status,
                url,
                method,
                bodyText,
                requestId,
            });
        }

        // If server says JSON but parse failed: treat as NOT_JSON with diagnostics
        if (!parsed.ok) {
            const code: ApiErrorCode = isLikelyJson(res) ? "NOT_JSON" : "BAD_RESPONSE";
            throw new ApiError(code, "Expected JSON response but got non-JSON.", {
                status: res.status,
                url,
                method,
                bodyText,
                requestId,
            });
        }

        if (!isObj(parsed.value)) {
            throw new ApiError("BAD_RESPONSE", "Expected JSON object envelope.", {
                status: res.status,
                url,
                method,
                bodyText,
                requestId,
            });
        }

        const env = parsed.value as ApiRes<T>;
        if ((env as any).ok === false) {
            const e = env as ApiErr;
            throw new ApiError("API_ERROR", e.error?.message ?? "API error.", {
                status: res.status,
                url,
                method,
                bodyText,
                requestId,
            });
        }

        if ((env as any).ok !== true) {
            throw new ApiError("BAD_RESPONSE", "Missing ok:true in response envelope.", {
                status: res.status,
                url,
                method,
                bodyText,
                requestId,
            });
        }

        const data = (env as ApiOk<T>).data as unknown;

        // Cache successful GET responses with ETag
        if (shouldCacheResponse(method, res)) {
            const etag = (res.headers.get("etag") ?? "").trim();
            cachePut(key, etag, data);
        }

        return data as T;
    } catch (e) {
        if (e && typeof e === "object" && (e as any).name === "AbortError") {
            if (timeoutOn) throw new ApiError("TIMEOUT", "Request took too long.", { url, method });
            throw new ApiError("ABORTED", "Request aborted.", { url, method });
        }
        throw classifyFetchError(e);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function getJson<T>(path: string, opts: ApiRequestOptions = {}): Promise<T> {
    return requestJson("GET", path, undefined, opts);
}

async function postJson<T>(path: string, body?: unknown, opts: ApiRequestOptions = {}): Promise<T> {
    return requestJson("POST", path, body, opts);
}

/* -------------------------------- API ------------------------------------- */

export function apiGetMeta(opts?: ApiRequestOptions): Promise<MetaPayload> {
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
    const path = addQuery("/search", { q, limit });
    return getJson(path, opts);
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
    const path = addQuery("/slice", { fromOrd, limit });
    return getJson(path, opts);
}

export function apiResolveLoc(
    bookId: string,
    chapter: number,
    verse: number | null,
    opts?: ApiRequestOptions,
): Promise<LocPayload> {
    const path = addQuery("/loc", { bookId, chapter, ...(verse != null ? { verse } : {}) });
    return getJson(path, opts);
}

/* ------------------------------ Auth endpoints ----------------------------- */

export function apiAuthMe(opts?: ApiRequestOptions): Promise<{ user: unknown | null }> {
    return getJson("/auth/me", opts);
}

export function apiAuthLogout(opts?: ApiRequestOptions): Promise<{ redirect: string }> {
    return postJson("/auth/logout", undefined, opts);
}

/* -------------------------- Convenience / Debug ----------------------------- */

export function formatApiError(e: unknown): string {
    if (!(e instanceof ApiError)) {
        const msg = e instanceof Error ? e.message : String(e);
        return msg || "Unknown error.";
    }
    const parts: string[] = [];
    parts.push(e.code);
    if (typeof e.status === "number") parts.push(String(e.status));
    if (e.method) parts.push(e.method);
    if (e.url) parts.push(e.url);
    if (e.requestId) parts.push(`req:${e.requestId}`);

    if (e.bodyText) {
        const t = e.bodyText.trim();
        if (t) parts.push(t.length > 240 ? `${t.slice(0, 240)}…` : t);
    }

    return parts.join(" · ");
}