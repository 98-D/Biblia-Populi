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
type HistoryMode = "push" | "replace";

const LS_LAST_PAGE = "bt_nav_last_page_v1";
const LS_LAST_LOC = "bt_nav_last_loc_v1";
const LS_LAST_PAGE_LEGACY = "bp_nav_last_page_v1";
const LS_LAST_LOC_LEGACY = "bp_nav_last_loc_v1";

const HOME_HASH = "#/home";
const LEARN_HASH = "#/learn";
const READER_HASH = "#/reader";
const ACCOUNT_HASH = "#/account";

const DEFAULT_READER_LOCATION: ReaderLocation = Object.freeze({
    bookId: "GEN",
    chapter: 1,
    verse: 1,
});

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
    learnMoreWrap: React.CSSProperties;
}>;

type UrlIntent = Readonly<{
    page?: Page;
    loc?: ReaderLocation;
}>;

type RouteState = Readonly<{
    page: Page;
    readerLoc: ReaderLocation;
}>;

function css<T extends React.CSSProperties>(value: T): React.CSSProperties {
    return value;
}

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

function normalizeBookId(value: unknown): string | null {
    if (typeof value !== "string") return null;

    const normalized = value.trim().toUpperCase();
    return normalized.length > 0 ? normalized : null;
}

function normalizeLoc(loc: Partial<ReaderLocation> | null | undefined): ReaderLocation | null {
    if (!loc) return null;

    const bookId = normalizeBookId(loc.bookId);
    const chapter = toInt((loc as { chapter?: unknown }).chapter);
    const verseRaw = (loc as { verse?: unknown }).verse;

    if (!bookId || chapter == null || chapter < 1) {
        return null;
    }

    const verseInt = verseRaw == null ? undefined : toInt(verseRaw) ?? undefined;
    const verse = verseInt != null && verseInt >= 1 ? verseInt : undefined;

    return verse != null
        ? { bookId, chapter, verse }
        : { bookId, chapter };
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

function safeDecode(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function normalizePathname(pathname: string): string {
    const trimmed = pathname.trim();
    if (trimmed === "" || trimmed === "/") return "/";

    const normalized = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
    return normalized.toLowerCase() || "/";
}

function parseReadHash(hash: string): ReaderLocation | null {
    const raw = hash.trim();
    if (!raw.toLowerCase().startsWith("#/read/")) return null;

    const parts = raw
        .slice("#/read/".length)
        .split("/")
        .map((part) => safeDecode(part).trim())
        .filter(Boolean);

    return normalizeLoc({
        bookId: parts[0],
        chapter: parts[1],
        verse: parts[2],
    });
}

function readUrlIntent(): UrlIntent {
    if (!isBrowser()) return {};

    try {
        const { hash, search, pathname } = window.location;
        const trimmedHash = hash.trim();
        const lowerHash = trimmedHash.toLowerCase();

        const readLoc = parseReadHash(trimmedHash);
        if (readLoc) {
            return { page: "reader", loc: readLoc };
        }

        if (lowerHash === READER_HASH) return { page: "reader" };
        if (lowerHash === LEARN_HASH) return { page: "learn" };
        if (lowerHash === HOME_HASH) return { page: "home" };
        if (lowerHash === ACCOUNT_HASH) return { page: "account" };

        const query = new URLSearchParams(search);
        const pageQuery = query.get("page")?.trim().toLowerCase();

        if (pageQuery === "reader") return { page: "reader" };
        if (pageQuery === "learn") return { page: "learn" };
        if (pageQuery === "home") return { page: "home" };
        if (pageQuery === "account") return { page: "account" };

        const normalizedPath = normalizePathname(pathname);

        if (normalizedPath === "/account") return { page: "account" };
        if (normalizedPath === "/reader") return { page: "reader" };
        if (normalizedPath === "/learn") return { page: "learn" };
        if (normalizedPath === "/") return { page: "home" };
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

function writeUrl(mode: HistoryMode, page: Page, loc: ReaderLocation | null): void {
    if (!isBrowser()) return;

    const nextHash = hashForPage(page, loc);
    if (window.location.hash === nextHash) return;

    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    const method = mode === "push" ? "pushState" : "replaceState";

    window.history[method](null, "", nextUrl);
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

const APP_STYLES: AppStyles = Object.freeze({
    page: css({
        minHeight: "100dvh",
        background: "var(--bg)",
        color: "var(--fg)",
        minWidth: 0,
    }),

    stage: css({
        minHeight: "100dvh",
        minWidth: 0,
    }),

    centerStage: css({
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "28px 20px",
        minWidth: 0,
    }),

    centerBlock: css({
        width: "100%",
        maxWidth: 880,
        display: "grid",
        justifyItems: "center",
        textAlign: "center",
        minWidth: 0,
    }),

    cornerControls: css({
        position: "fixed",
        top: "calc(16px + env(safe-area-inset-top, 0px))",
        right: "calc(16px + env(safe-area-inset-right, 0px))",
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        gap: 10,
    }),

    crossWrap: css({
        width: 108,
        height: 108,
        marginBottom: 18,
        display: "grid",
        placeItems: "center",
        flex: "0 0 auto",
    }),

    crossImg: css({
        width: "100%",
        height: "100%",
        objectFit: "contain",
        userSelect: "none",
        pointerEvents: "none",
    }),

    h1: css({
        margin: 0,
        fontSize: "clamp(42px, 7vw, 82px)",
        lineHeight: 0.95,
        letterSpacing: "-0.04em",
        fontWeight: 820,
        minWidth: 0,
    }),

    lede: css({
        margin: "16px 0 0",
        maxWidth: 700,
        fontSize: "clamp(16px, 2.1vw, 20px)",
        lineHeight: 1.55,
        opacity: 0.84,
        minWidth: 0,
    }),

    searchContainer: css({
        width: "100%",
        maxWidth: 760,
        marginTop: 28,
        minWidth: 0,
    }),

    ctaRow: css({
        marginTop: 18,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
    }),

    primaryBtnButton: css({
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
        appearance: "none",
        WebkitAppearance: "none",
        outline: "none",
        WebkitTapHighlightColor: "transparent",
    }),

    secondaryBtnButton: css({
        height: 44,
        borderRadius: 999,
        padding: "0 18px",
        border: "1px solid color-mix(in srgb, var(--border) 76%, transparent)",
        background: "transparent",
        color: "var(--fg)",
        fontSize: 14,
        fontWeight: 760,
        cursor: "pointer",
        appearance: "none",
        WebkitAppearance: "none",
        outline: "none",
        WebkitTapHighlightColor: "transparent",
    }),

    subtleBtnButton: css({
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
        appearance: "none",
        WebkitAppearance: "none",
        outline: "none",
        WebkitTapHighlightColor: "transparent",
    }),

    signedInPill: css({
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
        minWidth: 0,
        maxWidth: "100%",
    }),

    learnMoreWrap: css({
        marginTop: 10,
    }),
});

function getInitialRouteState(): RouteState {
    const intent = readUrlIntent();
    const savedPage = getSavedPage();
    const savedLoc = getSavedLoc();
    const readerLoc = intent.loc ?? savedLoc ?? DEFAULT_READER_LOCATION;
    const page = intent.page ?? savedPage ?? "home";

    return {
        page,
        readerLoc,
    };
}

function AppInner() {
    const { mode, toggle } = useTheme();

    const initialRouteRef = useRef<RouteState>(getInitialRouteState());

    const [page, setPage] = useState<Page>(initialRouteRef.current.page);
    const [readerLoc, setReaderLoc] = useState<ReaderLocation>(initialRouteRef.current.readerLoc);

    const readerLocRef = useRef(readerLoc);

    useEffect(() => {
        readerLocRef.current = readerLoc;
    }, [readerLoc]);

    const styles = useMemo<AppStyles>(() => APP_STYLES, []);
    const readerRouteKey = useMemo(
        () => `${readerLoc.bookId}:${readerLoc.chapter}:${readerLoc.verse ?? 0}`,
        [readerLoc],
    );

    const navigateToPage = useCallback(
        (nextPage: Page, historyMode: HistoryMode = "push") => {
            setPage(nextPage);
            savePage(nextPage);
            writeUrl(historyMode, nextPage, nextPage === "reader" ? readerLocRef.current : null);
        },
        [],
    );

    const navigateToReader = useCallback(
        (loc: ReaderLocation, historyMode: HistoryMode = "push") => {
            const normalized = normalizeLoc(loc);
            if (!normalized) return;

            setReaderLoc(normalized);
            setPage("reader");

            saveLoc(normalized);
            savePage("reader");
            writeUrl(historyMode, "reader", normalized);
        },
        [],
    );

    useEffect(() => {
        savePage(page);
    }, [page]);

    useEffect(() => {
        saveLoc(readerLoc);
    }, [readerLoc]);

    useEffect(() => {
        if (!isBrowser()) return;
        writeUrl("replace", page, page === "reader" ? readerLoc : null);
        // intentional one-time canonical sync
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!isBrowser()) return;

        const syncFromUrl = () => {
            const intent = readUrlIntent();
            const nextPage = intent.page ?? "home";
            const fallbackLoc = readerLocRef.current ?? DEFAULT_READER_LOCATION;
            const nextLoc = intent.loc ?? fallbackLoc;

            setPage(nextPage);

            const normalized = normalizeLoc(nextLoc);
            if (normalized) {
                setReaderLoc(normalized);
            }
        };

        window.addEventListener("hashchange", syncFromUrl);
        window.addEventListener("popstate", syncFromUrl);

        return () => {
            window.removeEventListener("hashchange", syncFromUrl);
            window.removeEventListener("popstate", syncFromUrl);
        };
    }, []);

    const goHome = useCallback(() => {
        navigateToPage("home");
    }, [navigateToPage]);

    const goLearn = useCallback(() => {
        navigateToPage("learn");
    }, [navigateToPage]);

    const goAccount = useCallback(() => {
        navigateToPage("account");
    }, [navigateToPage]);

    const startReading = useCallback(() => {
        navigateToReader(readerLocRef.current ?? DEFAULT_READER_LOCATION);
    }, [navigateToReader]);

    const navigateTo = useCallback(
        (loc: ReaderLocation) => {
            navigateToReader(loc);
        },
        [navigateToReader],
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
                key={readerRouteKey}
                styles={styles}
                initialLocation={readerLoc}
                onBackHome={goHome}
                mode={mode}
                onToggleTheme={toggle}
            />
        );
    }, [goAccount, goHome, goLearn, mode, navigateTo, page, readerLoc, readerRouteKey, startReading, styles, toggle]);

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
        const returnTo = isBrowser() ? window.location.href : undefined;

        Promise.resolve(signInWithGoogle({ returnTo })).catch(() => {
            // auth layer can surface its own error UI
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
                    <div style={styles.signedInPill} title={signedInLabel}>
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

                <div style={styles.learnMoreWrap}>
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