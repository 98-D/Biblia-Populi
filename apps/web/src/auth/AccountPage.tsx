// apps/web/src/auth/AccountPage.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ArrowLeft,
    LogIn,
    LogOut,
    RefreshCcw,
    ShieldCheck,
    UserRound,
} from "lucide-react";
import { useAuth } from "./useAuth";

export type AccountPageProps = Readonly<{
    onBackHome: () => void;
}>;

type ActionState = "idle" | "signing_in" | "refreshing" | "signing_out";

function css<T extends React.CSSProperties>(value: T): React.CSSProperties {
    return value;
}

function isBrowser(): boolean {
    return typeof window !== "undefined";
}

function initialsFrom(
    displayName: string | null | undefined,
    email: string | null | undefined,
): string {
    const base = (displayName?.trim() || email?.trim() || "User").trim();
    if (!base) return "U";

    const emailName = base.includes("@") ? (base.split("@")[0] ?? base) : base;
    const normalized = emailName.replace(/[._-]+/g, " ").trim();
    const parts = normalized.split(/\s+/g).filter(Boolean);

    if (parts.length >= 2) {
        return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
    }

    return normalized.slice(0, 2).toUpperCase() || "U";
}

function getReturnToAccountUrl(): string | undefined {
    if (!isBrowser()) return undefined;
    return `${window.location.origin}${window.location.pathname}${window.location.search}#/account`;
}

const styles = Object.freeze({
    page: css({
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding:
            "calc(32px + env(safe-area-inset-top, 0px)) calc(20px + env(safe-area-inset-right, 0px)) calc(32px + env(safe-area-inset-bottom, 0px)) calc(20px + env(safe-area-inset-left, 0px))",
        minWidth: 0,
        boxSizing: "border-box",
    }),

    card: css({
        width: "100%",
        maxWidth: 760,
        minWidth: 0,
        borderRadius: 24,
        border: "1px solid color-mix(in srgb, var(--border) 78%, transparent)",
        background:
            "linear-gradient(180deg, color-mix(in srgb, var(--card) 94%, white), color-mix(in srgb, var(--card) 98%, transparent))",
        boxShadow: "0 22px 70px color-mix(in srgb, black 12%, transparent)",
        padding: 24,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        boxSizing: "border-box",
    }),

    topRow: css({
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 22,
        flexWrap: "wrap",
    }),

    sessionBadge: css({
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        minHeight: 36,
        borderRadius: 999,
        padding: "0 12px",
        border: "1px solid color-mix(in srgb, var(--border) 72%, transparent)",
        background: "color-mix(in srgb, var(--activeBg) 20%, transparent)",
        fontSize: 13,
        fontWeight: 650,
        opacity: 0.84,
        whiteSpace: "nowrap",
    }),

    hero: css({
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr)",
        alignItems: "center",
        gap: 16,
        marginBottom: 22,
        minWidth: 0,
    }),

    avatar: css({
        width: 56,
        height: 56,
        borderRadius: 999,
        display: "grid",
        placeItems: "center",
        fontSize: 19,
        fontWeight: 820,
        letterSpacing: "0.04em",
        color: "var(--fg)",
        background:
            "linear-gradient(180deg, color-mix(in srgb, var(--card) 92%, white), color-mix(in srgb, var(--card) 98%, transparent))",
        boxShadow: "0 0 0 1px color-mix(in srgb, var(--border) 72%, transparent)",
        userSelect: "none",
        flex: "0 0 auto",
    }),

    heroText: css({
        minWidth: 0,
    }),

    title: css({
        margin: 0,
        fontSize: "clamp(26px, 2vw, 30px)",
        lineHeight: 1.05,
        letterSpacing: "-0.02em",
    }),

    subtitle: css({
        marginTop: 8,
        fontSize: 14,
        lineHeight: 1.5,
        opacity: 0.78,
    }),

    identityCard: css({
        borderRadius: 18,
        border: "1px solid color-mix(in srgb, var(--border) 72%, transparent)",
        background: "color-mix(in srgb, var(--activeBg) 36%, transparent)",
        padding: 16,
        minWidth: 0,
    }),

    sectionKicker: css({
        fontSize: 12,
        fontWeight: 760,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        opacity: 0.64,
        marginBottom: 12,
    }),

    identityGrid: css({
        display: "grid",
        gap: 12,
        minWidth: 0,
    }),

    field: css({
        minWidth: 0,
    }),

    fieldLabel: css({
        fontSize: 12,
        opacity: 0.62,
        marginBottom: 4,
    }),

    fieldValueStrong: css({
        fontSize: 15,
        fontWeight: 720,
        lineHeight: 1.35,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
    }),

    fieldValue: css({
        fontSize: 15,
        fontWeight: 640,
        lineHeight: 1.35,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
    }),

    error: css({
        marginTop: 14,
        borderRadius: 16,
        border: "1px solid color-mix(in srgb, var(--border) 72%, transparent)",
        background: "color-mix(in srgb, var(--activeBg) 42%, transparent)",
        padding: 12,
        fontSize: 13,
        lineHeight: 1.45,
    }),

    actions: css({
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        marginTop: 18,
    }),
});

function buttonStyle(
    kind: "primary" | "secondary" | "danger",
    disabled: boolean,
): React.CSSProperties {
    const common = css({
        height: 42,
        minWidth: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderRadius: 999,
        padding: "0 16px",
        border: "1px solid transparent",
        cursor: disabled ? "default" : "pointer",
        fontSize: 14,
        fontWeight: 760,
        lineHeight: 1,
        transition:
            "transform 160ms cubic-bezier(0.16, 1, 0.3, 1), opacity 160ms ease, background 160ms ease, border-color 160ms ease, box-shadow 160ms ease",
        textDecoration: "none",
        appearance: "none",
        WebkitAppearance: "none",
        outline: "none",
        opacity: disabled ? 0.58 : 1,
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
        whiteSpace: "nowrap",
    });

    if (kind === "primary") {
        return {
            ...common,
            color: "white",
            background: "var(--fg)",
            boxShadow: "0 12px 28px color-mix(in srgb, black 18%, transparent)",
        };
    }

    if (kind === "danger") {
        return {
            ...common,
            color: "color-mix(in srgb, var(--fg) 78%, #b00020)",
            background: "transparent",
            border: "1px solid color-mix(in srgb, var(--border) 76%, transparent)",
        };
    }

    return {
        ...common,
        color: "var(--fg)",
        background: "transparent",
        border: "1px solid color-mix(in srgb, var(--border) 76%, transparent)",
    };
}

export function AccountPage({ onBackHome }: AccountPageProps) {
    const {
        loading,
        signedIn,
        user,
        error,
        refresh,
        signInWithGoogle,
        signOut,
    } = useAuth();

    const mountedRef = useRef(true);
    const [actionState, setActionState] = useState<ActionState>("idle");

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const displayName = user?.displayName?.trim() || "Signed in";
    const email = user?.email?.trim() || "—";
    const initials = useMemo(
        () => initialsFrom(user?.displayName, user?.email),
        [user?.displayName, user?.email],
    );

    const busy = loading || actionState !== "idle";
    const sessionLabel = loading
        ? "Checking session"
        : signedIn
            ? "Authenticated"
            : "Guest session";

    const title = signedIn ? "Your account" : "Sign in";
    const subtitle = loading
        ? "Checking your current session."
        : signedIn
            ? "Manage the current browser session."
            : "Use Google sign-in to sync your account session.";

    const handleSignIn = useCallback(async () => {
        if (busy) return;

        setActionState("signing_in");
        try {
            await Promise.resolve(
                signInWithGoogle({
                    returnTo: getReturnToAccountUrl(),
                }),
            );
        } catch {
            if (mountedRef.current) {
                setActionState("idle");
            }
            return;
        }

        if (mountedRef.current) {
            setActionState("idle");
        }
    }, [busy, signInWithGoogle]);

    const handleRefresh = useCallback(async () => {
        if (busy) return;

        setActionState("refreshing");
        try {
            await refresh();
        } finally {
            if (mountedRef.current) {
                setActionState("idle");
            }
        }
    }, [busy, refresh]);

    const handleSignOut = useCallback(async () => {
        if (busy) return;

        setActionState("signing_out");
        try {
            await signOut();
        } finally {
            if (mountedRef.current) {
                setActionState("idle");
            }
        }
    }, [busy, signOut]);

    const primaryBusyLabel =
        actionState === "signing_in"
            ? "Connecting…"
            : actionState === "refreshing"
                ? "Refreshing…"
                : actionState === "signing_out"
                    ? "Signing out…"
                    : null;

    return (
        <main style={styles.page} aria-label="Account">
            <section style={styles.card} aria-busy={busy || undefined}>
                <div style={styles.topRow}>
                    <button
                        type="button"
                        onClick={onBackHome}
                        style={buttonStyle("secondary", busy)}
                        aria-label="Back home"
                    >
                        <ArrowLeft size={16} />
                        Home
                    </button>

                    <div style={styles.sessionBadge}>
                        <ShieldCheck size={15} />
                        {sessionLabel}
                    </div>
                </div>

                <div style={styles.hero}>
                    <div aria-hidden="true" style={styles.avatar}>
                        {signedIn ? initials : <UserRound size={24} />}
                    </div>

                    <div style={styles.heroText}>
                        <h1 style={styles.title}>{title}</h1>
                        <div style={styles.subtitle}>{subtitle}</div>
                    </div>
                </div>

                <div style={styles.identityCard}>
                    <div style={styles.sectionKicker}>Identity</div>

                    <div style={styles.identityGrid}>
                        <div style={styles.field}>
                            <div style={styles.fieldLabel}>Name</div>
                            <div style={styles.fieldValueStrong}>
                                {signedIn ? displayName : "Not signed in"}
                            </div>
                        </div>

                        <div style={styles.field}>
                            <div style={styles.fieldLabel}>Email</div>
                            <div style={styles.fieldValue}>
                                {signedIn ? email : "—"}
                            </div>
                        </div>
                    </div>
                </div>

                {error ? (
                    <div role="alert" style={styles.error}>
                        {error}
                    </div>
                ) : null}

                <div style={styles.actions}>
                    {!signedIn ? (
                        <button
                            type="button"
                            onClick={() => {
                                void handleSignIn();
                            }}
                            disabled={busy}
                            aria-busy={actionState === "signing_in" || undefined}
                            style={buttonStyle("primary", busy)}
                        >
                            <LogIn size={16} />
                            {actionState === "signing_in"
                                ? "Connecting…"
                                : "Continue with Google"}
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => {
                                    void handleRefresh();
                                }}
                                disabled={busy}
                                aria-busy={actionState === "refreshing" || undefined}
                                style={buttonStyle("secondary", busy)}
                            >
                                <RefreshCcw size={16} />
                                {actionState === "refreshing"
                                    ? "Refreshing…"
                                    : "Refresh session"}
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    void handleSignOut();
                                }}
                                disabled={busy}
                                aria-busy={actionState === "signing_out" || undefined}
                                style={buttonStyle("danger", busy)}
                            >
                                <LogOut size={16} />
                                {actionState === "signing_out"
                                    ? "Signing out…"
                                    : "Sign out"}
                            </button>
                        </>
                    )}
                </div>

                {primaryBusyLabel ? (
                    <div
                        style={{
                            marginTop: 12,
                            fontSize: 12,
                            opacity: 0.66,
                        }}
                    >
                        {primaryBusyLabel}
                    </div>
                ) : null}
            </section>
        </main>
    );
}