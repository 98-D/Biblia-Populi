// apps/web/src/App.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LearnMorePage } from "./LearnMorePage";
import { Reader } from "./Reader";
import { Search, type ReaderLocation } from "./Search";
import { ThemeProvider, ThemeShell, ThemeTogglePill, useTheme } from "./theme";

import { AuthProvider, useAuth } from "./auth/useAuth";
import { ReaderPrefsProvider } from "./reader/prefs/ReaderPrefsProvider";

type Page = "home" | "learn" | "reader";

/**
 * Rebrand: Biblia Populi -> Biblia.to
 * We migrate localStorage keys so existing users keep their last page / location.
 */
const LS_LAST_PAGE = "bt_nav_last_page_v1";
const LS_LAST_LOC = "bt_nav_last_loc_v1";

// legacy keys (read-only migration)
const LS_LAST_PAGE_LEGACY = "bp_nav_last_page_v1";
const LS_LAST_LOC_LEGACY = "bp_nav_last_loc_v1";

/* ---------------- Small helpers (safe localStorage) ---------------- */
function safeGet(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}
function safeSet(key: string, val: string): void {
    try {
        localStorage.setItem(key, val);
    } catch {}
}
function safeDel(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {}
}

function isPage(v: unknown): v is Page {
    return v === "home" || v === "learn" || v === "reader";
}

function toInt(v: unknown): number | null {
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeLoc(loc: Partial<ReaderLocation> | null | undefined): ReaderLocation | null {
    if (!loc || typeof loc.bookId !== "string" || !loc.bookId.trim()) return null;

    const bookId = loc.bookId.trim().toUpperCase();
    const chapter = toInt((loc as { chapter?: unknown }).chapter);
    const verseRaw = (loc as { verse?: unknown }).verse;

    if (chapter == null || chapter < 1) return null;

    const verse = verseRaw == null ? undefined : toInt(verseRaw) ?? undefined;
    if (verse != null && verse < 1) return { bookId, chapter };

    return { bookId, chapter, verse };
}

function parseLoc(raw: string | null): ReaderLocation | null {
    if (!raw) return null;
    try {
        const j = JSON.parse(raw) as Partial<ReaderLocation>;
        return normalizeLoc(j);
    } catch {
        return null;
    }
}

function encodeLoc(loc: ReaderLocation | null): string | null {
    if (!loc) return null;
    return JSON.stringify({
        bookId: loc.bookId,
        chapter: loc.chapter,
        verse: loc.verse ?? null,
    });
}

/* ---------------- URL intent + syncing ---------------- */
function readUrlIntent(): { page?: Page; loc?: ReaderLocation } {
    try {
        const { hash, search, pathname } = window.location;

        /* ---------------- hash routes ---------------- */
        const h = hash.trim();

        // Explicit reader loc: #/read/GEN/1/1 or #/read/GEN/1
        if (h.startsWith("#/read/")) {
            const parts = h
                .slice("#/read/".length)
                .split("/")
                .map((s) => s.trim())
                .filter(Boolean);

            const bookId = parts[0]?.toUpperCase();
            const chapter = toInt(parts[1]);
            const verse = parts[2] == null ? undefined : toInt(parts[2]) ?? undefined;

            const loc = normalizeLoc({ bookId, chapter: chapter ?? undefined, verse });
            if (loc) return { page: "reader", loc };
        }

        // Reader without explicit loc (use saved loc / last-ord restore)
        if (h === "#/reader") return { page: "reader" };
        if (h === "#/learn") return { page: "learn" };
        if (h === "#/home") return { page: "home" };

        /* ---------------- query routes ---------------- */
        const q = new URLSearchParams(search);

        const read = q.get("read");
        if (read) {
            const m = read.trim().match(/^([A-Za-z0-9]{2,8})\.(\d+)(?:\.(\d+))?$/);
            if (m) {
                const loc = normalizeLoc({
                    bookId: m[1],
                    chapter: Number(m[2]),
                    verse: m[3] ? Number(m[3]) : undefined,
                });
                if (loc) return { page: "reader", loc };
            }
        }

        const page = q.get("page");
        if (page === "learn") return { page: "learn" };
        if (page === "home") return { page: "home" };
        if (page === "reader") return { page: "reader" };

        /* ---------------- pathname routes ---------------- */
        const p = (pathname ?? "").toLowerCase();
        if (p.endsWith("/reader")) return { page: "reader" };
        if (p.endsWith("/learn")) return { page: "learn" };
        if (p.endsWith("/home")) return { page: "home" };

        return {};
    } catch {
        return {};
    }
}

function formatHash(page: Page, loc: ReaderLocation | null): string {
    if (page === "reader") {
        if (loc) {
            const base = `#/read/${loc.bookId}/${loc.chapter}`;
            return loc.verse ? `${base}/${loc.verse}` : base;
        }
        return "#/reader";
    }
    if (page === "learn") return "#/learn";
    return "#/home";
}

/* ---------------- App ---------------- */

export default function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <ReaderPrefsProvider>
                    <AppInner />
                </ReaderPrefsProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}

function AppInner() {
    const { mode, toggle } = useTheme();

    const initialNav = useMemo(() => {
        const url = typeof window === "undefined" ? {} : readUrlIntent();

        // Prefer new keys; fall back to legacy keys for migration.
        const savedPageRaw = safeGet(LS_LAST_PAGE) ?? safeGet(LS_LAST_PAGE_LEGACY);
        const savedPage: Page | null = isPage(savedPageRaw) ? savedPageRaw : null;

        const savedLoc =
            parseLoc(safeGet(LS_LAST_LOC)) ??
            parseLoc(safeGet(LS_LAST_LOC_LEGACY));

        // Default to HOME unless URL explicitly asked for reader.
        const page: Page = (url.page as Page | undefined) ?? (savedPage && savedPage !== "reader" ? savedPage : "home");
        const loc: ReaderLocation | null = url.loc ?? savedLoc;

        return { page, loc };
    }, []);

    const [page, setPage] = useState<Page>(initialNav.page);
    const [readerLoc, setReaderLoc] = useState<ReaderLocation | null>(initialNav.loc);

    // Whether *we* are currently writing to the URL (so popstate/hashchange doesn't bounce back)
    const writingUrl = useRef(false);

    // Keep last page + loc (new keys)
    useEffect(() => {
        safeSet(LS_LAST_PAGE, page);
    }, [page]);

    useEffect(() => {
        const enc = encodeLoc(readerLoc);
        if (enc) safeSet(LS_LAST_LOC, enc);
        else safeDel(LS_LAST_LOC);
    }, [readerLoc]);

    // One-time cleanup: once we've written new keys, legacy keys are no longer needed.
    useEffect(() => {
        // Only remove if new keys exist (avoid nuking in private mode edge cases).
        const hasNew = safeGet(LS_LAST_PAGE) != null || safeGet(LS_LAST_LOC) != null;
        if (!hasNew) return;
        safeDel(LS_LAST_PAGE_LEGACY);
        safeDel(LS_LAST_LOC_LEGACY);
    }, []);

    // Keep URL in sync
    useEffect(() => {
        if (typeof window === "undefined") return;

        const effectiveLoc = page === "reader" ? readerLoc : null;
        const nextHash = formatHash(page, effectiveLoc);

        if (window.location.hash === nextHash) return;

        writingUrl.current = true;
        window.history.replaceState(null, "", nextHash);
        window.setTimeout(() => {
            writingUrl.current = false;
        }, 0);
    }, [page, readerLoc]);

    // URL -> state
    useEffect(() => {
        if (typeof window === "undefined") return;

        const onNav = () => {
            if (writingUrl.current) return;

            const intent = readUrlIntent();

            if (intent.page) setPage(intent.page);
            if (intent.loc) setReaderLoc(intent.loc);
        };

        window.addEventListener("hashchange", onNav);
        window.addEventListener("popstate", onNav);
        return () => {
            window.removeEventListener("hashchange", onNav);
            window.removeEventListener("popstate", onNav);
        };
    }, []);

    const goHome = useCallback(() => setPage("home"), []);
    const goLearn = useCallback(() => setPage("learn"), []);

    const beginReader = useCallback((loc: ReaderLocation) => {
        const clean = normalizeLoc(loc) ?? { bookId: "GEN", chapter: 1, verse: 1 };
        setReaderLoc(clean);
        setPage("reader");
    }, []);

    const startReading = useCallback(() => {
        beginReader(readerLoc ?? { bookId: "GEN", chapter: 1, verse: 1 });
    }, [readerLoc, beginReader]);

    const navigateTo = useCallback(
        (loc: ReaderLocation) => {
            const clean = normalizeLoc(loc);
            if (!clean) return;
            beginReader(clean);
        },
        [beginReader],
    );

    const renderPage = useCallback(
        (p: Page, loc: ReaderLocation | null) => {
            if (p === "home") {
                return <Home onLearnMore={goLearn} onStartReading={startReading} onNavigate={navigateTo} />;
            }
            if (p === "learn") {
                return <LearnMorePage mode={mode} onToggleTheme={toggle} onBack={goHome} styles={styles} />;
            }
            return (
                <Reader
                    styles={styles}
                    initialLocation={loc ?? undefined}
                    onBackHome={goHome}
                    mode={mode}
                    onToggleTheme={toggle}
                />
            );
        },
        [goHome, goLearn, mode, toggle, startReading, navigateTo],
    );

    // No more account pill in the corner; sign-in lives on Home and account menu lives in ReaderHeader.
    const showCornerTheme = page !== "reader"; // reader already has a theme switch in the header

    return (
        <ThemeShell style={styles.page}>
            {showCornerTheme ? (
                <div style={styles.cornerControls} aria-label="Theme">
                    <ThemeTogglePill mode={mode} onToggle={toggle} />
                </div>
            ) : null}

            <div style={styles.stage}>{renderPage(page, page === "reader" ? readerLoc : null)}</div>
        </ThemeShell>
    );
}

/* ---------------- Home ---------------- */

function Home(props: { onLearnMore: () => void; onStartReading: () => void; onNavigate: (loc: ReaderLocation) => void }) {
    const { onLearnMore, onStartReading, onNavigate } = props;
    const { user, signInWithGoogle } = useAuth();

    return (
        <main style={styles.centerStage} aria-label="Landing">
            <div style={styles.centerBlock}>
                <div style={styles.crossWrap} aria-hidden>
                    <img src="/cross.png" alt="" style={styles.crossImg} draggable={false} decoding="async" loading="eager" />
                </div>

                <h1 style={styles.h1}>Biblia.to</h1>
                <p style={styles.lede}>
                    A public, open-access KJV Scripture platform centered on <strong>Jesus Christ</strong>, crucified and risen.
                </p>

                <div style={styles.searchContainer}>
                    <Search
                        styles={styles}
                        onNavigate={onNavigate}
                        onStartReading={onStartReading}
                        hint="Type a word or a reference (John 3:16)"
                    />
                </div>

                <div style={styles.ctaRow}>
                    <button type="button" onClick={onStartReading} style={styles.primaryBtnButton} aria-label="Start reading">
                        Start reading
                    </button>
                </div>

                {/* Home is the only place we need a sign-in CTA. */}
                <div style={styles.authRow} aria-label="Account">
                    {!user ? (
                        <>
                            <button
                                type="button"
                                onClick={() => signInWithGoogle({ returnTo: window.location.href })}
                                style={styles.authBtn}
                            >
                                Continue with Google
                            </button>
                            <div style={styles.authHint}>Optional. Use one account across devices.</div>
                        </>
                    ) : (
                        <>
                            <div style={styles.authHintStrong}>Signed in.</div>
                            <div style={styles.authHint}>Open the Reader to manage account (sign out, refresh).</div>
                        </>
                    )}
                </div>

                <button type="button" onClick={onLearnMore} style={styles.learnMoreBtn}>
                    Learn more
                </button>
            </div>
        </main>
    );
}

/* ---------------- Styles ---------------- */
export const styles: Record<string, React.CSSProperties> = {
    page: {
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--fg)",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
    },

    stage: {
        position: "relative",
        minHeight: "100vh",
    },

    cornerControls: {
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 8,
    },

    centerStage: {
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "64px 20px 48px",
        position: "relative",
    },

    centerBlock: {
        maxWidth: 860,
        width: "100%",
        textAlign: "center",
        margin: "0 auto",
    },

    crossWrap: {
        display: "grid",
        placeItems: "center",
        marginBottom: 10,
        opacity: 0.97,
    },

    crossImg: {
        width: 108,
        height: 108,
        objectFit: "contain",
        userSelect: "none",
        filter: "drop-shadow(0 14px 26px rgba(0,0,0,0.14))",
    },

    h1: {
        marginTop: 2,
        fontSize: 52,
        lineHeight: 1.05,
        letterSpacing: "-0.025em",
        marginBottom: 6,
    },

    lede: {
        marginTop: 6,
        fontSize: 13,
        lineHeight: 1.95,
        color: "var(--muted)",
        maxWidth: 620,
        marginInline: "auto",
    },

    searchContainer: {
        marginTop: 18,
        marginBottom: 22,
        display: "flex",
        justifyContent: "center",
    },

    searchWrap: {
        width: "100%",
        maxWidth: 660,
    },

    searchRow: {
        display: "grid",
        gridTemplateColumns: "24px 1fr",
        alignItems: "center",
        gap: 8,
        padding: "10px 18px",
        borderRadius: 30,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        maxWidth: 660,
        width: "100%",
        boxShadow: "0 8px 24px rgba(0,0,0,0.07)",
    },

    searchRowFocused: {
        borderColor: "var(--focus)",
        boxShadow: "0 12px 36px rgba(0,0,0,0.12), 0 0 0 3px var(--focusRing)",
    },

    searchIcon: {
        width: 24,
        textAlign: "center",
        color: "var(--muted)",
        fontSize: 15,
        opacity: 0.85,
    },

    searchInput: {
        border: "none",
        outline: "none",
        background: "transparent",
        color: "inherit",
        fontSize: 13.5,
        padding: "4px 0",
        width: "100%",
    },

    searchPanel: {},

    ctaRow: {
        marginTop: 10,
        display: "flex",
        justifyContent: "center",
    },

    primaryBtnButton: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "12px 20px",
        borderRadius: 14,
        background: "var(--fg)",
        color: "var(--bg)",
        fontSize: 13.5,
        fontWeight: 760,
        letterSpacing: "-0.01em",
        boxShadow: "0 10px 28px rgba(0,0,0,0.09)",
        border: "none",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
    },

    /* ---------- Auth CTA (home only) ---------- */
    authRow: {
        marginTop: 14,
        display: "grid",
        placeItems: "center",
        gap: 8,
    },

    authBtn: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "10px 14px",
        borderRadius: 12,
        border: "1px solid var(--hairline)",
        background:
            "linear-gradient(180deg, color-mix(in oklab, var(--panel) 92%, white), color-mix(in oklab, var(--panel) 98%, transparent))",
        color: "var(--fg)",
        fontSize: 12.8,
        fontWeight: 720,
        letterSpacing: "-0.01em",
        boxShadow: "0 10px 26px rgba(0,0,0,0.06)",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
    },

    authHint: {
        fontSize: 12.2,
        color: "var(--muted)",
        lineHeight: 1.6,
        maxWidth: 520,
        marginInline: "auto",
    },

    authHintStrong: {
        fontSize: 12.2,
        color: "var(--fg)",
        opacity: 0.92,
        fontWeight: 760,
        letterSpacing: "0.02em",
        textTransform: "uppercase",
    },

    learnMoreBtn: {
        marginTop: 18,
        fontSize: 12.2,
        color: "var(--muted)",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        padding: "8px 12px",
        borderRadius: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        WebkitTapHighlightColor: "transparent",
    },

    backBtn: {
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        cursor: "pointer",
    },
};