// apps/web/src/App.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccountPage } from "./auth/AccountPage";
import { AuthProvider, useAuth } from "./auth/useAuth";
import { LearnMorePage } from "./LearnMorePage";
import { Reader } from "./Reader";
import { ReaderPrefsProvider } from "./reader/prefs/ReaderPrefsProvider";
import { Search, type ReaderLocation } from "./Search";
import { ThemeProvider, ThemeShell, ThemeTogglePill, useTheme } from "./theme";

type Page = "home" | "learn" | "reader" | "account";

const LS_LAST_PAGE = "bt_nav_last_page_v1";
const LS_LAST_LOC = "bt_nav_last_loc_v1";
const LS_LAST_PAGE_LEGACY = "bp_nav_last_page_v1";
const LS_LAST_LOC_LEGACY = "bp_nav_last_loc_v1";

const HOME_HASH = "#/home";
const LEARN_HASH = "#/learn";
const READER_HASH = "#/reader";
const ACCOUNT_HASH = "#/account";

const DEFAULT_READER_LOCATION: ReaderLocation = {
    bookId: "GEN",
    chapter: 1,
    verse: 1,
};

type AppStyles = Readonly<{
    page: React.CSSProperties;
    stage: React.CSSProperties;
    centerStage: React.CSSProperties;
    centerBlock: React.CSSProperties;
    cornerControls: React.CSSProperties;
    crossWrap: React.CSSProperties;
    crossImg: React.CSSProperties;
    h1: React.CSSProperties;
    lede: React.CSSProperties;
    searchContainer: React.CSSProperties;
    ctaRow: React.CSSProperties;
    primaryBtnButton: React.CSSProperties;
    secondaryBtnButton: React.CSSProperties;
    subtleBtnButton: React.CSSProperties;
    signedInPill: React.CSSProperties;
}>;

type UrlIntent = Readonly<{
    page?: Page;
    loc?: ReaderLocation;
}>;

function isBrowser(): boolean {
    return typeof window !== "undefined";
}

function safeGet(key: string): string | null {
    if (!isBrowser()) return null;

    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeSet(key: string, val: string): void {
    if (!isBrowser()) return;

    try {
        window.localStorage.setItem(key, val);
    } catch {
        // ignore
    }
}

function safeDel(key: string): void {
    if (!isBrowser()) return;

    try {
        window.localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

function isPage(value: unknown): value is Page {
    return value === "home" || value === "learn" || value === "reader" || value === "account";
}

function toInt(value: unknown): number | null {
    const n =
         typeof value === "number"
              ? value
              : typeof value === "string" && value.trim() !== ""
                   ? Number(value)
                   : Number.NaN;

    return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeLoc(loc: Partial<ReaderLocation> | null | undefined): ReaderLocation | null {
    if (!loc || typeof loc.bookId !== "string" || loc.bookId.trim().length === 0) {
        return null;
    }

    const bookId = loc.bookId.trim().toUpperCase();
    const chapter = toInt((loc as { chapter?: unknown }).chapter);
    const verseRaw = (loc as { verse?: unknown }).verse;

    if (chapter == null || chapter < 1) {
        return null;
    }

    const verse = verseRaw == null ? undefined : toInt(verseRaw) ?? undefined;

    if (verse != null && verse < 1) {
        return { bookId, chapter };
    }

    return { bookId, chapter, verse };
}

function parseLoc(raw: string | null): ReaderLocation | null {
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as Partial<ReaderLocation>;
        return normalizeLoc(parsed);
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

function readUrlIntent(): UrlIntent {
    if (!isBrowser()) return {};

    try {
        const { hash, search, pathname } = window.location;
        const trimmedHash = hash.trim();

        if (trimmedHash.startsWith("#/read/")) {
            const parts = trimmedHash
                 .slice("#/read/".length)
                 .split("/")
                 .map((part) => part.trim())
                 .filter(Boolean);

            const bookId = parts[0]?.toUpperCase();
            const chapter = toInt(parts[1]);
            const verse = parts[2] == null ? undefined : toInt(parts[2]) ?? undefined;

            const loc = normalizeLoc({
                bookId,
                chapter: chapter ?? undefined,
                verse,
            });

            if (loc) {
                return { page: "reader", loc };
            }
        }

        if (trimmedHash === READER_HASH) return { page: "reader" };
        if (trimmedHash === LEARN_HASH) return { page: "learn" };
        if (trimmedHash === HOME_HASH) return { page: "home" };
        if (trimmedHash === ACCOUNT_HASH) return { page: "account" };

        const query = new URLSearchParams(search);
        const pageQuery = query.get("page")?.trim().toLowerCase();

        if (pageQuery === "reader") return { page: "reader" };
        if (pageQuery === "learn") return { page: "learn" };
        if (pageQuery === "home") return { page: "home" };
        if (pageQuery === "account") return { page: "account" };

        if (pathname === "/account") return { page: "account" };
        if (pathname === "/reader") return { page: "reader" };
        if (pathname === "/learn") return { page: "learn" };
        if (pathname === "/" || pathname === "") return { page: "home" };
    } catch {
        // ignore
    }

    return {};
}

function hashForPage(page: Page, loc: ReaderLocation | null): string {
    if (page === "reader" && loc) {
        return loc.verse != null
             ? `#/read/${loc.bookId}/${loc.chapter}/${loc.verse}`
             : `#/read/${loc.bookId}/${loc.chapter}`;
    }

    switch (page) {
        case "reader":
            return READER_HASH;
        case "learn":
            return LEARN_HASH;
        case "account":
            return ACCOUNT_HASH;
        case "home":
        default:
            return HOME_HASH;
    }
}

function writeUrl(page: Page, loc: ReaderLocation | null): void {
    if (!isBrowser()) return;

    const nextHash = hashForPage(page, loc);
    if (window.location.hash === nextHash) return;

    window.history.replaceState(null, "", nextHash);
}

function getSavedPage(): Page | null {
    const current = safeGet(LS_LAST_PAGE);
    if (isPage(current)) return current;

    const legacy = safeGet(LS_LAST_PAGE_LEGACY);
    if (isPage(legacy)) return legacy;

    return null;
}

function getSavedLoc(): ReaderLocation | null {
    return parseLoc(safeGet(LS_LAST_LOC)) ?? parseLoc(safeGet(LS_LAST_LOC_LEGACY));
}

function savePage(page: Page): void {
    safeSet(LS_LAST_PAGE, page);
}

function saveLoc(loc: ReaderLocation | null): void {
    const encoded = encodeLoc(loc);

    if (encoded) {
        safeSet(LS_LAST_LOC, encoded);
        return;
    }

    safeDel(LS_LAST_LOC);
}

function createAppStyles(): AppStyles {
    return {
        page: {
            minHeight: "100dvh",
            background: "var(--bg)",
            color: "var(--fg)",
        },
        stage: {
            minHeight: "100dvh",
        },
        centerStage: {
            minHeight: "100dvh",
            display: "grid",
            placeItems: "center",
            padding: "28px 20px",
        },
        centerBlock: {
            width: "100%",
            maxWidth: 880,
            display: "grid",
            justifyItems: "center",
            textAlign: "center",
        },
        cornerControls: {
            position: "fixed",
            top: 16,
            right: 16,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            gap: 10,
        },
        crossWrap: {
            width: 108,
            height: 108,
            marginBottom: 18,
            display: "grid",
            placeItems: "center",
        },
        crossImg: {
            width: "100%",
            height: "100%",
            objectFit: "contain",
            userSelect: "none",
        },
        h1: {
            margin: 0,
            fontSize: "clamp(42px, 7vw, 82px)",
            lineHeight: 0.95,
            letterSpacing: "-0.04em",
            fontWeight: 820,
        },
        lede: {
            margin: "16px 0 0",
            maxWidth: 700,
            fontSize: "clamp(16px, 2.1vw, 20px)",
            lineHeight: 1.55,
            opacity: 0.84,
        },
        searchContainer: {
            width: "100%",
            maxWidth: 760,
            marginTop: 28,
        },
        ctaRow: {
            marginTop: 18,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
        },
        primaryBtnButton: {
            height: 44,
            borderRadius: 999,
            padding: "0 18px",
            border: "1px solid transparent",
            background: "var(--fg)",
            color: "var(--bg)",
            fontSize: 14,
            fontWeight: 760,
            cursor: "pointer",
            boxShadow: "0 14px 32px color-mix(in srgb, black 14%, transparent)",
        },
        secondaryBtnButton: {
            height: 44,
            borderRadius: 999,
            padding: "0 18px",
            border: "1px solid color-mix(in srgb, var(--border) 76%, transparent)",
            background: "transparent",
            color: "var(--fg)",
            fontSize: 14,
            fontWeight: 760,
            cursor: "pointer",
        },
        subtleBtnButton: {
            height: 42,
            borderRadius: 999,
            padding: "0 16px",
            border: "1px solid transparent",
            background: "transparent",
            color: "var(--fg)",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            opacity: 0.78,
        },
        signedInPill: {
            marginTop: 12,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            minHeight: 34,
            borderRadius: 999,
            padding: "0 12px",
            border: "1px solid color-mix(in srgb, var(--border) 72%, transparent)",
            background: "color-mix(in srgb, var(--activeBg) 36%, transparent)",
            fontSize: 13,
            fontWeight: 650,
            opacity: 0.9,
        },
    };
}

function AppInner() {
    const { mode, toggle } = useTheme();
    const { openAccountPage } = useAuth();

    const initialUrlIntentRef = useRef<UrlIntent>(readUrlIntent());

    const [page, setPage] = useState<Page>(() => {
        const initialPage = initialUrlIntentRef.current.page;
        return initialPage ?? getSavedPage() ?? "home";
    });

    const [readerLoc, setReaderLoc] = useState<ReaderLocation | null>(() => {
        return initialUrlIntentRef.current.loc ?? getSavedLoc() ?? DEFAULT_READER_LOCATION;
    });

    const styles = useMemo<AppStyles>(() => createAppStyles(), []);

    useEffect(() => {
        if (!isBrowser()) return;

        const onHashChange = () => {
            const next = readUrlIntent();

            if (next.page) {
                setPage(next.page);
            }

            if (next.loc) {
                setReaderLoc(next.loc);
            }
        };

        window.addEventListener("hashchange", onHashChange);
        return () => window.removeEventListener("hashchange", onHashChange);
    }, []);

    useEffect(() => {
        savePage(page);
        writeUrl(page, page === "reader" ? readerLoc : null);
    }, [page, readerLoc]);

    useEffect(() => {
        saveLoc(readerLoc);
    }, [readerLoc]);

    const goHome = useCallback(() => {
        setPage("home");
    }, []);

    const goLearn = useCallback(() => {
        setPage("learn");
    }, []);

    const goAccount = useCallback(() => {
        setPage("account");
        openAccountPage();
    }, [openAccountPage]);

    const beginReader = useCallback((loc: ReaderLocation) => {
        const normalized = normalizeLoc(loc);
        if (!normalized) return;

        setReaderLoc(normalized);
        setPage("reader");
    }, []);

    const startReading = useCallback(() => {
        beginReader(readerLoc ?? DEFAULT_READER_LOCATION);
    }, [beginReader, readerLoc]);

    const navigateTo = useCallback(
         (loc: ReaderLocation) => {
             const normalized = normalizeLoc(loc);
             if (!normalized) return;

             beginReader(normalized);
         },
         [beginReader],
    );

    const renderPage = useCallback((): React.ReactNode => {
        if (page === "home") {
            return (
                 <Home
                      styles={styles}
                      onLearnMore={goLearn}
                      onStartReading={startReading}
                      onNavigate={navigateTo}
                      onOpenAccount={goAccount}
                 />
            );
        }

        if (page === "learn") {
            return (
                 <LearnMorePage
                      mode={mode}
                      onToggleTheme={toggle}
                      onBack={goHome}
                      styles={styles}
                 />
            );
        }

        if (page === "account") {
            return <AccountPage onBackHome={goHome} />;
        }

        return (
             <Reader
                  styles={styles}
                  initialLocation={readerLoc ?? undefined}
                  onBackHome={goHome}
                  mode={mode}
                  onToggleTheme={toggle}
             />
        );
    }, [goAccount, goHome, goLearn, mode, navigateTo, page, readerLoc, startReading, styles, toggle]);

    const showCornerTheme = page !== "reader";

    return (
         <ThemeShell style={styles.page}>
             {showCornerTheme ? (
                  <div style={styles.cornerControls} aria-label="Theme">
                      <ThemeTogglePill mode={mode} onToggle={toggle} />
                  </div>
             ) : null}

             <div style={styles.stage}>{renderPage()}</div>
         </ThemeShell>
    );
}

type HomeProps = Readonly<{
    styles: AppStyles;
    onLearnMore: () => void;
    onStartReading: () => void;
    onNavigate: (loc: ReaderLocation) => void;
    onOpenAccount: () => void;
}>;

function Home(props: HomeProps) {
    const { styles, onLearnMore, onStartReading, onNavigate, onOpenAccount } = props;
    const { user, signedIn, signInWithGoogle } = useAuth();

    const onSignIn = useCallback(() => {
        signInWithGoogle({
            returnTo: isBrowser() ? window.location.href : undefined,
        });
    }, [signInWithGoogle]);

    const signedInLabel = user?.displayName?.trim() || user?.email?.trim() || "User";

    return (
         <main style={styles.centerStage} aria-label="Landing">
             <div style={styles.centerBlock}>
                 <div style={styles.crossWrap} aria-hidden="true">
                     <img
                          src="/cross.png"
                          alt=""
                          style={styles.crossImg}
                          draggable={false}
                          decoding="async"
                          loading="eager"
                     />
                 </div>

                 <h1 style={styles.h1}>Biblia.to</h1>

                 <p style={styles.lede}>
                     A public, open-access KJV Scripture platform centered on{" "}
                     <strong>Jesus Christ</strong>, crucified and risen.
                 </p>

                 {signedIn ? (
                      <div style={styles.signedInPill}>
                          Signed in as {signedInLabel}
                      </div>
                 ) : null}

                 <div style={styles.searchContainer}>
                     <Search
                          styles={styles}
                          onNavigate={onNavigate}
                          onStartReading={onStartReading}
                          hint="Type a word or a reference (John 3:16)"
                     />
                 </div>

                 <div style={styles.ctaRow}>
                     <button
                          type="button"
                          onClick={onStartReading}
                          style={styles.primaryBtnButton}
                          aria-label="Start reading"
                     >
                         Start reading
                     </button>

                     {signedIn ? (
                          <button
                               type="button"
                               onClick={onOpenAccount}
                               style={styles.secondaryBtnButton}
                               aria-label="Open account"
                          >
                              Account
                          </button>
                     ) : (
                          <button
                               type="button"
                               onClick={onSignIn}
                               style={styles.secondaryBtnButton}
                               aria-label="Continue with Google"
                          >
                              Continue with Google
                          </button>
                     )}
                 </div>

                 <div style={{ marginTop: 10 }}>
                     <button
                          type="button"
                          onClick={onLearnMore}
                          style={styles.subtleBtnButton}
                          aria-label="Learn more"
                     >
                         Learn more
                     </button>
                 </div>
             </div>
         </main>
    );
}

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