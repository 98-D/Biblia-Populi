import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { apiAuthLogout, apiAuthMe, navigateToGoogleStart, type AuthUser } from "./authApi";

/**
 * Biblia.to — auth state provider
 *
 * Responsibilities:
 * - server-session hydration via /auth/me
 * - coalesced refreshes with TTL
 * - StrictMode-safe lifecycle
 * - cross-tab sync (BroadcastChannel + storage fallback)
 * - auth-aware navigation helpers for account surfaces
 * - optimistic sign-out + server reconciliation
 *
 * Anti-loop rules:
 * - exactly one BroadcastChannel instance per mounted provider
 * - postBroadcast never creates channels
 * - no signed_in broadcast
 * - no hashchange-triggered auth refresh
 * - OAuth-return detection uses query params only, never #/account
 */

export type AuthState = Readonly<{
    loading: boolean;
    user: AuthUser | null;
    error: string | null;
    signedIn: boolean;

    refresh: () => Promise<void>;
    refreshForce: () => Promise<void>;

    signInWithGoogle: (opts?: { returnTo?: string }) => void;
    signOut: () => Promise<void>;

    accountHref: string;
    openAccountPage: () => void;
}>;

const AuthContext = createContext<AuthState | null>(null);

const AUTH_BC = "bp-auth";
const AUTH_STORAGE_EVENT_KEY = "bp.auth.event.v1";

const DEFAULT_ME_TTL_MS = 10_000;
const FOCUS_REFRESH_COOLDOWN_MS = 4_000;
const VISIBILITY_REFRESH_COOLDOWN_MS = 4_000;

type Inflight = Readonly<{
    id: number;
    ac: AbortController;
    p: Promise<void>;
}>;

type BroadcastMsg = Readonly<{
    type: "refresh" | "signed_out";
    at: number;
}>;

function nowMs(): number {
    return Date.now();
}

function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof document !== "undefined";
}

function getAccountHref(): string {
    return "#/account";
}

function isBroadcastMsg(value: unknown): value is BroadcastMsg {
    if (!value || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    return (
         (v.type === "refresh" || v.type === "signed_out") &&
         typeof v.at === "number" &&
         Number.isFinite(v.at)
    );
}

function safePostStorageEvent(msg: BroadcastMsg): void {
    if (!isBrowser()) return;
    try {
        window.localStorage.setItem(AUTH_STORAGE_EVENT_KEY, JSON.stringify(msg));
    } catch {
        // ignore
    }
}

function safeParseStorageEvent(raw: string | null): BroadcastMsg | null {
    if (!raw) return null;

    try {
        const parsed: unknown = JSON.parse(raw);
        return isBroadcastMsg(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function shouldRefreshForMessage(msg: BroadcastMsg): boolean {
    return msg.type === "refresh" || msg.type === "signed_out";
}

function safeErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error) {
        const msg = err.message.trim();
        return msg || fallback;
    }
    return fallback;
}

function looksLikeOAuthReturn(): boolean {
    if (!isBrowser()) return false;

    const q = new URLSearchParams(window.location.search);
    return (
         q.has("code") ||
         q.has("state") ||
         q.has("auth") ||
         q.has("logged_in") ||
         q.has("session") ||
         q.has("oauth")
    );
}

export function AuthProvider(props: { children: React.ReactNode }) {
    const { children } = props;

    const [loading, setLoading] = useState<boolean>(true);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [error, setError] = useState<string | null>(null);

    const inflightRef = useRef<Inflight | null>(null);
    const hydratedRef = useRef<boolean>(false);
    const lastMeAtRef = useRef<number>(0);
    const requestSeqRef = useRef<number>(0);
    const mountSeqRef = useRef<number>(0);
    const activeMountIdRef = useRef<number>(0);

    const bcRef = useRef<BroadcastChannel | null>(null);
    const lastSeenBroadcastAtRef = useRef<number>(0);
    const lastFocusRefreshAtRef = useRef<number>(0);
    const lastVisibilityRefreshAtRef = useRef<number>(0);
    const signOutInFlightRef = useRef<Promise<void> | null>(null);

    const isActiveMount = useCallback((mountId: number): boolean => {
        return activeMountIdRef.current === mountId;
    }, []);

    const setLoadingIfActive = useCallback(
         (mountId: number, next: boolean) => {
             if (!isActiveMount(mountId)) return;
             setLoading(next);
         },
         [isActiveMount],
    );

    const setUserIfActive = useCallback(
         (mountId: number, next: AuthUser | null) => {
             if (!isActiveMount(mountId)) return;
             setUser(next);
         },
         [isActiveMount],
    );

    const setErrorIfActive = useCallback(
         (mountId: number, next: string | null) => {
             if (!isActiveMount(mountId)) return;
             setError(next);
         },
         [isActiveMount],
    );

    const postBroadcast = useCallback((msg: BroadcastMsg) => {
        if (!isBrowser()) return;

        lastSeenBroadcastAtRef.current = Math.max(lastSeenBroadcastAtRef.current, msg.at);

        try {
            bcRef.current?.postMessage(msg);
        } catch {
            // ignore
        }

        safePostStorageEvent(msg);
    }, []);

    const clearInflightIfSame = useCallback((id: number) => {
        const current = inflightRef.current;
        if (current && current.id === id) {
            inflightRef.current = null;
        }
    }, []);

    const abortInflight = useCallback(() => {
        const current = inflightRef.current;
        if (!current) return;
        current.ac.abort();
        inflightRef.current = null;
    }, []);

    const refreshImpl = useCallback(
         async (force: boolean, mountId?: number): Promise<void> => {
             const now = nowMs();

             if (!force && hydratedRef.current && now - lastMeAtRef.current < DEFAULT_ME_TTL_MS) {
                 return;
             }

             if (!force && inflightRef.current) {
                 return inflightRef.current.p;
             }

             if (force && inflightRef.current) {
                 abortInflight();
             }

             const id = ++requestSeqRef.current;
             const ac = new AbortController();

             const setLoadingSafe = (next: boolean) => {
                 if (mountId == null) {
                     setLoading(next);
                     return;
                 }
                 setLoadingIfActive(mountId, next);
             };

             const setUserSafe = (next: AuthUser | null) => {
                 if (mountId == null) {
                     setUser(next);
                     return;
                 }
                 setUserIfActive(mountId, next);
             };

             const setErrorSafe = (next: string | null) => {
                 if (mountId == null) {
                     setError(next);
                     return;
                 }
                 setErrorIfActive(mountId, next);
             };

             if (!hydratedRef.current) {
                 setLoadingSafe(true);
             }

             const p: Promise<void> = (async () => {
                 try {
                     setErrorSafe(null);

                     const res = await apiAuthMe(ac.signal);
                     if (ac.signal.aborted) return;
                     if (mountId != null && !isActiveMount(mountId)) return;

                     hydratedRef.current = true;
                     lastMeAtRef.current = nowMs();

                     if (res.ok) {
                         setUserSafe(res.user);
                         setErrorSafe(null);
                     } else {
                         setUserSafe(null);
                         setErrorSafe(res.error.message || "Auth error");
                     }
                 } catch (err) {
                     if (ac.signal.aborted) return;
                     if (mountId != null && !isActiveMount(mountId)) return;

                     hydratedRef.current = true;
                     lastMeAtRef.current = nowMs();
                     setUserSafe(null);
                     setErrorSafe(safeErrorMessage(err, "Auth error"));
                 } finally {
                     if (!ac.signal.aborted && (mountId == null || isActiveMount(mountId))) {
                         setLoadingSafe(false);
                     }
                     clearInflightIfSame(id);
                 }
             })();

             inflightRef.current = { id, ac, p };
             return p;
         },
         [abortInflight, clearInflightIfSame, isActiveMount, setErrorIfActive, setLoadingIfActive, setUserIfActive],
    );

    const refresh = useCallback(async (): Promise<void> => {
        await refreshImpl(false);
    }, [refreshImpl]);

    const refreshForce = useCallback(async (): Promise<void> => {
        await refreshImpl(true);
    }, [refreshImpl]);

    const openAccountPage = useCallback(() => {
        if (!isBrowser()) return;
        if (window.location.hash !== getAccountHref()) {
            window.location.hash = getAccountHref();
        }
    }, []);

    const signInWithGoogle = useCallback((opts?: { returnTo?: string }) => {
        if (!isBrowser()) return;
        const returnTo = opts?.returnTo ?? window.location.href;
        navigateToGoogleStart(returnTo);
    }, []);

    const signOut = useCallback(async (): Promise<void> => {
        if (signOutInFlightRef.current) {
            return signOutInFlightRef.current;
        }

        const run = (async () => {
            abortInflight();

            setUser(null);
            setError(null);
            setLoading(false);
            hydratedRef.current = true;
            lastMeAtRef.current = nowMs();

            let redirected = false;

            try {
                const ac = new AbortController();
                const res = await apiAuthLogout(ac.signal);

                if (!res.ok) {
                    setError(res.error.message || "Sign out failed");
                }

                postBroadcast({ type: "signed_out", at: nowMs() });

                if (res.ok && res.redirect && isBrowser()) {
                    const redirect = res.redirect.trim();
                    if (redirect) {
                        redirected = true;
                        window.location.assign(redirect);
                        return;
                    }
                }
            } catch (err) {
                setError(safeErrorMessage(err, "Sign out failed"));
                postBroadcast({ type: "signed_out", at: nowMs() });
            } finally {
                if (!redirected) {
                    await refreshImpl(true);
                }
            }
        })();

        signOutInFlightRef.current = run;

        try {
            await run;
        } finally {
            signOutInFlightRef.current = null;
        }
    }, [abortInflight, postBroadcast, refreshImpl]);

    useEffect(() => {
        if (!isBrowser()) return;

        const mountId = ++mountSeqRef.current;
        activeMountIdRef.current = mountId;

        void refreshImpl(true, mountId);

        const onFocus = () => {
            const now = nowMs();
            if (now - lastFocusRefreshAtRef.current < FOCUS_REFRESH_COOLDOWN_MS) return;
            lastFocusRefreshAtRef.current = now;
            void refreshImpl(true, mountId);
        };

        const onVisibilityChange = () => {
            if (document.visibilityState !== "visible") return;

            const now = nowMs();
            if (now - lastVisibilityRefreshAtRef.current < VISIBILITY_REFRESH_COOLDOWN_MS) return;
            lastVisibilityRefreshAtRef.current = now;
            void refreshImpl(true, mountId);
        };

        const onStorage = (ev: StorageEvent) => {
            if (ev.key !== AUTH_STORAGE_EVENT_KEY) return;

            const msg = safeParseStorageEvent(ev.newValue);
            if (!msg) return;
            if (msg.at <= lastSeenBroadcastAtRef.current) return;

            lastSeenBroadcastAtRef.current = msg.at;

            if (shouldRefreshForMessage(msg)) {
                void refreshImpl(true, mountId);
            }
        };

        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("storage", onStorage);

        try {
            if ("BroadcastChannel" in window) {
                const bc = new BroadcastChannel(AUTH_BC);
                bc.onmessage = (ev: MessageEvent<unknown>) => {
                    const msg = ev.data;
                    if (!isBroadcastMsg(msg)) return;
                    if (msg.at <= lastSeenBroadcastAtRef.current) return;

                    lastSeenBroadcastAtRef.current = msg.at;

                    if (shouldRefreshForMessage(msg)) {
                        void refreshImpl(true, mountId);
                    }
                };
                bcRef.current = bc;
            }
        } catch {
            bcRef.current = null;
        }

        if (looksLikeOAuthReturn()) {
            void refreshImpl(true, mountId);
        }

        return () => {
            if (activeMountIdRef.current === mountId) {
                activeMountIdRef.current = 0;
            }

            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            window.removeEventListener("storage", onStorage);

            abortInflight();

            if (bcRef.current) {
                try {
                    bcRef.current.close();
                } catch {
                    // ignore
                }
                bcRef.current = null;
            }
        };
    }, [abortInflight, refreshImpl]);

    const value = useMemo<AuthState>(
         () => ({
             loading,
             user,
             error,
             signedIn: !!user,
             refresh,
             refreshForce,
             signInWithGoogle,
             signOut,
             accountHref: getAccountHref(),
             openAccountPage,
         }),
         [loading, user, error, refresh, refreshForce, signInWithGoogle, signOut, openAccountPage],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error("useAuth must be used within <AuthProvider />");
    }
    return ctx;
}