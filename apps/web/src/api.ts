// apps/web/src/api.ts
// Biblia Populi — tiny typed client (upgraded for bp_* API)
//
// Server endpoints now return:
// - /meta  -> { translation, ftsEnabled }
// - /books -> { books }
// - /chapters/:bookId -> { bookId, chapters: [{chapter,startVerseOrd,endVerseOrd,verseCount}] }
// - /chapter/:bookId/:chapter -> {
//      translationId, bookId, chapter, chapterBounds,
//      verses: [{ verseKey, verseOrd, chapter, verse, text, updatedAt }],
//      ranges, links, crossrefs,
//      marks/mentions/footnotes: [] (legacy placeholders)
//   }
// - /search?q=... -> { q, mode, results }
// - /people/:id, /places/:id, /events/:id -> drawer payloads
//
// Notes:
// - Vite dev proxy: API_BASE should be "" (same-origin).
// - VITE_API_BASE can override for remote API.

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: string; message: string } };
export type ApiRes<T> = ApiOk<T> | ApiErr;

export type ApiRequestOptions = {
    /** Abort after N ms (default 12s) */
    timeoutMs?: number;
    /** Extra headers */
    headers?: Record<string, string>;
};

export type TranslationMeta = {
    translationId: string;
    name?: string;
    language?: string;
    derivedFrom?: string | null;
    licenseKind?: string;
    licenseText?: string | null;
    sourceUrl?: string | null;
    isDefault?: boolean;
    createdAt?: string;
};

export type MetaPayload = {
    translation: TranslationMeta;
    ftsEnabled: boolean;
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

    // legacy placeholders (server returns empty arrays)
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

// Drawer payloads (minimal typing; can tighten later)
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

// If VITE_API_BASE is set, use it. Otherwise use same-origin (works with Vite proxy).
const API_BASE = (import.meta.env?.VITE_API_BASE ?? "") as string;

function joinUrl(base: string, p: string): string {
    const path = p.startsWith("/") ? p : `/${p}`;
    if (!base) return path;
    const b = base.endsWith("/") ? base.slice(0, -1) : base;
    return `${b}${path}`;
}

async function getJson<T>(path: string, opts: ApiRequestOptions = {}): Promise<T> {
    const url = joinUrl(API_BASE, path);

    const controller = new AbortController();
    const timeoutMs = opts.timeoutMs ?? 12_000;
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json", ...(opts.headers ?? {}) },
            signal: controller.signal,
        });

        const text = await res.text();
        let parsed: unknown = null;
        try {
            parsed = text ? JSON.parse(text) : null;
        } catch {
            parsed = null;
        }

        if (!res.ok) {
            const maybe = parsed as Partial<ApiErr> | null;
            const msg =
                maybe?.ok === false
                    ? `${maybe.error?.code ?? "HTTP_ERROR"}: ${maybe.error?.message ?? res.statusText}`
                    : `HTTP_${res.status}: ${res.statusText}`;
            throw new Error(msg);
        }

        const data = parsed as ApiRes<T>;
        if (!data || typeof data !== "object") throw new Error("BAD_RESPONSE: Expected JSON object.");

        if ((data as ApiErr).ok === false) {
            const e = data as ApiErr;
            throw new Error(`${e.error.code}: ${e.error.message}`);
        }

        return (data as ApiOk<T>).data;
    } catch (e: any) {
        if (e?.name === "AbortError") throw new Error("TIMEOUT: Request took too long.");
        throw e;
    } finally {
        clearTimeout(t);
    }
}

/* -------------------------------- API ------------------------------------- */

export function apiGetMeta(opts?: ApiRequestOptions): Promise<MetaPayload> {
    return getJson("/meta", opts);
}

export function apiGetBooks(opts?: ApiRequestOptions): Promise<{ books: BookRow[] }> {
    return getJson("/books", opts);
}

export function apiGetChapters(bookId: string, opts?: ApiRequestOptions): Promise<ChaptersPayload> {
    return getJson(`/chapters/${encodeURIComponent(bookId)}`, opts);
}

export function apiGetChapter(bookId: string, chapter: number, opts?: ApiRequestOptions): Promise<ChapterPayload> {
    return getJson(`/chapter/${encodeURIComponent(bookId)}/${chapter}`, opts);
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