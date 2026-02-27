import React, { useEffect, useRef, useState } from "react";

type Mode = "light" | "dark";

/**
 * Two-theme-only (Light <-> Dark).
 * - Persists localStorage["bp_theme"]
 * - Applies html[data-theme="light"|"dark"]
 */
function useTheme() {
  const [mode, setMode] = useState<Mode>(() => {
    const saved = localStorage.getItem("bp_theme");
    return saved === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    localStorage.setItem("bp_theme", mode);
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

  return (
      <div style={styles.page}>
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

  // ✅ Use PNG from /public (recommended). Put file at: public/cross.png
  const crossSrc = "/cross.png";

  // If your PNG is BLACK and you want it to appear WHITE in dark mode:
  //const crossFilter =
     // mode === "dark"
    //      ? "invert(1) drop-shadow(0 10px 24px rgba(0,0,0,0.18))"
  //        : "drop-shadow(0 10px 24px rgba(0,0,0,0.18))";
//
  return (
      <main style={styles.centerStage} aria-label="Landing">
        {/* Minimal corner controls (not a header bar) */}
        <div style={styles.cornerControls} aria-label="Landing controls">
          <button type="button" onClick={onLearnMore} style={styles.cornerLink}>
            Learn more
          </button>
          <button type="button" onClick={onToggleTheme} style={styles.cornerBtn} aria-label="Toggle theme">
            {mode === "dark" ? "Light" : "Dark"}
          </button>
        </div>

        <div className="container" style={styles.centerInner}>
          <div style={styles.centerBlock}>
            <div style={styles.crossWrap} aria-hidden>
              <img
                  src={crossSrc}
                  alt=""
                  style={{ ...styles.crossImg}}
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
              />

              <span style={styles.searchHint} aria-hidden>
              Ctrl K
            </span>
            </div>

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

/* ---------------- Learn More (simple page) ---------------- */

function LearnMore(props: { mode: Mode; onToggleTheme: () => void; onBack: () => void }) {
  const { onToggleTheme, onBack } = props;

  return (
      <main className="container" style={styles.learnPage} aria-label="Learn more">
        <div style={styles.learnTopRow}>
          <button type="button" onClick={onBack} style={styles.backBtn}>
            ← Back
          </button>

          <div style={{ flex: 1 }} />

          <button type="button" onClick={onToggleTheme} style={styles.cornerBtn} aria-label="Toggle theme">
            Toggle
          </button>
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

/* ---------------- Styles ---------------- */

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--bg, #ffffff)",
    color: "var(--fg, #0b0b0b)",
  },

  /* Landing: centered, calm, “museum” whitespace */
  centerStage: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "76px 0",
    position: "relative",
  },
  centerInner: { width: "100%" },
  centerBlock: {
    maxWidth: 820,
    marginInline: "auto",
    textAlign: "center",
  },

  /* Minimal corner controls (not a bar) */
  cornerControls: {
    position: "fixed",
    top: 18,
    right: 18,
    display: "flex",
    alignItems: "center",
    gap: 10,
    zIndex: 5,
  },
  cornerLink: {
    fontSize: 13,
    color: "var(--muted, rgba(11,11,11,0.60))",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    padding: "8px 10px",
    borderRadius: 10,
  },
  cornerBtn: {
    fontSize: 13,
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid var(--hairline, rgba(0,0,0,0.10))",
    background: "transparent",
    cursor: "pointer",
    color: "inherit",
  },

  crossWrap: {
    display: "grid",
    placeItems: "center",
    marginBottom: 8,
    opacity: 0.95,
  },
  crossImg: {
    width: 126,
    height: 126,
    objectFit: "contain",
    userSelect: "none",
  },

  h1: {
    marginTop: 0.5,
    fontSize: 70,
    lineHeight: 1.01,
    letterSpacing: "-0.06em",
  },

  latin: {
    marginTop: 14,
    fontSize: 12,
    letterSpacing: "0.20em",
    textTransform: "uppercase",
    color: "var(--muted, rgba(11,11,11,0.60))",
  },

  lede: {
    marginTop: 22,
    fontSize: 16,
    lineHeight: 2.0,
    color: "var(--muted, rgba(11,11,11,0.60))",
    maxWidth: 740,
    marginInline: "auto",
  },

  searchRow: {
    marginTop: 46,
    display: "grid",
    gridTemplateColumns: "28px 1fr auto",
    alignItems: "center",
    gap: 10,
    padding: "16px 16px",
    borderRadius: 18,
    border: "1px solid var(--hairline, rgba(0,0,0,0.10))",
    background: "transparent",
    maxWidth: 760,
    marginInline: "auto",
  },
  searchIcon: { width: 28, textAlign: "center", color: "var(--muted, rgba(11,11,11,0.60))" },
  searchInput: {
    width: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "inherit",
    fontSize: 14,
    padding: "10px 0",
  },
  searchHint: {
    fontSize: 12,
    color: "var(--muted, rgba(11,11,11,0.60))",
    border: "1px solid var(--hairline, rgba(0,0,0,0.10))",
    padding: "6px 10px",
    borderRadius: 999,
    userSelect: "none",
  },

  ctaRow: {
    marginTop: 30,
    display: "flex",
    justifyContent: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  primaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "12px 15px",
    borderRadius: 14,
    background: "var(--fg, #0b0b0b)",
    color: "var(--bg, #ffffff)",
    fontSize: 13,
    fontWeight: 760,
    textDecoration: "none",
  },
  ghostBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "12px 15px",
    borderRadius: 14,
    border: "1px solid var(--hairline, rgba(0,0,0,0.10))",
    color: "inherit",
    fontSize: 13,
    fontWeight: 760,
    textDecoration: "none",
    background: "transparent",
  },
  tagline: {
    marginTop: 26,
    fontSize: 12,
    color: "var(--muted, rgba(11,11,11,0.60))",
  },

  /* Learn more page */
  learnPage: {
    paddingTop: 28,
    paddingBottom: 96,
    maxWidth: 900,
  },
  learnTopRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    paddingTop: 10,
  },
  backBtn: {
    fontSize: 13,
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid var(--hairline, rgba(0,0,0,0.10))",
    background: "transparent",
    cursor: "pointer",
    color: "inherit",
  },

  learnTop: { marginTop: 34, maxWidth: 760 },
  learnTitle: { fontSize: 46, lineHeight: 1.05, letterSpacing: "-0.045em", margin: 0 },
  learnLede: {
    marginTop: 14,
    fontSize: 16,
    lineHeight: 1.95,
    color: "var(--muted, rgba(11,11,11,0.60))",
  },

  learnSection: { marginTop: 64, maxWidth: 760 },
  h2: { fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 },
  body: { marginTop: 12, fontSize: 14, lineHeight: 1.95, color: "var(--muted, rgba(11,11,11,0.60))" },

  footer: { marginTop: 96 },
  footerMuted: { fontSize: 12, color: "var(--muted, rgba(11,11,11,0.60))" },
};