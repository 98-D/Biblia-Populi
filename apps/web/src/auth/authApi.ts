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
    user: {
        id: string;
        email: string | null;
        displayName: string | null;
        emailVerifiedAt: string | Date | null;
        disabledAt?: string | Date | null;
    } | null;
}>;

type AuthLogoutResponseData = Readonly<{
    redirect?: string | null;
}>;

function trimSlash(s: string): string {
    return s.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringOrNull(value: unknown): string | null {
    return typeof value === "string" ? value : null;
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

function apiBase(): string {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const explicit = env?.VITE_API_BASE;
    if (typeof explicit === "string" && explicit.trim()) {
        return trimSlash(explicit.trim());
    }
    return "http://localhost:3000";
}

export { apiBase };

function buildUrl(path: string): string {
    const base = apiBase();
    const p = path.startsWith("/") ? path : `/${path}`;
    return new URL(p, `${trimSlash(base)}/`).toString();
}

function isJsonContentType(ct: string | null): boolean {
    if (!ct) return false;
    const v = ct.toLowerCase();
    return v.includes("application/json") || v.includes("+json");
}

function mergeHeaders(
     base: Record<string, string>,
     extra?: HeadersInit,
): Headers {
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

type FetchEnvelopeOptions<T> = Readonly<{
    emptyOkData: T;
}>;

async function apiFetchEnvelope<T>(
     path: string,
     init: RequestInit,
     opts: FetchEnvelopeOptions<T>,
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

    let res: Response;
    try {
        res = await fetch(url, {
            ...init,
            credentials: "include",
            mode: "cors",
            headers,
        });
    } catch (error) {
        return {
            ok: false,
            error: asApiError(
                 "network_error",
                 error instanceof Error ? error.message : "Network error",
            ),
        };
    }

    if (res.status === 204) {
        return { ok: true, data: opts.emptyOkData };
    }

    const ct = res.headers.get("content-type");
    const text = await res.text();
    const trimmed = text.trim();

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
        const msg = trimmed.length > 500 ? `${trimmed.slice(0, 500)}…` : trimmed;
        return {
            ok: false,
            error: asApiError("non_json", msg || `HTTP ${res.status}`),
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
            data: ("data" in parsed ? (parsed.data as T) : opts.emptyOkData),
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

    const user = normalizeAuthUser(res.data.user);
    return { ok: true, user };
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
        redirect: typeof res.data.redirect === "string" && res.data.redirect.trim()
             ? res.data.redirect
             : null,
    };
}

export function googleStartUrl(_returnTo?: string): string {
    // Server currently owns redirect targets; ignore returnTo until explicitly supported server-side.
    return buildUrl("/auth/google/start");
}

/**
 * IMPORTANT:
 * OAuth start MUST be a top-level navigation, never fetch().
 */
export function navigateToGoogleStart(returnTo?: string): void {
    if (typeof window === "undefined") return;
    const url = googleStartUrl(returnTo ?? window.location.href);
    window.location.assign(url);
}