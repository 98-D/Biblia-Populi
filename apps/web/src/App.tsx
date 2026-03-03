// apps/web/src/App.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LearnMorePage } from "./LearnMorePage";
import { Reader } from "./Reader";
import { Search, type ReaderLocation } from "./Search";
import { ThemeProvider, ThemeShell, ThemeTogglePill, useTheme } from "./theme";

type Page = "home" | "learn" | "reader";

const LS_LAST_PAGE = "bp_nav_last_page_v1";
const LS_LAST_LOC = "bp_nav_last_loc_v1";

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
    const chapter = toInt((loc as any).chapter);
    const verseRaw = (loc as any).verse;

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
        const { hash, search } = window.location;

        const h = hash.trim();
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
        if (h === "#/learn") return { page: "learn" };
        if (h === "#/home") return { page: "home" };

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

        return {};
    } catch {
        return {};
    }
}

function formatHash(page: Page, loc: ReaderLocation | null): string {
    if (page === "reader" && loc) {
        const base = `#/read/${loc.bookId}/${loc.chapter}`;
        return loc.verse ? `${base}/${loc.verse}` : base;
    }
    if (page === "learn") return "#/learn";
    return "#/home";
}

/* ---------------- Motion prefs ---------------- */
function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const onChange = () => setReduced(mq.matches);
        onChange();
        mq.addEventListener?.("change", onChange);
        return () => mq.removeEventListener?.("change", onChange);
    }, []);
    return reduced;
}

/* ---------------- App ---------------- */
export default function App() {
    return (
        <ThemeProvider>
            <AppInner />
        </ThemeProvider>
    );
}

/**
 * HomeFx drives the home -> reader “opening” motion.
 * NOTE: phase is *part of the type* (fixes TS2339: Property 'phase' does not exist on type 'HomeFx'.)
 */
type HomeFx =
    | null
    | {
    kind: "homeToReader";
    phase: "prep" | "go";
    durationMs: number;
    from: { page: Page; loc: ReaderLocation | null };
    to: { page: Page; loc: ReaderLocation | null };
};

function AppInner() {
    const { mode, toggle } = useTheme();
    const reducedMotion = usePrefersReducedMotion();

    const initialNav = useMemo(() => {
        const url = typeof window === "undefined" ? {} : readUrlIntent();

        const savedPageRaw = safeGet(LS_LAST_PAGE);
        const savedPage: Page | null = isPage(savedPageRaw) ? savedPageRaw : null;

        const savedLoc = parseLoc(safeGet(LS_LAST_LOC));

        const page: Page = (url.page as Page | undefined) ?? savedPage ?? "home";
        const loc: ReaderLocation | null = url.loc ?? savedLoc;

        return { page, loc };
    }, []);

    const [page, setPage] = useState<Page>(initialNav.page);
    const [readerLoc, setReaderLoc] = useState<ReaderLocation | null>(initialNav.loc);

    const [homeFx, setHomeFx] = useState<HomeFx>(null);
    const fxTimerRef = useRef<number | null>(null);

    const writingUrl = useRef(false);

    useEffect(() => {
        safeSet(LS_LAST_PAGE, page);
    }, [page]);

    useEffect(() => {
        const enc = encodeLoc(readerLoc);
        if (enc) safeSet(LS_LAST_LOC, enc);
        else safeDel(LS_LAST_LOC);
    }, [readerLoc]);

    // Keep URL in sync (during fx, reflect target immediately).
    useEffect(() => {
        if (typeof window === "undefined") return;

        const effectivePage = homeFx?.to.page ?? page;
        const effectiveLoc = effectivePage === "reader" ? homeFx?.to.loc ?? readerLoc : null;

        const nextHash = formatHash(effectivePage, effectivePage === "reader" ? effectiveLoc : null);
        if (window.location.hash === nextHash) return;

        writingUrl.current = true;
        window.history.replaceState(null, "", nextHash);
        window.setTimeout(() => {
            writingUrl.current = false;
        }, 0);
    }, [page, readerLoc, homeFx]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const onNav = () => {
            if (writingUrl.current) return;

            // ignore nav churn mid fx (prevents flicker / double mounts)
            if (homeFx) return;

            const intent = readUrlIntent();
            if (intent.page && intent.page !== page) setPage(intent.page);
            if (intent.loc) setReaderLoc(intent.loc);
        };

        window.addEventListener("hashchange", onNav);
        window.addEventListener("popstate", onNav);
        return () => {
            window.removeEventListener("hashchange", onNav);
            window.removeEventListener("popstate", onNav);
        };
    }, [page, homeFx]);

    useEffect(() => {
        return () => {
            if (fxTimerRef.current != null) window.clearTimeout(fxTimerRef.current);
        };
    }, []);

    const cancelFx = useCallback(() => {
        if (fxTimerRef.current != null) window.clearTimeout(fxTimerRef.current);
        fxTimerRef.current = null;
        setHomeFx(null);
    }, []);

    const goHome = useCallback(() => {
        cancelFx();
        setPage("home");
    }, [cancelFx]);

    const goLearn = useCallback(() => {
        cancelFx();
        setPage("learn");
    }, [cancelFx]);

    const goReader = useCallback(() => {
        cancelFx();
        setPage("reader");
    }, [cancelFx]);

    const beginHomeToReader = useCallback(
        (loc: ReaderLocation) => {
            const clean = normalizeLoc(loc) ?? { bookId: "GEN", chapter: 1, verse: 1 };

            // commit target loc immediately (Reader can mount and warm cache)
            setReaderLoc(clean);

            if (reducedMotion || page !== "home") {
                cancelFx();
                setPage("reader");
                return;
            }

            if (fxTimerRef.current != null) window.clearTimeout(fxTimerRef.current);

            const durationMs = 520;

            setHomeFx({
                kind: "homeToReader",
                phase: "prep",
                durationMs,
                from: { page: "home", loc: null },
                to: { page: "reader", loc: clean },
            });

            requestAnimationFrame(() => {
                setHomeFx((fx) => (fx && fx.kind === "homeToReader" ? { ...fx, phase: "go" } : fx));
            });

            fxTimerRef.current = window.setTimeout(() => {
                setHomeFx(null);
                setPage("reader");
            }, durationMs);
        },
        [cancelFx, page, reducedMotion],
    );

    const startReading = useCallback(() => {
        const loc = readerLoc ?? { bookId: "GEN", chapter: 1, verse: 1 };
        beginHomeToReader(loc);
    }, [readerLoc, beginHomeToReader]);

    const navigateTo = useCallback(
        (loc: ReaderLocation) => {
            const clean = normalizeLoc(loc);
            if (!clean) return;
            beginHomeToReader(clean);
        },
        [beginHomeToReader],
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

    const showFx = homeFx?.kind === "homeToReader";

    return (
        <ThemeShell style={styles.page}>
            {/* GLOBAL: same toggle, same position, all pages */}
            <div style={styles.cornerControls} aria-label="App controls">
                <ThemeTogglePill mode={mode} onToggle={toggle} />
            </div>

            <div style={styles.stage}>
                {showFx && homeFx ? (
                    <HomeToReaderTransition
                        phase={homeFx.phase}
                        durationMs={homeFx.durationMs}
                        from={renderPage(homeFx.from.page, homeFx.from.loc)}
                        to={renderPage(homeFx.to.page, homeFx.to.loc)}
                    />
                ) : (
                    renderPage(page, page === "reader" ? readerLoc : null)
                )}
            </div>
        </ThemeShell>
    );
}

/* ---------------- Transition component ---------------- */

function HomeToReaderTransition(props: {
    phase: "prep" | "go";
    durationMs: number;
    from: React.ReactNode;
    to: React.ReactNode;
}) {
    const { phase, durationMs, from, to } = props;

    const t = `${durationMs}ms`;
    const ease = "cubic-bezier(0.22, 1, 0.32, 1)";
    const go = phase === "go";

    return (
        <div style={tStyles.root} aria-label="Transition">
            {/* HOME layer */}
            <div
                style={{
                    ...tStyles.layer,
                    zIndex: 1,
                    opacity: go ? 0 : 1,
                    transform: go ? "translateY(-10px) scale(0.985)" : "translateY(0) scale(1)",
                    transition: `opacity ${t} ${ease}, transform ${t} ${ease}, filter ${t} ${ease}`,
                    filter: go ? "blur(6px)" : "blur(0px)",
                    pointerEvents: "none",
                }}
            >
                {from}
            </div>

            {/* Paper curtain */}
            <div
                style={{
                    ...tStyles.curtain,
                    opacity: go ? 1 : 0,
                    transition: `opacity ${t} ${ease}`,
                }}
                aria-hidden
            />

            {/* READER layer */}
            <div
                style={{
                    ...tStyles.layer,
                    zIndex: 3,
                    opacity: go ? 1 : 0,
                    transform: go ? "translateY(0) scale(1)" : "translateY(18px) scale(0.995)",
                    transition: `opacity ${t} ${ease}, transform ${t} ${ease}`,
                    pointerEvents: go ? "auto" : "none",
                }}
            >
                {to}
            </div>
        </div>
    );
}

const tStyles: Record<string, React.CSSProperties> = {
    root: { position: "relative", minHeight: "100vh" },
    layer: { position: "absolute", inset: 0, willChange: "transform, opacity, filter" },
    curtain: {
        position: "absolute",
        inset: 0,
        zIndex: 2,
        background:
            "radial-gradient(1200px 600px at 50% 10%, rgba(0,0,0,0.06), transparent 55%), var(--bg)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)",
        pointerEvents: "none",
    },
};

/* ---------------- Home ---------------- */

function usePressing() {
    const [down, setDown] = useState(false);
    const handlers = useMemo(
        () => ({
            onPointerDown: () => setDown(true),
            onPointerUp: () => setDown(false),
            onPointerCancel: () => setDown(false),
            onPointerLeave: () => setDown(false),
        }),
        [],
    );
    return { down, handlers };
}

function Home(props: {
    onLearnMore: () => void;
    onStartReading: () => void;
    onNavigate: (loc: ReaderLocation) => void;
}) {
    const { onLearnMore, onStartReading, onNavigate } = props;

    const primary = usePressing();
    const learn = usePressing();

    return (
        <main style={styles.centerStage} aria-label="Landing">
            <div style={styles.centerBlock}>
                <div style={styles.crossWrap} aria-hidden>
                    <img src="/cross.png" alt="" style={styles.crossImg} draggable={false} decoding="async" loading="eager" />
                </div>

                <h1 style={styles.h1}>Biblia Populi</h1>
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
                    <button
                        type="button"
                        onClick={onStartReading}
                        style={{
                            ...styles.primaryBtnButton,
                            ...(primary.down ? styles.btnPressed : null),
                        }}
                        aria-label="Start reading"
                        {...primary.handlers}
                    >
                        Start reading
                    </button>
                </div>

                <button
                    type="button"
                    onClick={onLearnMore}
                    style={{
                        ...styles.learnMoreBtn,
                        ...(learn.down ? styles.linkPressed : null),
                    }}
                    {...learn.handlers}
                >
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

    // isolate page content so we can stack it for transitions
    stage: {
        position: "relative",
        minHeight: "100vh",
    },

    // global, consistent for all pages
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

    // Search reads these (and now also reads searchWrap/searchPanel for sizing)
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
        transition: "box-shadow 180ms ease, border-color 180ms ease",
    },

    // (typo fix) keep the official spelling: "oklab"
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

    // optional hook for Search panel (keeps things consistent)
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
        transition: "all 140ms cubic-bezier(0.23, 1, 0.32, 1)",
        WebkitTapHighlightColor: "transparent",
    },

    btnPressed: {
        transform: "translateY(1px) scale(0.985)",
        opacity: 0.96,
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
        transition: "opacity 160ms ease",
        opacity: 0.9,
        WebkitTapHighlightColor: "transparent",
    },

    linkPressed: { opacity: 0.7 },

    // handy for LearnMorePage (optional)
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

    footerMuted: {
        color: "var(--muted)",
        fontSize: 12,
    },
};