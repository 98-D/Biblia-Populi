// apps/web/src/api.ts
// Biblia.to — hardened typed API client
//
// Goals:
// - same-origin by default, optional VITE_API_BASE override
// - stable translation selection + reconciliation
// - GET envelope decoding with safe 204 / 304 handling
// - in-memory ETag cache that cannot freeze on 304
// - merged abort signals + timeout classification
// - safer parsing / narrower envelope assumptions
// - explicit diagnostics with request id + body snippet
// - stricter query encoding / path hygiene
// - deterministic cache-keying + cache invalidation hooks

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: string; message: string } };
export type ApiRes<T> = ApiOk<T> | ApiErr;

export type ApiCacheMode = "default" | "no-store" | "reload";

export type ApiRequestOptions = Readonly<{
    timeoutMs?: number;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    translationId?: string | null;
    credentials?: RequestCredentials;
    cacheMode?: ApiCacheMode;
    cacheTtlMs?: number;
}>;

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
        init?: Readonly<{
            status?: number;
            url?: string;
            method?: string;
            bodyText?: string;
            requestId?: string;
        }>,
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
    abbrs: string | null;
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

/* ------------------------------ Base URL --------------------------------- */

const RAW_API_BASE = String(import.meta.env?.VITE_API_BASE ?? "");

function stripTrailingSlashes(value: string): string {
    return value.replace(/\/+$/g, "");
}

function stripLeadingSlashes(value: string): string {
    return value.replace(/^\/+/g, "");
}

function isAbsoluteUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
}

function normalizeApiBase(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return "";

    if (isAbsoluteUrl(trimmed)) {
        return stripTrailingSlashes(trimmed);
    }

    const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return stripTrailingSlashes(withLeading);
}

function joinUrl(base: string, path: string): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const normalizedBase = normalizeApiBase(base);

    if (!normalizedBase) return normalizedPath;
    return `${normalizedBase}${normalizedPath}`;
}

const API_BASE = normalizeApiBase(RAW_API_BASE);

/* ------------------------ Translation selection -------------------------- */

const TRANSLATION_STORAGE_KEY = "bp_translation_id_v2";
const LEGACY_TRANSLATION_STORAGE_KEY = "bp_translation_id_v1";

let translationIdMem: string | null = null;

function canUseLocalStorage(): boolean {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeLocalStorageGet(key: string): string | null {
    if (!canUseLocalStorage()) return null;
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeLocalStorageSet(key: string, value: string): void {
    if (!canUseLocalStorage()) return;
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // ignore quota/privacy mode failures
    }
}

function safeLocalStorageRemove(key: string): void {
    if (!canUseLocalStorage()) return;
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
    if (translationIdMem !== null) return translationIdMem;

    const current = safeLocalStorageGet(TRANSLATION_STORAGE_KEY);
    if (current && current.trim()) {
        translationIdMem = normalizeTranslationId(current);
        return translationIdMem;
    }

    const legacy = safeLocalStorageGet(LEGACY_TRANSLATION_STORAGE_KEY);
    if (legacy && legacy.trim()) {
        translationIdMem = normalizeTranslationId(legacy);
        safeLocalStorageSet(TRANSLATION_STORAGE_KEY, translationIdMem);
        safeLocalStorageRemove(LEGACY_TRANSLATION_STORAGE_KEY);
        return translationIdMem;
    }

    return null;
}

export function setTranslationId(id: string | null): void {
    const next = id && id.trim() ? normalizeTranslationId(id) : null;
    translationIdMem = next;

    if (next === null) {
        safeLocalStorageRemove(TRANSLATION_STORAGE_KEY);
        return;
    }

    safeLocalStorageSet(TRANSLATION_STORAGE_KEY, next);
}

export function reconcileTranslationId(
    translations: TranslationMeta[] | undefined | null,
): string | null {
    const list = translations ?? [];
    if (list.length === 0) return getTranslationId();

    const current = getTranslationId();
    if (current && list.some((t) => t.translationId === current)) {
        return current;
    }

    const defaultId =
        list.find((t) => t.isDefault)?.translationId ??
        list[0]?.translationId ??
        null;

    setTranslationId(defaultId);
    return defaultId;
}

function withTranslation(path: string, opts?: ApiRequestOptions): string {
    const translationId = (opts?.translationId ?? getTranslationId())?.trim() ?? "";
    if (!translationId) return path;

    if (/[?&](t|translationId)=/i.test(path)) return path;

    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}t=${encodeURIComponent(translationId)}`;
}

/* ------------------------------ Query helpers ---------------------------- */

type QueryValue = string | number | boolean | null | undefined;

function addQuery(path: string, params: Record<string, QueryValue>): string {
    const url = new URL(path, "http://local");
    for (const [key, value] of Object.entries(params)) {
        if (value == null) continue;
        url.searchParams.set(key, String(value));
    }
    return `${url.pathname}${url.search}`;
}

/* --------------------------- JSON / envelope ----------------------------- */

function isObj(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function hasOwn<K extends string>(
    value: Record<string, unknown>,
    key: K,
): value is Record<K, unknown> {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
    if (!text) return { ok: true, value: null };
    try {
        return { ok: true, value: JSON.parse(text) as unknown };
    } catch {
        return { ok: false };
    }
}

function isApiErrEnvelope(value: unknown): value is ApiErr {
    if (!isObj(value)) return false;
    if (!hasOwn(value, "ok") || value.ok !== false) return false;
    if (!hasOwn(value, "error") || !isObj(value.error)) return false;
    return typeof value.error.code === "string" && typeof value.error.message === "string";
}

function isApiOkEnvelope<T>(value: unknown): value is ApiOk<T> {
    if (!isObj(value)) return false;
    if (!hasOwn(value, "ok") || value.ok !== true) return false;
    return hasOwn(value, "data");
}

function isLikelyJson(res: Response): boolean {
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    return contentType.includes("application/json") || contentType.includes("+json");
}

function formatHttpMessage(res: Response): string {
    const statusText = res.statusText.trim();
    return statusText ? statusText : `HTTP ${res.status}`;
}

function getRequestId(res: Response): string | undefined {
    const id = res.headers.get("x-request-id") ?? res.headers.get("cf-ray");
    return id?.trim() || undefined;
}

function bodySnippet(text: string | undefined): string | undefined {
    if (!text) return undefined;
    const normalized = text.trim();
    if (!normalized) return undefined;
    return normalized.length > 320 ? `${normalized.slice(0, 320)}…` : normalized;
}

/* ---------------------------- Abort / timeout ---------------------------- */

type MergedSignal = {
    signal?: AbortSignal;
    cleanup: () => void;
    didTimeout: () => boolean;
    wasExternallyAborted: () => boolean;
};

function mergeSignalsWithTimeout(
    externalSignal: AbortSignal | undefined,
    timeoutMs: number,
): MergedSignal {
    const timeoutCtrl = new AbortController();
    const mergedCtrl = new AbortController();

    let timedOut = false;
    let externallyAborted = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const abortMerged = () => {
        if (!mergedCtrl.signal.aborted) mergedCtrl.abort();
    };

    const onExternalAbort = () => {
        externallyAborted = true;
        abortMerged();
    };

    const onTimeoutAbort = () => {
        timedOut = true;
        abortMerged();
    };

    if (externalSignal?.aborted) {
        externallyAborted = true;
        abortMerged();
    } else if (externalSignal) {
        externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }

    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timer = setTimeout(() => {
            timeoutCtrl.abort();
        }, timeoutMs);

        if (timeoutCtrl.signal.aborted) {
            onTimeoutAbort();
        } else {
            timeoutCtrl.signal.addEventListener("abort", onTimeoutAbort, { once: true });
        }
    }

    return {
        signal: mergedCtrl.signal,
        cleanup: () => {
            if (timer) clearTimeout(timer);
            if (externalSignal) {
                externalSignal.removeEventListener("abort", onExternalAbort);
            }
            timeoutCtrl.signal.removeEventListener("abort", onTimeoutAbort);
        },
        didTimeout: () => timedOut,
        wasExternallyAborted: () => externallyAborted,
    };
}

function classifyFetchError(
    error: unknown,
    method: string,
    url: string,
    merged: Pick<MergedSignal, "didTimeout" | "wasExternallyAborted">,
): ApiError {
    if (error instanceof ApiError) return error;

    if (error && typeof error === "object" && "name" in error) {
        const name = String((error as { name?: unknown }).name ?? "");
        if (name === "AbortError") {
            if (merged.didTimeout()) {
                return new ApiError("TIMEOUT", "Request took too long.", { method, url });
            }
            if (merged.wasExternallyAborted()) {
                return new ApiError("ABORTED", "Request aborted.", { method, url });
            }
            return new ApiError("ABORTED", "Request aborted.", { method, url });
        }
    }

    const message = error instanceof Error ? error.message : String(error);
    return new ApiError("NETWORK", message || "Network error.", { method, url });
}

/* ------------------------------ ETag cache ------------------------------- */

type CacheEntry = Readonly<{
    at: number;
    etag: string;
    data: unknown;
}>;

const DEFAULT_CACHE_TTL_MS = 30_000;
const responseCache = new Map<string, CacheEntry>();

function cacheKey(method: string, url: string): string {
    return `${method.toUpperCase()} ${url}`;
}

function cacheGet(key: string, ttlMs: number): CacheEntry | null {
    const hit = responseCache.get(key);
    if (!hit) return null;

    if (ttlMs > 0 && Date.now() - hit.at > ttlMs) {
        responseCache.delete(key);
        return null;
    }

    return hit;
}

function cachePut(key: string, etag: string, data: unknown): void {
    const cleanEtag = etag.trim();
    if (!cleanEtag) return;

    responseCache.set(
        key,
        Object.freeze({
            at: Date.now(),
            etag: cleanEtag,
            data,
        }),
    );
}

function cacheDelete(key: string): void {
    responseCache.delete(key);
}

function shouldCacheResponse(method: string, res: Response): boolean {
    if (method !== "GET") return false;
    if (res.status !== 200) return false;
    return Boolean((res.headers.get("etag") ?? "").trim());
}

/* ----------------------------- Request core ------------------------------ */

type HttpMethod = "GET" | "POST";

function normalizeTimeoutMs(value: number | undefined): number {
    if (!Number.isFinite(value ?? NaN)) return 12_000;
    return Math.max(1, Math.trunc(value as number));
}

function normalizeCacheTtlMs(value: number | undefined): number {
    if (!Number.isFinite(value ?? NaN)) return DEFAULT_CACHE_TTL_MS;
    return Math.max(0, Math.trunc(value as number));
}

function buildHeaders(source: Record<string, string> | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!source) return out;

    for (const [key, value] of Object.entries(source)) {
        out[key] = value;
    }

    return out;
}

async function readResponseBodyText(res: Response): Promise<string> {
    try {
        return await res.text();
    } catch {
        return "";
    }
}

async function requestJson<T>(
    method: HttpMethod,
    path: string,
    body: unknown | undefined,
    opts: ApiRequestOptions = {},
): Promise<T> {
    const pathWithTranslation = withTranslation(path, opts);
    const url = joinUrl(API_BASE, pathWithTranslation);

    const timeoutMs = normalizeTimeoutMs(opts.timeoutMs);
    const cacheMode = opts.cacheMode ?? "default";
    const cacheTtlMs = normalizeCacheTtlMs(opts.cacheTtlMs);
    const credentials = opts.credentials ?? "same-origin";

    const merged = mergeSignalsWithTimeout(opts.signal, timeoutMs);

    const headers = buildHeaders(opts.headers);
    if (headers.Accept == null) {
        headers.Accept = "application/json";
    }

    if (cacheMode === "no-store" && headers["Cache-Control"] == null) {
        headers["Cache-Control"] = "no-store";
    } else if (cacheMode === "reload" && headers["Cache-Control"] == null) {
        headers["Cache-Control"] = "no-cache";
    }

    const key = cacheKey(method, url);
    const prior = cacheMode === "default" ? cacheGet(key, cacheTtlMs) : null;

    if (method === "GET" && cacheMode === "default" && prior?.etag) {
        headers["If-None-Match"] = prior.etag;
    }

    try {
        let payload: string | undefined;
        if (method === "POST" && body !== undefined) {
            payload = JSON.stringify(body);
            if (headers["Content-Type"] == null) {
                headers["Content-Type"] = "application/json";
            }
        }

        const res = await fetch(url, {
            method,
            headers,
            body: payload,
            signal: merged.signal,
            credentials,
        });

        const requestId = getRequestId(res);

        if (res.status === 304) {
            if (!prior) {
                cacheDelete(key);
                throw new ApiError(
                    "CACHE_MISS",
                    "Server returned 304 but client has no cached response body.",
                    {
                        status: 304,
                        method,
                        url,
                        requestId,
                    },
                );
            }
            return prior.data as T;
        }

        if (res.status === 204) {
            return null as T;
        }

        const text = await readResponseBodyText(res);
        const parsed = tryParseJson(text);

        if (!res.ok) {
            if (parsed.ok && isApiErrEnvelope(parsed.value)) {
                throw new ApiError("API_ERROR", parsed.value.error.message, {
                    status: res.status,
                    method,
                    url,
                    requestId,
                    bodyText: bodySnippet(text),
                });
            }

            throw new ApiError("HTTP_ERROR", formatHttpMessage(res), {
                status: res.status,
                method,
                url,
                requestId,
                bodyText: bodySnippet(text),
            });
        }

        if (!parsed.ok) {
            throw new ApiError(
                isLikelyJson(res) ? "NOT_JSON" : "BAD_RESPONSE",
                "Expected JSON response but received non-JSON content.",
                {
                    status: res.status,
                    method,
                    url,
                    requestId,
                    bodyText: bodySnippet(text),
                },
            );
        }

        if (!isApiOkEnvelope<T>(parsed.value)) {
            if (isApiErrEnvelope(parsed.value)) {
                throw new ApiError("API_ERROR", parsed.value.error.message, {
                    status: res.status,
                    method,
                    url,
                    requestId,
                    bodyText: bodySnippet(text),
                });
            }

            throw new ApiError("BAD_RESPONSE", "Missing ok:true response envelope.", {
                status: res.status,
                method,
                url,
                requestId,
                bodyText: bodySnippet(text),
            });
        }

        const data = parsed.value.data;

        if (shouldCacheResponse(method, res)) {
            cachePut(key, res.headers.get("etag") ?? "", data);
        } else if (method === "GET" && cacheMode !== "default") {
            cacheDelete(key);
        }

        return data;
    } catch (error: unknown) {
        throw classifyFetchError(error, method, url, merged);
    } finally {
        merged.cleanup();
    }
}

async function getJson<T>(path: string, opts: ApiRequestOptions = {}): Promise<T> {
    return requestJson<T>("GET", path, undefined, opts);
}

async function postJson<T>(
    path: string,
    body?: unknown,
    opts: ApiRequestOptions = {},
): Promise<T> {
    return requestJson<T>("POST", path, body, opts);
}

/* --------------------------------- API ---------------------------------- */

export function apiGetMeta(opts?: ApiRequestOptions): Promise<MetaPayload> {
    return getJson("/meta", opts);
}

export function apiGetTranslations(opts?: ApiRequestOptions): Promise<TranslationsPayload> {
    return getJson("/translations", opts);
}

export function apiGetBooks(opts?: ApiRequestOptions): Promise<{ books: BookRow[] }> {
    return getJson("/books", opts);
}

export function apiGetChapters(
    bookId: string,
    opts?: ApiRequestOptions,
): Promise<ChaptersPayload> {
    return getJson(`/chapters/${encodeURIComponent(bookId)}`, opts);
}

export function apiGetChapter(
    bookId: string,
    chapter: number,
    opts?: ApiRequestOptions,
): Promise<ChapterPayload> {
    return getJson(
        `/chapter/${encodeURIComponent(bookId)}/${encodeURIComponent(String(Math.trunc(chapter)))}`,
        opts,
    );
}

export function apiSearch(
    q: string,
    limit = 30,
    opts?: ApiRequestOptions,
): Promise<SearchPayload> {
    return getJson(
        addQuery("/search", {
            q,
            limit: Math.max(1, Math.trunc(limit)),
        }),
        opts,
    );
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

export function apiGetSpine(opts?: ApiRequestOptions): Promise<SpineStats> {
    return getJson("/spine", opts);
}

export function apiGetSlice(
    fromOrd: number,
    limit = 240,
    opts?: ApiRequestOptions,
): Promise<SlicePayload> {
    return getJson(
        addQuery("/slice", {
            fromOrd: Math.trunc(fromOrd),
            limit: Math.max(1, Math.trunc(limit)),
        }),
        opts,
    );
}

export function apiResolveLoc(
    bookId: string,
    chapter: number,
    verse: number | null,
    opts?: ApiRequestOptions,
): Promise<LocPayload> {
    const cleanBookId = normalizeBookId(bookId);
    return getJson(
        addQuery("/loc", {
            bookId: cleanBookId,
            chapter: Math.trunc(chapter),
            ...(verse != null ? { verse: Math.trunc(verse) } : {}),
        }),
        opts,
    );
}

export function apiAuthMe(opts?: ApiRequestOptions): Promise<{ user: unknown | null }> {
    return getJson("/auth/me", opts);
}

export function apiAuthLogout(opts?: ApiRequestOptions): Promise<{ redirect: string }> {
    return postJson("/auth/logout", undefined, opts);
}

/* -------------------------- Convenience / debug -------------------------- */

function normalizeBookId(bookId: string): string {
    return bookId.trim().toUpperCase();
}

export function formatApiError(error: unknown): string {
    if (!(error instanceof ApiError)) {
        const message = error instanceof Error ? error.message : String(error);
        return message || "Unknown error.";
    }

    const parts: string[] = [error.code];

    if (typeof error.status === "number") parts.push(String(error.status));
    if (error.method) parts.push(error.method);
    if (error.url) parts.push(error.url);
    if (error.requestId) parts.push(`req:${error.requestId}`);
    if (error.bodyText) parts.push(error.bodyText);

    return parts.join(" · ");
}

export function clearApiResponseCache(): void {
    responseCache.clear();
}

export function getApiBase(): string {
    return API_BASE;
}

export function makeApiUrl(path: string): string {
    const normalizedPath = `/${stripLeadingSlashes(path)}`;
    return joinUrl(API_BASE, normalizedPath);
}