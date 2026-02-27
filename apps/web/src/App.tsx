// apps/web/src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { LearnMorePage } from "./LearnMorePage";
import { Reader } from "./Reader";

type Mode = "light" | "dark";

function useTheme() {
  const [mode, setMode] = useState<Mode>(() => {
    const saved = localStorage.getItem("bp_theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    localStorage.setItem("bp_theme", mode);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", mode === "dark" ? "#0b0b0c" : "#fbfbfc");
  }, [mode]);

  function toggle(): void {
    setMode((m) => (m === "dark" ? "light" : "dark"));
  }

  return { mode, toggle };
}

type Page = "home" | "learn" | "reader";

export default function App() {
  const { mode, toggle } = useTheme();
  const [page, setPage] = useState<Page>("home");

  const themeVars = useMemo(() => getThemeVars(mode), [mode]);

  return (
      <div style={{ ...styles.page, ...themeVars }}>
        {page === "home" ? (
            <Home
                mode={mode}
                onToggleTheme={toggle}
                onLearnMore={() => setPage("learn")}
                onStartReading={() => setPage("reader")}
            />
        ) : page === "learn" ? (
            <LearnMorePage mode={mode} onToggleTheme={toggle} onBack={() => setPage("home")} styles={styles} />
        ) : (
            <Reader styles={styles} onBackHome={() => setPage("home")} />
        )}
      </div>
  );
}

/* ---------------- Home ---------------- */

function Home(props: {
  mode: Mode;
  onToggleTheme: () => void;
  onLearnMore: () => void;
  onStartReading: () => void;
}) {
  const { mode, onToggleTheme, onLearnMore, onStartReading } = props;

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [q, setQ] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [pressingPrimary, setPressingPrimary] = useState(false);
  const [pressingLearn, setPressingLearn] = useState(false);

  // Keep Ctrl+K behavior (hidden affordance)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        if (q) setQ("");
        else inputRef.current?.blur();
      }
      if (e.key === "Enter" && document.activeElement === inputRef.current) {
        // “Enter to read” is a nice quiet UX default (even before search is wired)
        onStartReading();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [q, onStartReading]);

  const crossSrc = "/cross.png";
  const hasQuery = q.trim().length > 0;

  const primaryStyle: React.CSSProperties = {
    ...styles.primaryBtnButton,
    ...(pressingPrimary ? styles.btnPressed : null),
  };

  const learnStyle: React.CSSProperties = {
    ...styles.learnMoreBtn,
    ...(pressingLearn ? styles.linkPressed : null),
  };

  return (
      <main style={styles.centerStage} aria-label="Landing">
        <div style={styles.cornerControls} aria-label="Landing controls">
          <ThemeToggle mode={mode} onToggle={onToggleTheme} />
        </div>

        <div className="container" style={styles.centerInner}>
          <div style={styles.centerBlock}>
            <div style={styles.crossWrap} aria-hidden>
              <img src={crossSrc} alt="" style={styles.crossImg} draggable={false} decoding="async" loading="eager" />
            </div>

            <h1 style={styles.h1}>Biblia Populi</h1>
            <div style={styles.latin}>“The Bible of the People”</div>

            <p style={styles.lede}>
              A public, open-access Scripture platform centered on <strong>Jesus Christ</strong>, crucified and risen.
            </p>

            <SearchBar
                q={q}
                setQ={setQ}
                inputRef={inputRef}
                focused={isFocused}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
            />

            {!hasQuery && !isFocused && <div style={styles.microHint}>Type a word or reference.</div>}

            <div style={styles.ctaRow}>
              <button
                  type="button"
                  onClick={onStartReading}
                  style={primaryStyle}
                  aria-label="Start reading"
                  onMouseDown={() => setPressingPrimary(true)}
                  onMouseUp={() => setPressingPrimary(false)}
                  onMouseLeave={() => setPressingPrimary(false)}
                  onTouchStart={() => setPressingPrimary(true)}
                  onTouchEnd={() => setPressingPrimary(false)}
              >
                Start reading
              </button>
            </div>

            <button
                type="button"
                onClick={onLearnMore}
                style={learnStyle}
                onMouseDown={() => setPressingLearn(true)}
                onMouseUp={() => setPressingLearn(false)}
                onMouseLeave={() => setPressingLearn(false)}
                onTouchStart={() => setPressingLearn(true)}
                onTouchEnd={() => setPressingLearn(false)}
            >
              Learn more
            </button>
          </div>
        </div>
      </main>
  );
}

function SearchBar(props: {
  q: string;
  setQ: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const { q, setQ, inputRef, focused, onFocus, onBlur } = props;

  return (
      <div style={{ ...styles.searchRow, ...(focused ? styles.searchRowFocused : null) }} aria-label="Search">
      <span style={styles.searchIcon} aria-hidden>
        ⌕
      </span>

        <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            style={styles.searchInput}
            aria-label="Search scripture"
            spellCheck={false}
            inputMode="search"
            onFocus={onFocus}
            onBlur={onBlur}
        />
      </div>
  );
}

function ThemeToggle(props: { mode: Mode; onToggle: () => void }) {
  const { mode, onToggle } = props;

  return (
      <button
          type="button"
          onClick={onToggle}
          style={styles.themePill}
          aria-label={mode === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          title={mode === "dark" ? "Light" : "Dark"}
      >
        <span style={{ ...styles.themeDot, transform: mode === "dark" ? "translateX(16px)" : "translateX(0px)" }} />
      </button>
  );
}

/* ---------------- Theme Vars ---------------- */

function getThemeVars(mode: Mode): React.CSSProperties {
  if (mode === "dark") {
    return {
      ["--bg" as any]: "#0b0b0c",
      ["--panel" as any]: "rgba(255,255,255,0.045)",
      ["--fg" as any]: "#f4f3f1",
      ["--muted" as any]: "rgba(244,243,241,0.62)",
      ["--hairline" as any]: "rgba(255,255,255,0.10)",
      ["--shadow" as any]: "0 18px 60px rgba(0,0,0,0.45)",
      ["--shadowSoft" as any]: "0 10px 34px rgba(0,0,0,0.34)",
      ["--focus" as any]: "rgba(255,255,255,0.22)",
      ["--focusRing" as any]: "rgba(255,255,255,0.12)",
    };
  }
  return {
    ["--bg" as any]: "#fbfbfc",
    ["--panel" as any]: "rgba(0,0,0,0.028)",
    ["--fg" as any]: "#0b0b0c",
    ["--muted" as any]: "rgba(11,11,12,0.56)",
    ["--hairline" as any]: "rgba(0,0,0,0.10)",
    ["--shadow" as any]: "0 18px 60px rgba(0,0,0,0.12)",
    ["--shadowSoft" as any]: "0 10px 34px rgba(0,0,0,0.10)",
    ["--focus" as any]: "rgba(0,0,0,0.16)",
    ["--focusRing" as any]: "rgba(0,0,0,0.10)",
  };
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

  centerStage: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "72px 0",
    position: "relative",
  },
  centerInner: { width: "100%" },
  centerBlock: {
    maxWidth: 820,
    marginInline: "auto",
    textAlign: "center",
    paddingInline: 18,
  },

  cornerControls: {
    position: "fixed",
    top: 16,
    right: 16,
    display: "flex",
    alignItems: "center",
    gap: 8,
    zIndex: 5,
  },

  themePill: {
    width: 36,
    height: 20,
    borderRadius: 999,
    border: "1px solid var(--hairline)",
    background: "var(--panel)",
    cursor: "pointer",
    padding: 2,
    display: "inline-flex",
    alignItems: "center",
    boxShadow: "none",
    transition: "transform 140ms ease, opacity 140ms ease",
  },
  themeDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    background: "var(--fg)",
    transition: "transform 160ms ease",
  },

  crossWrap: {
    display: "grid",
    placeItems: "center",
    marginBottom: 0,
    opacity: 0.965,
  },
  crossImg: {
    marginRight: 10,
    width: 112,
    height: 112,
    objectFit: "contain",
    userSelect: "none",
    filter: "drop-shadow(0 14px 26px rgba(0,0,0,0.14))",
  },

  h1: {
    marginTop: 2,
    marginLeft: 0,
    fontSize: 52,
    lineHeight: 1.075,
    letterSpacing: "-0.02em",
    marginBottom: 0,
  },

  latin: {
    marginTop: 12,
    fontSize: 11.5,
    letterSpacing: "0.33em",
    textTransform: "uppercase",
    color: "var(--muted)",
    lineHeight: 1.75,
  },

  lede: {
    marginTop: 10,
    fontSize: 12.5,
    letterSpacing: "0.08em",
    lineHeight: 2.05,
    color: "var(--muted)",
    maxWidth: 600,
    marginInline: "auto",
  },

  searchRow: {
    marginTop: 16,
    display: "grid",
    gridTemplateColumns: "24px 1fr",
    alignItems: "center",
    gap: 6,
    padding: "8px 10px",
    borderRadius: 30,
    border: "1px solid var(--hairline)",
    background: "var(--panel)",
    maxWidth: 550,
    marginInline: "auto",
    boxShadow: "var(--shadowSoft)",
    transition: "box-shadow 160ms ease, border-color 160ms ease, transform 160ms ease, opacity 160ms ease",
  },
  searchRowFocused: {
    borderColor: "var(--focus)",
    boxShadow: "var(--shadowSoft)",
    outline: "1px solid var(--focusRing)",
    transform: "translateY(-1px)",
  },
  searchIcon: { width: 24, textAlign: "center", color: "var(--muted)", fontSize: 14 },
  searchInput: {
    width: "98%",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "inherit",
    fontSize: 13,
    padding: "8px 0",
  },

  microHint: {
    marginTop: 8,
    fontSize: 10,
    letterSpacing: "0.12em",
    color: "var(--muted)",
    opacity: 0.85,
    userSelect: "none",
  },

  ctaRow: {
    marginTop: 18,
    display: "flex",
    justifyContent: "center",
    gap: 10,
    flexWrap: "wrap",
  },

  primaryBtnButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "11px 16px",
    borderRadius: 14,
    background: "var(--fg)",
    color: "var(--bg)",
    fontSize: 13,
    fontWeight: 760,
    letterSpacing: "-0.01em",
    boxShadow: "var(--shadowSoft)",
    border: "none",
    cursor: "pointer",
    transition: "transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease",
  },

  // pressed states (subtle interaction)
  btnPressed: {
    transform: "translateY(1px) scale(0.99)",
    opacity: 0.95,
  },
  linkPressed: {
    opacity: 0.72,
  },

  learnMoreBtn: {
    marginTop: 16,
    fontSize: 12,
    color: "var(--muted)",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    padding: "8px 10px",
    borderRadius: 10,
    letterSpacing: "0.10em",
    textTransform: "uppercase",
    transition: "opacity 140ms ease",
    opacity: 0.92,
  },

  /* ---- Learn page styles ---- */
  learnPage: {
    paddingTop: 24,
    paddingBottom: 88,
    maxWidth: 900,
    paddingInline: 18,
  },
  learnTopRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    paddingTop: 8,
  },
  backBtn: {
    fontSize: 12,
    padding: "6px 8px",
    borderRadius: 10,
    border: "1px solid var(--hairline)",
    background: "var(--panel)",
    cursor: "pointer",
    color: "inherit",
    lineHeight: 1,
  },
  footerMuted: {
    fontSize: 12,
    color: "var(--muted)",
  },
};