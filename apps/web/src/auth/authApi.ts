// apps/web/src/auth/authApi.ts
// Biblia Populi — auth client (cookie session + Google OAuth redirect)
// Goals:
// - Never "fetch" an OAuth start URL (must be a top-level navigation)
// - Robust JSON parsing (handles non-JSON + empty bodies)
// - Standardized {ok:false,error} shape on transport failures

export type ApiError = { code: string; message: string };

export type AuthUser = {
    id: string;
    email: string | null;
    name: string | null;
    pictureUrl: string | null;
};

export type AuthMePayload =
    | { ok: true; user: AuthUser | null }
    | { ok: false; error: ApiError };

export type AuthOkPayload =
    | { ok: true }
    | { ok: false; error: ApiError };

function trimSlash(s: string): string {
    return s.replace(/\/+$/, "");
}

export function apiBase(): string {
    // Prefer Vite env, fallback to localhost API.
    const v = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE;
    if (typeof v === "string" && v.trim()) return trimSlash(v.trim());
    return "http://localhost:3000";
}

function buildUrl(path: string): string {
    const base = apiBase();
    const p = path.startsWith("/") ? path : `/${path}`;
    // Use URL to normalize any weirdness.
    return new URL(p, `${trimSlash(base)}/`).toString();
}

function isJsonContentType(ct: string | null): boolean {
    if (!ct) return false;
    const v = ct.toLowerCase();
    return v.includes("application/json") || v.includes("+json");
}

function asApiError(code: string, message: string): ApiError {
    return { code, message: message || code };
}

type FetchJsonOpts<T> = {
    // When the server returns 204/empty body, return this value instead of erroring.
    empty: T;
};

async function apiFetchJson<T>(path: string, init?: RequestInit, opts?: FetchJsonOpts<T>): Promise<T> {
    const url = buildUrl(path);

    // NOTE: Do NOT force Content-Type for GET; it can trigger preflight.
    // We send Accept and only send Content-Type when there is a body.
    const hasBody = typeof init?.body !== "undefined" && init?.body !== null;
    const headers: Record<string, string> = {
        Accept: "application/json",
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers as Record<string, string> | undefined),
    };

    let res: Response;
    try {
        res = await fetch(url, {
            ...init,
            credentials: "include",
            mode: "cors",
            headers,
        });
    } catch (e) {
        return {
            ok: false,
            error: asApiError("network_error", e instanceof Error ? e.message : "Network error"),
        } as unknown as T;
    }

    // Empty body (204 or no content)
    if (res.status === 204) return opts?.empty ?? ({} as T);

    const ct = res.headers.get("content-type");
    const text = await res.text();
    const emptyBody = !text || !text.trim();

    if (emptyBody) {
        // Some servers will reply 200 with empty body on logout etc.
        return opts?.empty ?? ((res.ok ? ({ ok: true } as unknown) : ({ ok: false } as unknown)) as T);
    }

    if (isJsonContentType(ct)) {
        try {
            return JSON.parse(text) as T;
        } catch {
            return {
                ok: false,
                error: asApiError("bad_json", text || `HTTP ${res.status}`),
            } as unknown as T;
        }
    }

    // Non-JSON response: standardize into an API error shape.
    // Keep the message short-ish; preserve status info.
    const msg = text.length > 400 ? `${text.slice(0, 400)}…` : text;
    return {
        ok: false,
        error: asApiError("non_json", msg || `HTTP ${res.status}`),
    } as unknown as T;
}

export async function apiAuthMe(signal?: AbortSignal): Promise<AuthMePayload> {
    // If empty body: treat as signed out.
    return apiFetchJson<AuthMePayload>("/auth/me", { method: "GET", signal }, { empty: { ok: true, user: null } });
}

export async function apiAuthLogout(signal?: AbortSignal): Promise<AuthOkPayload> {
    // If empty body: treat as ok.
    return apiFetchJson<AuthOkPayload>("/auth/logout", { method: "POST", signal }, { empty: { ok: true } });
}

export function googleStartUrl(returnTo?: string): string {
    const base = buildUrl("/auth/google/start");
    if (!returnTo) return base;

    const u = new URL(base);
    u.searchParams.set("returnTo", returnTo);
    return u.toString();
}

/**
 * IMPORTANT: OAuth start MUST be a top-level navigation, not fetch().
 * This helper exists so UI code can’t accidentally fetch it.
 */
export function navigateToGoogleStart(returnTo?: string): void {
    const rt = returnTo ?? (typeof window !== "undefined" ? window.location.href : "");
    const url = googleStartUrl(rt);
    // assign() preserves history semantics appropriately for login redirects
    window.location.assign(url);
}