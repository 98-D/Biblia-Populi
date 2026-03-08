import React, { useCallback, useMemo } from "react";
import { LogIn, LogOut, RefreshCcw, ArrowLeft, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "./useAuth";

export type AccountPageProps = {
     onBackHome: () => void;
};

function initialsFrom(displayName: string | null | undefined, email: string | null | undefined): string {
     const base = (displayName?.trim() || email?.trim() || "User").trim();
     if (!base) return "U";

     const emailName = base.includes("@") ? base.split("@")[0] ?? base : base;
     const normalized = emailName.replace(/[._-]+/g, " ").trim();
     const parts = normalized.split(/\s+/g).filter(Boolean);

     if (parts.length >= 2) {
          return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
     }
     return normalized.slice(0, 2).toUpperCase() || "U";
}

function cardStyle(): React.CSSProperties {
     return {
          width: "100%",
          maxWidth: 760,
          borderRadius: 24,
          border: "1px solid color-mix(in srgb, var(--border) 78%, transparent)",
          background:
               "linear-gradient(180deg, color-mix(in srgb, var(--card) 94%, white), color-mix(in srgb, var(--card) 98%, transparent))",
          boxShadow: "0 22px 70px color-mix(in srgb, black 12%, transparent)",
          padding: 24,
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
     };
}

function buttonStyle(kind: "primary" | "secondary" | "danger"): React.CSSProperties {
     const common: React.CSSProperties = {
          height: 42,
          minWidth: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          borderRadius: 999,
          padding: "0 16px",
          border: "1px solid transparent",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 760,
          transition: "all 0.16s cubic-bezier(0.16, 1, 0.3, 1)",
          textDecoration: "none",
     };

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

     const onSignIn = useCallback(() => {
          const returnTo = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}#/account` : undefined;
          signInWithGoogle({ returnTo });
     }, [signInWithGoogle]);

     const onRefresh = useCallback(async () => {
          await refresh();
     }, [refresh]);

     const displayName = user?.displayName?.trim() || "Signed in";
     const email = user?.email?.trim() || "—";
     const initials = useMemo(() => initialsFrom(user?.displayName, user?.email), [user?.displayName, user?.email]);

     return (
          <main
               aria-label="Account"
               style={{
                    minHeight: "100%",
                    display: "grid",
                    placeItems: "center",
                    padding: "40px 20px",
               }}
          >
               <div style={cardStyle()}>
                    <div
                         style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 16,
                              marginBottom: 22,
                         }}
                    >
                         <button
                              type="button"
                              onClick={onBackHome}
                              style={buttonStyle("secondary")}
                              aria-label="Back home"
                         >
                              <ArrowLeft size={16} />
                              Home
                         </button>

                         <div
                              style={{
                                   display: "inline-flex",
                                   alignItems: "center",
                                   gap: 8,
                                   fontSize: 13,
                                   opacity: 0.8,
                              }}
                         >
                              <ShieldCheck size={15} />
                              Session
                         </div>
                    </div>

                    <div
                         style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 16,
                              marginBottom: 22,
                         }}
                    >
                         <div
                              aria-hidden="true"
                              style={{
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
                              }}
                         >
                              {signedIn ? initials : <UserRound size={24} />}
                         </div>

                         <div style={{ minWidth: 0 }}>
                              <h1
                                   style={{
                                        margin: 0,
                                        fontSize: 28,
                                        lineHeight: 1.05,
                                        letterSpacing: "-0.02em",
                                   }}
                              >
                                   {signedIn ? "Your account" : "Sign in"}
                              </h1>

                              <div
                                   style={{
                                        marginTop: 8,
                                        fontSize: 14,
                                        opacity: 0.78,
                                   }}
                              >
                                   {loading
                                        ? "Checking session…"
                                        : signedIn
                                             ? "Manage the current browser session."
                                             : "Use Google sign-in to sync your account session."}
                              </div>
                         </div>
                    </div>

                    <div
                         style={{
                              borderRadius: 18,
                              border: "1px solid color-mix(in srgb, var(--border) 72%, transparent)",
                              background: "color-mix(in srgb, var(--activeBg) 36%, transparent)",
                              padding: 16,
                         }}
                    >
                         <div
                              style={{
                                   fontSize: 12,
                                   fontWeight: 760,
                                   letterSpacing: "0.08em",
                                   textTransform: "uppercase",
                                   opacity: 0.64,
                                   marginBottom: 10,
                              }}
                         >
                              Identity
                         </div>

                         <div style={{ display: "grid", gap: 10 }}>
                              <div>
                                   <div style={{ fontSize: 12, opacity: 0.62, marginBottom: 4 }}>Name</div>
                                   <div style={{ fontSize: 15, fontWeight: 720 }}>
                                        {signedIn ? displayName : "Not signed in"}
                                   </div>
                              </div>

                              <div>
                                   <div style={{ fontSize: 12, opacity: 0.62, marginBottom: 4 }}>Email</div>
                                   <div style={{ fontSize: 15, fontWeight: 640 }}>{signedIn ? email : "—"}</div>
                              </div>
                         </div>
                    </div>

                    {error ? (
                         <div
                              role="alert"
                              style={{
                                   marginTop: 14,
                                   borderRadius: 16,
                                   border: "1px solid color-mix(in srgb, var(--border) 72%, transparent)",
                                   background: "color-mix(in srgb, var(--activeBg) 42%, transparent)",
                                   padding: 12,
                                   fontSize: 13,
                              }}
                         >
                              {error}
                         </div>
                    ) : null}

                    <div
                         style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 10,
                              marginTop: 18,
                         }}
                    >
                         {!signedIn ? (
                              <button
                                   type="button"
                                   onClick={onSignIn}
                                   disabled={loading}
                                   style={buttonStyle("primary")}
                              >
                                   <LogIn size={16} />
                                   Continue with Google
                              </button>
                         ) : (
                              <>
                                   <button
                                        type="button"
                                        onClick={onRefresh}
                                        disabled={loading}
                                        style={buttonStyle("secondary")}
                                   >
                                        <RefreshCcw size={16} />
                                        Refresh session
                                   </button>

                                   <button
                                        type="button"
                                        onClick={() => {
                                             void signOut();
                                        }}
                                        disabled={loading}
                                        style={buttonStyle("danger")}
                                   >
                                        <LogOut size={16} />
                                        Sign out
                                   </button>
                              </>
                         )}
                    </div>
               </div>
          </main>
     );
}