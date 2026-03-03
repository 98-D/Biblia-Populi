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

/* ---------------- App ---------------- */
export default function App() {
  return (
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
  );
}

function AppInner() {
  const { mode, toggle } = useTheme();

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

  // prevent feedback loop when we write hash
  const writingUrl = useRef(false);

  // Persist nav (localStorage)
  useEffect(() => {
    safeSet(LS_LAST_PAGE, page);
  }, [page]);

  useEffect(() => {
    const enc = encodeLoc(readerLoc);
    if (enc) safeSet(LS_LAST_LOC, enc);
    else safeDel(LS_LAST_LOC);
  }, [readerLoc]);

  // Sync URL hash to current state (lightweight “router”)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextHash = formatHash(page, page === "reader" ? readerLoc : null);
    if (window.location.hash === nextHash) return;

    writingUrl.current = true;
    window.history.replaceState(null, "", nextHash);
    window.setTimeout(() => {
      writingUrl.current = false;
    }, 0);
  }, [page, readerLoc]);

  // Respond to user-driven URL changes (back/forward, manual hash edit)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onNav = () => {
      if (writingUrl.current) return;
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
  }, [page]);

  const goHome = useCallback(() => setPage("home"), []);
  const goLearn = useCallback(() => setPage("learn"), []);
  const goReader = useCallback(() => setPage("reader"), []);

  const startReading = useCallback(() => {
    setReaderLoc((prev) => prev ?? { bookId: "GEN", chapter: 1 });
    goReader();
  }, [goReader]);

  const navigateTo = useCallback(
      (loc: ReaderLocation) => {
        const clean = normalizeLoc(loc);
        if (!clean) return;
        setReaderLoc(clean);
        goReader();
      },
      [goReader],
  );

  return (
      <ThemeShell style={styles.page}>
        {/* GLOBAL: same toggle, same position, all pages */}
        <div style={styles.cornerControls} aria-label="App controls">
          <ThemeTogglePill mode={mode} onToggle={toggle} />
        </div>

        {page === "home" ? (
            <Home onLearnMore={goLearn} onStartReading={startReading} onNavigate={navigateTo} />
        ) : page === "learn" ? (
            <LearnMorePage mode={mode} onToggleTheme={toggle} onBack={goHome} styles={styles} />
        ) : (
            <Reader
                styles={styles}
                initialLocation={readerLoc ?? undefined}
                onBackHome={goHome}
                mode={mode}
                onToggleTheme={toggle}
            />
        )}
      </ThemeShell>
  );
}

/* ---------------- Home ---------------- */
function Home(props: {
  onLearnMore: () => void;
  onStartReading: () => void;
  onNavigate: (loc: ReaderLocation) => void;
}) {
  const { onLearnMore, onStartReading, onNavigate } = props;

  const [pressingPrimary, setPressingPrimary] = useState(false);
  const [pressingLearn, setPressingLearn] = useState(false);

  const primaryPressHandlers = useMemo(
      () => ({
        onPointerDown: () => setPressingPrimary(true),
        onPointerUp: () => setPressingPrimary(false),
        onPointerCancel: () => setPressingPrimary(false),
        onPointerLeave: () => setPressingPrimary(false),
      }),
      [],
  );

  const learnPressHandlers = useMemo(
      () => ({
        onPointerDown: () => setPressingLearn(true),
        onPointerUp: () => setPressingLearn(false),
        onPointerCancel: () => setPressingLearn(false),
        onPointerLeave: () => setPressingLearn(false),
      }),
      [],
  );

  return (
      <main style={styles.centerStage} aria-label="Landing">
        <div style={styles.centerBlock}>
          <div style={styles.crossWrap} aria-hidden>
            <img
                src="/cross.png"
                alt=""
                style={styles.crossImg}
                draggable={false}
                decoding="async"
                loading="eager"
            />
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
                // no autoFocus (prevents dropdown popping on load)
            />
          </div>

          <div style={styles.ctaRow}>
            <button
                type="button"
                onClick={onStartReading}
                style={{
                  ...styles.primaryBtnButton,
                  ...(pressingPrimary ? styles.btnPressed : null),
                }}
                aria-label="Start reading"
                {...primaryPressHandlers}
            >
              Start reading
            </button>
          </div>

          <button
              type="button"
              onClick={onLearnMore}
              style={{
                ...styles.learnMoreBtn,
                ...(pressingLearn ? styles.linkPressed : null),
              }}
              {...learnPressHandlers}
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
    maxWidth: 820,
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
    maxWidth: 600,
    marginInline: "auto",
  },

  searchContainer: {
    marginTop: 18,
    marginBottom: 22,
    display: "flex",
    justifyContent: "center",
  },

  /* Consumed by Search */
  searchRow: {
    display: "grid",
    gridTemplateColumns: "24px 1fr",
    alignItems: "center",
    gap: 8,
    padding: "9px 18px",
    borderRadius: 30,
    border: "1px solid var(--hairline)",
    background: "var(--panel)",
    maxWidth: 620, // wider
    width: "100%",
    boxShadow: "0 8px 24px rgba(0,0,0,0.07)",
    transition: "all 180ms cubic-bezier(0.23, 1, 0.32, 1)",
  },

  searchRowFocused: {
    borderColor: "var(--focus)",
    boxShadow: "0 12px 36px rgba(0,0,0,0.12), 0 0 0 3px var(--focusRing)",
    transform: "translateY(-1px)",
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
};