// apps/web/src/auth/authApi.ts
// Biblia.to — auth client (cookie session + Google OAuth redirect)
//
// Aligned with current API envelope:
//   { ok: true, data: ... }
//   { ok: false, error: { code, message } }
//
// Goals:
// - Never fetch OAuth start URL; only top-level navigation
// - Robust JSON parsing for empty / non-JSON / malformed responses
// - Normalize transport/server failures into a stable ApiError
// - Keep UI-facing auth types stable even if API internals evolve
// - Align with current server.ts auth payloads
// - Same-origin by default; supports explicit VITE_API_BASE override
// - Better abort / timeout / diagnostics behavior
// - Preserve returnTo on OAuth start

export type ApiError = Readonly<{
    code: string;
    message: string;
}>;

export type AuthUser = Readonly<{
    id: string;
    email: string | null;
    displayName: string | null;
    emailVerifiedAt: string | null;
}>;

export type AuthMePayload =
     | Readonly<{ ok: true; user: AuthUser | null }>
     | Readonly<{ ok: false; error: ApiError }>;

export type AuthLogoutPayload =
     | Readonly<{ ok: true; redirect: string | null }>
     | Readonly<{ ok: false; error: ApiError }>;

type ApiEnvelopeOk<T> = Readonly<{ ok: true; data: T }>;
type ApiEnvelopeErr = Readonly<{ ok: false; error: ApiError }>;
type ApiEnvelope<T> = ApiEnvelopeOk<T> | ApiEnvelopeErr;

type AuthMeResponseData = Readonly<{
    user:
         | {
        id: string;
        email: string | null;
        displayName: string | null;
        emailVerifiedAt: string | Date | null;
        disabledAt?: string | Date | null;
    }
         | null;
}>;

type AuthLogoutResponseData = Readonly<{
    redirect?: string | null;
}>;

type BrowserEnv = {
    VITE_API_BASE?: string;
};

type ApiFetchEnvelopeOptions<T> = Readonly<{
    emptyOkData: T;
    timeoutMs?: number;
}>;

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_ERROR_TEXT_LEN = 500;

function trimSlash(s: string): string {
    return s.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const t = value.trim();
    return t.length > 0 ? t : null;
}

function toIsoOrNull(value: unknown): string | null {
    if (value == null) return null;

    if (typeof value === "string") {
        const t = value.trim();
        return t.length > 0 ? t : null;
    }

    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value.toISOString();
    }

    return null;
}

function normalizeAuthUser(input: unknown): AuthUser | null {
    if (input == null) return null;
    if (!isRecord(input)) return null;

    const id = input.id;
    if (typeof id !== "string" || id.trim().length === 0) return null;

    return {
        id: id.trim(),
        email: asStringOrNull(input.email),
        displayName: asStringOrNull(input.displayName),
        emailVerifiedAt: toIsoOrNull(input.emailVerifiedAt),
    };
}

function asApiError(code: string, message: string): ApiError {
    const c = code.trim() || "unknown_error";
    const m = message.trim() || c;
    return { code: c, message: m };
}

function envObject(): BrowserEnv {
    const meta = import.meta as ImportMeta & { env?: BrowserEnv };
    return meta.env ?? {};
}

function isAbsoluteHttpUrl(input: string): boolean {
    try {
        const u = new URL(input);
        return u.protocol === "http:" || u.protocol === "https:";
    } catch {
        return false;
    }
}

function isPathLikeBase(input: string): boolean {
    return input.startsWith("/");
}

function apiBase(): string {
    const env = envObject();
    const explicit = env.VITE_API_BASE;

    if (typeof explicit === "string" && explicit.trim()) {
        const normalized = explicit.trim();

        if (isAbsoluteHttpUrl(normalized)) {
            return trimSlash(normalized);
        }

        if (isPathLikeBase(normalized)) {
            return trimSlash(normalized);
        }
    }

    return "";
}

export { apiBase };

function buildUrl(path: string): string {
    const p = path.startsWith("/") ? path : `/${path}`;
    const base = apiBase();

    if (!base) {
        return p;
    }

    if (isAbsoluteHttpUrl(base)) {
        return new URL(p, `${trimSlash(base)}/`).toString();
    }

    return `${trimSlash(base)}${p}`;
}

function isJsonContentType(ct: string | null): boolean {
    if (!ct) return false;
    const v = ct.toLowerCase();
    return v.includes("application/json") || v.includes("+json");
}

function mergeHeaders(base: Record<string, string>, extra?: HeadersInit): Headers {
    const out = new Headers(base);
    if (!extra) return out;

    if (extra instanceof Headers) {
        extra.forEach((value, key) => out.set(key, value));
        return out;
    }

    if (Array.isArray(extra)) {
        for (const [key, value] of extra) out.set(key, value);
        return out;
    }

    for (const [key, value] of Object.entries(extra)) {
        if (typeof value !== "undefined") out.set(key, String(value));
    }

    return out;
}

function clipErrorText(text: string): string {
    const trimmed = text.trim();
    if (trimmed.length <= MAX_ERROR_TEXT_LEN) return trimmed;
    return `${trimmed.slice(0, MAX_ERROR_TEXT_LEN)}…`;
}

function anySignalAborted(signal?: AbortSignal | null): boolean {
    return !!signal?.aborted;
}

function mergeAbortSignals(
     a?: AbortSignal,
     b?: AbortSignal,
): { signal?: AbortSignal; cleanup: () => void } {
    if (!a && !b) {
        return { signal: undefined, cleanup: () => void 0 };
    }
    if (a && !b) {
        return { signal: a, cleanup: () => void 0 };
    }
    if (!a && b) {
        return { signal: b, cleanup: () => void 0 };
    }

    const controller = new AbortController();

    const abortFrom = (source: AbortSignal) => {
        const reason = (source as AbortSignal & { reason?: unknown }).reason;
        try {
            controller.abort(reason);
        } catch {
            controller.abort();
        }
    };

    if (a?.aborted) abortFrom(a);
    if (b?.aborted) abortFrom(b);

    const onAbortA = () => {
        if (a) abortFrom(a);
    };
    const onAbortB = () => {
        if (b) abortFrom(b);
    };

    a?.addEventListener("abort", onAbortA, { once: true });
    b?.addEventListener("abort", onAbortB, { once: true });

    return {
        signal: controller.signal,
        cleanup: () => {
            a?.removeEventListener("abort", onAbortA);
            b?.removeEventListener("abort", onAbortB);
        },
    };
}

function createTimeoutSignal(
     timeoutMs: number | undefined,
): { signal?: AbortSignal; cancel: () => void } {
    if (typeof window === "undefined") {
        return { signal: undefined, cancel: () => void 0 };
    }

    const ms =
         typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0
              ? Math.floor(timeoutMs)
              : DEFAULT_TIMEOUT_MS;

    const controller = new AbortController();
    const id = window.setTimeout(() => {
        try {
            controller.abort(new DOMException("Request timed out", "TimeoutError"));
        } catch {
            controller.abort();
        }
    }, ms);

    return {
        signal: controller.signal,
        cancel: () => window.clearTimeout(id),
    };
}

async function apiFetchEnvelope<T>(
     path: string,
     init: RequestInit,
     opts: ApiFetchEnvelopeOptions<T>,
): Promise<ApiEnvelope<T>> {
    const url = buildUrl(path);
    const hasBody = typeof init.body !== "undefined" && init.body !== null;

    const headers = mergeHeaders(
         {
             Accept: "application/json",
             ...(hasBody ? { "Content-Type": "application/json" } : {}),
         },
         init.headers,
    );

    const timeout = createTimeoutSignal(opts.timeoutMs);
    const merged = mergeAbortSignals(init.signal ?? undefined, timeout.signal);

    let res: Response;
    try {
        if (anySignalAborted(merged.signal)) {
            return {
                ok: false,
                error: asApiError("aborted", "Request was aborted"),
            };
        }

        res = await fetch(url, {
            ...init,
            signal: merged.signal,
            credentials: "include",
            headers,
        });
    } catch (error) {
        timeout.cancel();
        merged.cleanup();

        if (error instanceof DOMException && error.name === "AbortError") {
            const timedOut = timeout.signal?.aborted;
            return {
                ok: false,
                error: asApiError(
                     timedOut ? "timeout" : "aborted",
                     timedOut ? "Request timed out" : "Request was aborted",
                ),
            };
        }

        return {
            ok: false,
            error: asApiError(
                 "network_error",
                 error instanceof Error ? error.message : "Network error",
            ),
        };
    }

    timeout.cancel();
    merged.cleanup();

    if (res.status === 204) {
        return { ok: true, data: opts.emptyOkData };
    }

    let text = "";
    try {
        text = await res.text();
    } catch {
        if (res.ok) {
            return { ok: true, data: opts.emptyOkData };
        }
        return {
            ok: false,
            error: asApiError("read_error", `Failed to read response body (HTTP ${res.status})`),
        };
    }

    const trimmed = text.trim();
    const ct = res.headers.get("content-type");

    if (!trimmed) {
        if (res.ok) {
            return { ok: true, data: opts.emptyOkData };
        }

        return {
            ok: false,
            error: asApiError("empty_error_response", `HTTP ${res.status}`),
        };
    }

    if (!isJsonContentType(ct)) {
        if (res.ok) {
            return {
                ok: false,
                error: asApiError(
                     "non_json",
                     `Expected JSON response but received ${ct || "unknown content type"}`,
                ),
            };
        }

        return {
            ok: false,
            error: asApiError("non_json", clipErrorText(trimmed) || `HTTP ${res.status}`),
        };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        return {
            ok: false,
            error: asApiError("bad_json", `Malformed JSON response (HTTP ${res.status})`),
        };
    }

    if (!isRecord(parsed)) {
        return {
            ok: false,
            error: asApiError("bad_payload", "Response payload is not an object"),
        };
    }

    const ok = parsed.ok;

    if (ok === false) {
        const rawError = parsed.error;
        if (isRecord(rawError)) {
            return {
                ok: false,
                error: asApiError(
                     typeof rawError.code === "string" ? rawError.code : "api_error",
                     typeof rawError.message === "string" ? rawError.message : `HTTP ${res.status}`,
                ),
            };
        }

        return {
            ok: false,
            error: asApiError("api_error", `HTTP ${res.status}`),
        };
    }

    if (ok === true) {
        return {
            ok: true,
            data: Object.prototype.hasOwnProperty.call(parsed, "data")
                 ? (parsed.data as T)
                 : opts.emptyOkData,
        };
    }

    if (!res.ok) {
        return {
            ok: false,
            error: asApiError("http_error", `HTTP ${res.status}`),
        };
    }

    return {
        ok: false,
        error: asApiError("bad_payload", "Missing ok field in API response"),
    };
}

export async function apiAuthMe(signal?: AbortSignal): Promise<AuthMePayload> {
    const res = await apiFetchEnvelope<AuthMeResponseData>(
         "/auth/me",
         { method: "GET", signal },
         { emptyOkData: { user: null } },
    );

    if (!res.ok) {
        return res;
    }

    return {
        ok: true,
        user: normalizeAuthUser(res.data.user),
    };
}

export async function apiAuthLogout(signal?: AbortSignal): Promise<AuthLogoutPayload> {
    const res = await apiFetchEnvelope<AuthLogoutResponseData>(
         "/auth/logout",
         { method: "POST", signal },
         { emptyOkData: { redirect: null } },
    );

    if (!res.ok) {
        return res;
    }

    return {
        ok: true,
        redirect:
             typeof res.data.redirect === "string" && res.data.redirect.trim()
                  ? res.data.redirect.trim()
                  : null,
    };
}

function isSafeReturnTo(value: string): boolean {
    try {
        const url = new URL(value, window.location.origin);
        return url.origin === window.location.origin;
    } catch {
        return false;
    }
}

export function googleStartUrl(returnTo?: string): string {
    const url = new URL(buildUrl("/auth/google/start"), window.location.origin);

    const next =
         typeof returnTo === "string" && returnTo.trim() && isSafeReturnTo(returnTo)
              ? new URL(returnTo, window.location.origin).toString()
              : window.location.href;

    url.searchParams.set("returnTo", next);
    return url.toString();
}

/**
 * IMPORTANT:
 * OAuth start MUST be a top-level navigation, never fetch().
 */
export function navigateToGoogleStart(returnTo?: string): void {
    if (typeof window === "undefined") return;
    window.location.assign(googleStartUrl(returnTo ?? window.location.href));
}