// apps/web/src/auth/useAuth.tsx
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
 * Properties:
 * - coalesced /auth/me requests
 * - TTL caching to avoid pointless hammering
 * - StrictMode-safe initialization
 * - cross-tab sync via BroadcastChannel + storage fallback
 * - optimistic sign-out with server reconciliation
 * - no OAuth fetch misuse; login is top-level navigation only
 * - safe cleanup / abort / stale-request protection
 */

export type AuthState = Readonly<{
    loading: boolean;
    user: AuthUser | null;
    error: string | null;

    refresh: () => Promise<void>;
    refreshForce: () => Promise<void>;
    signInWithGoogle: (opts?: { returnTo?: string }) => void;
    signOut: () => Promise<void>;
}>;

const AuthContext = createContext<AuthState | null>(null);

const AUTH_BC = "bp-auth";
const AUTH_STORAGE_EVENT_KEY = "bp.auth.event.v1";
const DEFAULT_ME_TTL_MS = 10_000;

type Inflight = Readonly<{
    id: number;
    ac: AbortController;
    p: Promise<void>;
}>;

type BroadcastMsg = Readonly<{
    type: "refresh" | "signed_out" | "signed_in";
    at: number;
}>;

function nowMs(): number {
    return Date.now();
}

function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof document !== "undefined";
}

function isBroadcastMsg(value: unknown): value is BroadcastMsg {
    if (!value || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    return (
         (v.type === "refresh" || v.type === "signed_out" || v.type === "signed_in") &&
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
    return msg.type === "refresh" || msg.type === "signed_out" || msg.type === "signed_in";
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
    const initStartedRef = useRef<boolean>(false);
    const unmountedRef = useRef<boolean>(false);
    const bcRef = useRef<BroadcastChannel | null>(null);
    const lastSeenBroadcastAtRef = useRef<number>(0);

    const postBroadcast = useCallback((msg: BroadcastMsg) => {
        if (!isBrowser()) return;

        lastSeenBroadcastAtRef.current = Math.max(lastSeenBroadcastAtRef.current, msg.at);

        try {
            if ("BroadcastChannel" in window) {
                if (!bcRef.current) {
                    bcRef.current = new BroadcastChannel(AUTH_BC);
                }
                bcRef.current.postMessage(msg);
            }
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

    const refreshImpl = useCallback(
         async (force: boolean): Promise<void> => {
             const now = nowMs();

             if (!force && hydratedRef.current && now - lastMeAtRef.current < DEFAULT_ME_TTL_MS) {
                 return;
             }

             if (!force && inflightRef.current) {
                 return inflightRef.current.p;
             }

             if (force && inflightRef.current) {
                 inflightRef.current.ac.abort();
                 inflightRef.current = null;
             }

             const id = ++requestSeqRef.current;
             const ac = new AbortController();

             if (!hydratedRef.current) {
                 setLoading(true);
             }

             const p: Promise<void> = (async () => {
                 try {
                     setError(null);

                     const res = await apiAuthMe(ac.signal);
                     if (ac.signal.aborted || unmountedRef.current) return;

                     hydratedRef.current = true;
                     lastMeAtRef.current = nowMs();

                     if (res.ok) {
                         setUser(res.user);
                         setError(null);
                     } else {
                         setUser(null);
                         setError(res.error.message || "Auth error");
                     }
                 } catch (err) {
                     if (ac.signal.aborted || unmountedRef.current) return;

                     hydratedRef.current = true;
                     lastMeAtRef.current = nowMs();
                     setUser(null);
                     setError(err instanceof Error ? err.message : "Auth error");
                 } finally {
                     if (!ac.signal.aborted && !unmountedRef.current) {
                         setLoading(false);
                     }
                     clearInflightIfSame(id);
                 }
             })();

             inflightRef.current = { id, ac, p };
             return p;
         },
         [clearInflightIfSame],
    );

    const refresh = useCallback(async (): Promise<void> => {
        await refreshImpl(false);
    }, [refreshImpl]);

    const refreshForce = useCallback(async (): Promise<void> => {
        await refreshImpl(true);
    }, [refreshImpl]);

    useEffect(() => {
        if (!isBrowser()) return;
        if (initStartedRef.current) return;

        initStartedRef.current = true;
        unmountedRef.current = false;

        void refreshForce();

        const onFocus = () => {
            void refreshForce();
        };

        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                void refreshForce();
            }
        };

        const onStorage = (ev: StorageEvent) => {
            if (ev.key !== AUTH_STORAGE_EVENT_KEY) return;
            const msg = safeParseStorageEvent(ev.newValue);
            if (!msg) return;
            if (msg.at <= lastSeenBroadcastAtRef.current) return;

            lastSeenBroadcastAtRef.current = msg.at;
            if (shouldRefreshForMessage(msg)) {
                void refreshForce();
            }
        };

        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("storage", onStorage);

        try {
            if ("BroadcastChannel" in window) {
                bcRef.current = new BroadcastChannel(AUTH_BC);
                bcRef.current.onmessage = (ev: MessageEvent<unknown>) => {
                    const msg = ev.data;
                    if (!isBroadcastMsg(msg)) return;
                    if (msg.at <= lastSeenBroadcastAtRef.current) return;

                    lastSeenBroadcastAtRef.current = msg.at;
                    if (shouldRefreshForMessage(msg)) {
                        void refreshForce();
                    }
                };
            }
        } catch {
            bcRef.current = null;
        }

        return () => {
            unmountedRef.current = true;

            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            window.removeEventListener("storage", onStorage);

            const current = inflightRef.current;
            if (current) {
                current.ac.abort();
                inflightRef.current = null;
            }

            if (bcRef.current) {
                try {
                    bcRef.current.close();
                } catch {
                    // ignore
                }
                bcRef.current = null;
            }
        };
    }, [refreshForce]);

    const signInWithGoogle = useCallback((opts?: { returnTo?: string }) => {
        if (!isBrowser()) return;
        const returnTo = opts?.returnTo ?? window.location.href;
        navigateToGoogleStart(returnTo);
    }, []);

    const signOut = useCallback(async (): Promise<void> => {
        const current = inflightRef.current;
        if (current) {
            current.ac.abort();
            inflightRef.current = null;
        }

        setUser(null);
        setError(null);
        setLoading(false);

        try {
            const ac = new AbortController();
            const res = await apiAuthLogout(ac.signal);

            if (!res.ok) {
                setError(res.error.message || "Sign out failed");
            }

            if (res.ok && res.redirect && isBrowser()) {
                const redirect = res.redirect.trim();
                if (redirect) {
                    window.location.assign(redirect);
                    return;
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Sign out failed");
        } finally {
            postBroadcast({ type: "signed_out", at: nowMs() });
            await refreshForce();
        }
    }, [postBroadcast, refreshForce]);

    const value = useMemo<AuthState>(
         () => ({
             loading,
             user,
             error,
             refresh,
             refreshForce,
             signInWithGoogle,
             signOut,
         }),
         [loading, user, error, refresh, refreshForce, signInWithGoogle, signOut],
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