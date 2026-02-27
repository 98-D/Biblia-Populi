import React, { useEffect, useMemo, useRef, useState } from "react";

type Mode = "light" | "dark";

/**
 * Two-theme-only (Light <-> Dark).
 * - Persists localStorage["bp_theme"]
 * - Applies html[data-theme="light"|"dark"]
 * - Also sets meta theme-color for nicer mobile/OS chrome
 */
function useTheme() {
  const [mode, setMode] = useState<Mode>(() => {
    const saved = localStorage.getItem("bp_theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    localStorage.setItem("bp_theme", mode);

    // nice on mobile / PWA chrome
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", mode === "dark" ? "#0b0b0c" : "#fbfbfc");
  }, [mode]);

  function toggle(): void {
    setMode((m) => (m === "dark" ? "light" : "dark"));
  }

  return { mode, toggle };
}

type Page = "home" | "learn";

export default function App() {
  const { mode, toggle } = useTheme();
  const [page, setPage] = useState<Page>("home");

  // set CSS vars in one place (minimalism: no extra files needed yet)
  const themeVars = useMemo(() => getThemeVars(mode), [mode]);

  return (
      <div style={{ ...styles.page, ...themeVars }}>
        {page === "home" ? (
            <Home mode={mode} onToggleTheme={toggle} onLearnMore={() => setPage("learn")} />
        ) : (
            <LearnMore mode={mode} onToggleTheme={toggle} onBack={() => setPage("home")} />
        )}
      </div>
  );
}

/* ---------------- Home (no header, centered) ---------------- */

function Home(props: { mode: Mode; onToggleTheme: () => void; onLearnMore: () => void }) {
  const { mode, onToggleTheme, onLearnMore } = props;

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [q, setQ] = useState("");

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
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [q]);

  const crossSrc = "/cross.png";

  return (
      <main style={styles.centerStage} aria-label="Landing">
        {/* Minimal corner controls (no header bar) */}
        <div style={styles.cornerControls} aria-label="Landing controls">
          <button type="button" onClick={onLearnMore} style={styles.cornerLink}>
            Learn more
          </button>

          <ThemeToggle mode={mode} onToggle={onToggleTheme} />
        </div>

        <div className="container" style={styles.centerInner}>
          <div style={styles.centerBlock}>
            <div style={styles.crossWrap} aria-hidden>
              <img
                  src={crossSrc}
                  alt=""
                  style={styles.crossImg}
                  draggable={false}
                  decoding="async"
                  loading="eager"
              />
            </div>

            <h1 style={styles.h1}>Biblia Populi</h1>

            <div style={styles.latin}>“The Bible of the People”</div>

            <p style={styles.lede}>
              A public, open-access Scripture platform centered on <strong>Jesus Christ</strong>, crucified and risen —
              designed for quiet reading, fast lookup, and sharing without barrier.
            </p>

            <SearchBar q={q} setQ={setQ} inputRef={inputRef} />

            <div style={styles.ctaRow}>
              <a href="#" style={styles.primaryBtn}>
                Start reading
              </a>
              <a href="#" style={styles.ghostBtn}>
                Open a book
              </a>
            </div>

            <div style={styles.tagline}>Ancient in name. Modern in form. Open to all.</div>
          </div>
        </div>
      </main>
  );
}

function SearchBar(props: {
  q: string;
  setQ: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { q, setQ, inputRef } = props;

  return (
      <div style={styles.searchRow} aria-label="Search">
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
        />

        <kbd style={styles.kbd} aria-hidden>
          Ctrl&nbsp;K
        </kbd>
      </div>
  );
}

function ThemeToggle(props: { mode: Mode; onToggle: () => void }) {
  const { mode, onToggle } = props;

  // Minimal “pill” toggle (smaller, calmer than a label button)
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

/* ---------------- Learn More (simple page) ---------------- */

function LearnMore(props: { mode: Mode; onToggleTheme: () => void; onBack: () => void }) {
  const { mode, onToggleTheme, onBack } = props;

  return (
      <main className="container" style={styles.learnPage} aria-label="Learn more">
        <div style={styles.learnTopRow}>
          <button type="button" onClick={onBack} style={styles.backBtn}>
            ← Back
          </button>

          <div style={{ flex: 1 }} />

          <ThemeToggle mode={mode} onToggle={onToggleTheme} />
        </div>

        <div style={styles.learnTop}>
          <h1 style={styles.learnTitle}>Learn more</h1>
          <p style={styles.learnLede}>
            Biblia Populi is built to be quiet, clear, and uncompromisingly reading-first — Scripture without noise or
            gatekeeping.
          </p>
        </div>

        <div style={styles.learnSection}>
          <h2 style={styles.h2}>About</h2>
          <p style={styles.body}>
            <strong>Biblia Populi</strong> is a one-man project. Not sponsored by an institution or publisher — built as a
            personal labor of faith to make Scripture freely accessible and faithful to the text.
          </p>
        </div>

        <div style={styles.learnSection}>
          <h2 style={styles.h2}>Statement</h2>
          <p style={styles.body}>
            Biblia Populi exists to proclaim and preserve the Holy Scriptures as the true and living Word of God —
            fulfilled in <strong>Jesus Christ</strong>, crucified and risen.
          </p>
        </div>

        <footer style={styles.footer}>
          <div style={styles.footerMuted}>© {new Date().getFullYear()} Biblia Populi</div>
        </footer>
      </main>
  );
}

/* ---------------- Theme Vars (minimal, museum-like) ---------------- */

function getThemeVars(mode: Mode): React.CSSProperties {
  if (mode === "dark") {
    return {
      // charcoal + warm paper highlight
      ["--bg" as any]: "#0b0b0c",
      ["--panel" as any]: "rgba(255,255,255,0.04)",
      ["--fg" as any]: "#f3f3f2",
      ["--muted" as any]: "rgba(243,243,242,0.62)",
      ["--hairline" as any]: "rgba(255,255,255,0.10)",
      ["--shadow" as any]: "0 18px 60px rgba(0,0,0,0.45)",
      ["--focus" as any]: "rgba(255,255,255,0.20)",
    };
  }
  return {
    ["--bg" as any]: "#fbfbfc",
    ["--panel" as any]: "rgba(0,0,0,0.03)",
    ["--fg" as any]: "#0b0b0c",
    ["--muted" as any]: "rgba(11,11,12,0.58)",
    ["--hairline" as any]: "rgba(0,0,0,0.10)",
    ["--shadow" as any]: "0 18px 60px rgba(0,0,0,0.12)",
    ["--focus" as any]: "rgba(0,0,0,0.16)",
  };
}

/* ---------------- Styles ---------------- */

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--bg)",
    color: "var(--fg)",
    // nicer text rendering
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale",
  },

  /* Landing */
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

  /* Corner controls */
  cornerControls: {
    position: "fixed",
    top: 16,
    right: 16,
    display: "flex",
    alignItems: "center",
    gap: 8,
    zIndex: 5,
  },
  cornerLink: {
    fontSize: 12,
    color: "var(--muted)",
    border: "1px solid transparent",
    background: "transparent",
    cursor: "pointer",
    padding: "6px 8px",
    borderRadius: 10,
    lineHeight: 1,
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
    marginBottom: 10,
    opacity: 0.96,
  },
  crossImg: {
    width: 110,
    height: 110,
    objectFit: "contain",
    userSelect: "none",
    filter: "drop-shadow(0 14px 26px rgba(0,0,0,0.16))",
  },

  h1: {
    marginTop: 2,
    fontSize: 64,
    lineHeight: 1.02,
    letterSpacing: "-0.06em",
    marginBottom: 0,
  },

  latin: {
    marginTop: 12,
    fontSize: 11,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    color: "var(--muted)",
  },

  lede: {
    marginTop: 20,
    fontSize: 15,
    lineHeight: 1.95,
    color: "var(--muted)",
    maxWidth: 720,
    marginInline: "auto",
  },

  // Smaller, tighter search bar (more minimal)
  searchRow: {
    marginTop: 38,
    display: "grid",
    gridTemplateColumns: "24px 1fr auto",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid var(--hairline)",
    background: "var(--panel)",
    maxWidth: 640,
    marginInline: "auto",
    boxShadow: "var(--shadow)",
  },
  searchIcon: { width: 24, textAlign: "center", color: "var(--muted)", fontSize: 12 },
  searchInput: {
    width: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "inherit",
    fontSize: 13,
    padding: "8px 0",
  },
  kbd: {
    fontSize: 11,
    color: "var(--muted)",
    border: "1px solid var(--hairline)",
    padding: "5px 8px",
    borderRadius: 999,
    userSelect: "none",
    background: "transparent",
  },

  ctaRow: {
    marginTop: 22,
    display: "flex",
    justifyContent: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  primaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "11px 14px",
    borderRadius: 14,
    background: "var(--fg)",
    color: "var(--bg)",
    fontSize: 13,
    fontWeight: 750,
    textDecoration: "none",
    letterSpacing: "-0.01em",
  },
  ghostBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "11px 14px",
    borderRadius: 14,
    border: "1px solid var(--hairline)",
    color: "inherit",
    fontSize: 13,
    fontWeight: 750,
    textDecoration: "none",
    background: "transparent",
  },
  tagline: {
    marginTop: 22,
    fontSize: 12,
    color: "var(--muted)",
  },

  /* Learn more */
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

  learnTop: { marginTop: 28, maxWidth: 760 },
  learnTitle: { fontSize: 44, lineHeight: 1.05, letterSpacing: "-0.05em", margin: 0 },
  learnLede: {
    marginTop: 14,
    fontSize: 15,
    lineHeight: 1.95,
    color: "var(--muted)",
  },

  learnSection: { marginTop: 56, maxWidth: 760 },
  h2: { fontSize: 16, fontWeight: 750, letterSpacing: "-0.02em", margin: 0 },
  body: { marginTop: 10, fontSize: 14, lineHeight: 1.95, color: "var(--muted)" },

  footer: { marginTop: 84 },
  footerMuted: { fontSize: 12, color: "var(--muted)" },
};