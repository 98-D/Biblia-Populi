// apps/web/src/api.ts
// Biblia Populi — tiny typed client
//
// Now that Vite proxies /books, /chapter, etc. in dev,
// default API_BASE should be "" (same-origin). You can still
// override with VITE_API_BASE if you want to point at a remote API.

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: string; message: string } };
export type ApiRes<T> = ApiOk<T> | ApiErr;

export type BookRow = {
    bookId: string;
    ordinal: number;
    name: string;
    nameShort: string;
    testament: string;
    chaptersCount: number;
};

export type ChapterPayload = {
    canonId: string;
    translationId: string;
    translationRevisionId: string;
    bookId: string;
    chapter: number;
    verses: Array<{ chapter: number; verse: number; text: string; updatedAt: string }>;
    marks: Array<{ id: string; chapter: number; verse: number; kind: string; ord: number; payload: string | null }>;
    mentions: Array<{
        id: string;
        chapter: number;
        verse: number;
        entityType: "person" | "place" | "event";
        entityId: string;
        start: number;
        end: number;
        surface: string;
        ord: number;
    }>;
    footnotes: Array<{ id: string; chapter: number; verse: number; marker: string | null; content: string; ord: number }>;
};

export type ApiRequestOptions = {
    /** Abort after N ms (default 12s) */
    timeoutMs?: number;
    /** Extra headers */
    headers?: Record<string, string>;
};

// If VITE_API_BASE is set, use it. Otherwise use same-origin (works with Vite proxy).
const API_BASE = ((import.meta as any).env?.VITE_API_BASE ?? "") as string;

function joinUrl(base: string, path: string): string {
    const p = path.startsWith("/") ? path : `/${path}`;
    if (!base) return p; // same-origin
    const b = base.endsWith("/") ? base.slice(0, -1) : base;
    return `${b}${p}`;
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

export function apiGetBooks(opts?: ApiRequestOptions): Promise<{ canonId: string; books: BookRow[] }> {
    return getJson("/books", opts);
}

export function apiGetChapter(bookId: string, chapter: number, opts?: ApiRequestOptions): Promise<ChapterPayload> {
    return getJson(`/chapter/${encodeURIComponent(bookId)}/${chapter}`, opts);
}