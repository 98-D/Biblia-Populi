// apps/web/src/auth/useAuth.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiAuthLogout, apiAuthMe, navigateToGoogleStart, type AuthUser } from "./authApi";

/**
 * Auth (calm + robust)
 *
 * Guarantees:
 * - Coalesces in-flight /auth/me (no storms)
 * - TTL caching (default 10s) to avoid hammering
 * - StrictMode-safe init (dev double-mount won’t double fetch)
 * - BroadcastChannel cross-tab sync (refresh on sign-in/out)
 * - signInWithGoogle navigates (never fetches OAuth start)
 *
 * Fixes vs your current version:
 * - No broadcast loops: we DO NOT broadcast "signed_in" from refresh().
 *   Only explicit signOut broadcasts (and optional external "refresh" can be sent by others).
 * - Correct return types: refreshImpl always returns Promise<void>.
 * - Safer event listeners (guard window/document existence).
 * - Better cleanup + abort handling.
 */

type AuthState = {
    loading: boolean;
    user: AuthUser | null;
    error: string | null;

    refresh: () => Promise<void>;
    signInWithGoogle: (opts?: { returnTo?: string }) => void;
    signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const AUTH_BC = "bp-auth";
const DEFAULT_ME_TTL_MS = 10_000;

type Inflight = {
    ac: AbortController;
    p: Promise<void>;
};

type BroadcastMsg = { type: "refresh" | "signed_out" | "signed_in" };

function nowMs(): number {
    return Date.now();
}

export function AuthProvider(props: { children: React.ReactNode }) {
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [error, setError] = useState<string | null>(null);

    const inflight = useRef<Inflight | null>(null);
    const hydrated = useRef(false);
    const lastMeAt = useRef(0);

    // StrictMode guard (effects can fire twice in dev)
    const didInit = useRef(false);

    const postBroadcast = useCallback((msg: BroadcastMsg) => {
        try {
            if (typeof window === "undefined") return;
            if (!("BroadcastChannel" in window)) return;
            const bc = new BroadcastChannel(AUTH_BC);
            bc.postMessage(msg);
            bc.close();
        } catch {
            // ignore
        }
    }, []);

    const refreshImpl = useCallback(
        async (force: boolean): Promise<void> => {
            const t = nowMs();

            // TTL gating
            if (!force && hydrated.current && t - lastMeAt.current < DEFAULT_ME_TTL_MS) {
                return;
            }

            // Coalesce if not forced
            if (!force && inflight.current) {
                return inflight.current.p;
            }

            // If forced, cancel the previous request
            if (force && inflight.current) {
                inflight.current.ac.abort();
                inflight.current = null;
            }

            const ac = new AbortController();

            // Only show spinner for first hydration (avoid flicker)
            if (!hydrated.current) setLoading(true);

            const p: Promise<void> = (async () => {
                try {
                    setError(null);
                    const r = await apiAuthMe(ac.signal);
                    if (ac.signal.aborted) return;

                    hydrated.current = true;
                    lastMeAt.current = nowMs();

                    if (r.ok) {
                        setUser(r.user);
                        // IMPORTANT: do NOT broadcast "signed_in" here.
                        // Broadcasting from refresh() causes cross-tab refresh loops.
                    } else {
                        setUser(null);
                        // For non-ok, keep error message (useful in dev); prod could blank this.
                        setError(r.error?.message ?? "Auth error");
                    }
                } catch (e) {
                    if (ac.signal.aborted) return;
                    hydrated.current = true;
                    lastMeAt.current = nowMs();
                    setUser(null);
                    setError(e instanceof Error ? e.message : "Auth error");
                } finally {
                    if (!ac.signal.aborted) setLoading(false);
                    if (inflight.current?.ac === ac) inflight.current = null;
                }
            })();

            inflight.current = { ac, p };
            return p;
        },
        [],
    );

    const refresh = useCallback(async () => {
        await refreshImpl(false);
    }, [refreshImpl]);

    const refreshForce = useCallback(async () => {
        await refreshImpl(true);
    }, [refreshImpl]);

    useEffect(() => {
        if (didInit.current) return;
        didInit.current = true;

        if (typeof window === "undefined") return;

        void refreshForce();

        const onFocus = () => void refreshForce();
        const onVis = () => {
            if (document.visibilityState === "visible") void refreshForce();
        };

        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onVis);

        // Cross-tab sync
        let bc: BroadcastChannel | null = null;
        try {
            if ("BroadcastChannel" in window) {
                bc = new BroadcastChannel(AUTH_BC);
                bc.onmessage = (ev) => {
                    const msg = ev?.data as Partial<BroadcastMsg> | undefined;
                    if (!msg?.type) return;

                    // Another tab tells us to refresh or changed auth state.
                    if (msg.type === "refresh" || msg.type === "signed_out" || msg.type === "signed_in") {
                        void refreshForce();
                    }
                };
            }
        } catch {
            bc = null;
        }

        return () => {
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onVis);

            if (bc) bc.close();

            inflight.current?.ac.abort();
            inflight.current = null;
        };
    }, [refreshForce]);

    const signInWithGoogle = useCallback((opts?: { returnTo?: string }) => {
        const rt = opts?.returnTo ?? window.location.href;
        navigateToGoogleStart(rt);
        // Optional: you *could* broadcast "signed_in" AFTER callback completes,
        // but that should be done server-side redirect -> app load, not here.
    }, []);

    const signOut = useCallback(async () => {
        // Cancel any /me call; we're changing state
        inflight.current?.ac.abort();
        inflight.current = null;

        // Optimistic local state
        setUser(null);
        setError(null);

        try {
            const ac = new AbortController();
            await apiAuthLogout(ac.signal);
        } finally {
            // Notify other tabs, then force refresh to reflect server truth
            postBroadcast({ type: "signed_out" });
            await refreshForce();
        }
    }, [postBroadcast, refreshForce]);

    const value = useMemo<AuthState>(
        () => ({ loading, user, error, refresh, signInWithGoogle, signOut }),
        [loading, user, error, refresh, signInWithGoogle, signOut],
    );

    return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within <AuthProvider />");
    return ctx;
}