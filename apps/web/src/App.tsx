
import { useEffect, useMemo, useState } from "react";

type Mode = "light" | "dark";

function useTheme() {
  const [mode, setMode] = useState<Mode>(() => {
    const saved = localStorage.getItem("bp_theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    localStorage.setItem("bp_theme", mode);
  }, [mode]);

  return { mode, setMode };
}

export default function App() {
  const { mode, setMode } = useTheme();

  return (
    <div style={styles.page}>
      <Header mode={mode} setMode={setMode} />
      <main>
        <Hero />
        <Hairline />
        <About />
        <Hairline />
        <Statement />
        <Footer />
      </main>
    </div>
  );
}

function Header(props: { mode: Mode; setMode: (m: Mode) => void }) {
  const { mode, setMode } = props;

  return (
    <header style={styles.header}>
      <div className="container" style={styles.headerInner}>
        <a href="#" style={styles.brand} aria-label="Biblia Populi">
          <div style={styles.mark} aria-hidden>
            B
          </div>
          <div style={{ lineHeight: 1.05 }}>
            <div style={styles.brandTitle}>Biblia Populi</div>
            <div style={styles.brandSub}>The Word of God, open to all.</div>
          </div>
        </a>

        <nav style={styles.nav} aria-label="Primary">
          <a href="#about" style={styles.link}>
            About
          </a>
          <a href="#statement" style={styles.link}>
            Statement
          </a>
          <button
            type="button"
            onClick={() => setMode(mode === "dark" ? "light" : "dark")}
            style={styles.themeBtn}
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {mode === "dark" ? "Light" : "Dark"}
          </button>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="container" style={styles.sectionTop}>
      <div style={styles.heroGrid}>
        <div>
          <div className="kicker">Latin for “The Bible of the People.”</div>

          <h1 style={styles.h1}>
            Biblia Populi
            <span style={styles.h1Sub}>The Word of God, open to all.</span>
          </h1>

          <p style={styles.lede}>
            A public, open-access Scripture platform centered on <strong>Jesus Christ</strong>, crucified and risen —
            built to be clear, faithful to the text, and available without barrier.
          </p>

          <div style={styles.ctaRow}>
            <a href="#start" style={styles.primaryBtn}>
              Start Reading
            </a>
            <a href="#about" style={styles.ghostBtn}>
              Learn More
            </a>
          </div>

          <div style={styles.tagline}>Ancient in name. Modern in form. Open to all.</div>
        </div>

        <aside style={styles.aside}>
          <div style={styles.asideTitle}>Purpose</div>
          <div style={styles.asideBody}>
            Readable, searchable, shareable Scripture — without noise, without gatekeeping.
          </div>

          <div style={styles.asideList}>
            <Bullet>Reading-first layout and calm typography.</Bullet>
            <Bullet>Fast navigation and verse linking (planned).</Bullet>
            <Bullet>Built so anyone can encounter the truth of Christ.</Bullet>
          </div>
        </aside>
      </div>
    </section>
  );
}

function About() {
  return (
    <section id="about" className="container" style={styles.section}>
      <h2 style={styles.h2}>About</h2>

      <p style={styles.body}>
        <strong>Biblia Populi</strong> is a one-man project — built and maintained by me. It is not sponsored by an
        institution, denomination, or publishing house. It is a personal labor of faith: to make Scripture freely
        accessible, clearly presented, and faithful to the text.
      </p>

      <div style={styles.trio}>
        <div style={styles.trioItem}>
          <div style={styles.trioTitle}>Public</div>
          <div style={styles.trioBody}>No locked content. No gatekeepers. Open by design.</div>
        </div>
        <div style={styles.trioItem}>
          <div style={styles.trioTitle}>Clear</div>
          <div style={styles.trioBody}>Simple UI that stays out of the way.</div>
        </div>
        <div style={styles.trioItem}>
          <div style={styles.trioTitle}>Christ-centered</div>
          <div style={styles.trioBody}>The Bible testifies to Jesus Christ, crucified and risen.</div>
        </div>
      </div>

      <div id="start" style={{ height: 1 }} />
    </section>
  );
}

function Statement() {
  return (
    <section id="statement" className="container" style={styles.section}>
      <h2 style={styles.h2}>Statement</h2>

      <div style={styles.statement}>
        <p style={styles.body}>
          Biblia Populi exists to proclaim and preserve the Holy Scriptures as the true and living Word of God —
          fulfilled in <strong>Jesus Christ</strong>, crucified and risen.
        </p>

        <p style={{ ...styles.body, marginTop: 10 }}>
          I believe the Bible testifies to Christ, reveals the gospel of His death and resurrection, and speaks with
          authority to every generation.
        </p>

        <p style={{ ...styles.body, marginTop: 10 }}>
          This platform is built on the conviction that God’s Word does not belong to institutions, publishers, or
          gatekeepers — but is given for the world. Designed for reading, searching, studying, and sharing the
          Scriptures without barrier — so that all may encounter the truth of Jesus Christ.
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="container" style={styles.footer}>
      <div style={styles.footerRow}>
        <div style={styles.footerMuted}>© {new Date().getFullYear()} Biblia Populi</div>
        <div style={styles.footerMuted}>Ancient in name. Modern in form. Open to all.</div>
      </div>
    </footer>
  );
}

function Hairline() {
  return (
    <div className="container" aria-hidden style={{ paddingTop: 18, paddingBottom: 18 }}>
      <div className="hairline" />
    </div>
  );
}

function Bullet(props: { children: React.ReactNode }) {
  return (
    <div style={styles.bulletRow}>
      <span style={styles.bulletDot} aria-hidden />
      <div>{props.children}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--bg)",
    color: "var(--fg)",
  },

  header: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    background: "color-mix(in oklab, var(--bg) 92%, transparent)",
    backdropFilter: "blur(10px)",
  },
  headerInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 0",
  },

  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    textDecoration: "none",
  },
  mark: {
    width: 36,
    height: 36,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    border: "1px solid var(--hairline)",
  },
  brandTitle: {
    fontSize: 14,
    fontWeight: 650,
    letterSpacing: "0.02em",
  },
  brandSub: {
    fontSize: 12,
    color: "var(--muted)",
    marginTop: 2,
  },

  nav: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  link: {
    fontSize: 13,
    color: "var(--muted)",
    padding: "8px 10px",
    borderRadius: 10,
    textDecoration: "none",
  },
  themeBtn: {
    fontSize: 13,
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid var(--hairline)",
    background: "transparent",
  },

  sectionTop: { paddingTop: 56, paddingBottom: 10 },
  section: { paddingTop: 46, paddingBottom: 10 },

  heroGrid: {
    display: "grid",
    gap: 24,
    gridTemplateColumns: "1.25fr 0.75fr",
    alignItems: "start",
  },

  h1: {
    marginTop: 12,
    fontSize: 52,
    lineHeight: 1.02,
    letterSpacing: "-0.035em",
  },
  h1Sub: {
    display: "block",
    marginTop: 10,
    fontSize: 20,
    color: "var(--muted)",
    fontWeight: 500,
    letterSpacing: "-0.01em",
  },

  lede: {
    marginTop: 18,
    maxWidth: 680,
    color: "var(--muted)",
    fontSize: 16,
    lineHeight: 1.75,
  },

  ctaRow: {
    display: "flex",
    gap: 10,
    marginTop: 18,
    flexWrap: "wrap",
  },
  primaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "11px 15px",
    borderRadius: 14,
    background: "var(--fg)",
    color: "var(--bg)",
    fontSize: 13,
    fontWeight: 700,
    textDecoration: "none",
  },
  ghostBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "11px 15px",
    borderRadius: 14,
    border: "1px solid var(--hairline)",
    color: "var(--fg)",
    fontSize: 13,
    fontWeight: 700,
    textDecoration: "none",
    background: "transparent",
  },
  tagline: {
    marginTop: 12,
    fontSize: 12,
    color: "var(--muted)",
  },

  aside: {
    border: "1px solid var(--hairline)",
    borderRadius: 16,
    padding: 16,
  },
  asideTitle: {
    fontSize: 12,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--muted)",
  },
  asideBody: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 1.7,
    color: "var(--muted)",
  },
  asideList: {
    marginTop: 12,
    display: "grid",
    gap: 10,
    fontSize: 13,
    lineHeight: 1.65,
    color: "var(--muted)",
  },

  bulletRow: {
    display: "grid",
    gridTemplateColumns: "10px 1fr",
    gap: 10,
    alignItems: "start",
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    background: "color-mix(in oklab, var(--fg) 38%, transparent)",
    marginTop: 7,
  },

  h2: {
    fontSize: 18,
    fontWeight: 650,
    letterSpacing: "-0.02em",
  },
  body: {
    marginTop: 12,
    color: "var(--muted)",
    fontSize: 14,
    lineHeight: 1.75,
  },

  trio: {
    marginTop: 16,
    display: "grid",
    gap: 12,
    gridTemplateColumns: "repeat(3, 1fr)",
  },
  trioItem: {
    border: "1px solid var(--hairline)",
    borderRadius: 16,
    padding: 14,
  },
  trioTitle: {
    fontSize: 13,
    fontWeight: 650,
    letterSpacing: "-0.01em",
  },
  trioBody: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 1.6,
    color: "var(--muted)",
  },

  statement: {
    marginTop: 12,
    border: "1px solid var(--hairline)",
    borderRadius: 16,
    padding: 16,
  },

  footer: { paddingTop: 40, paddingBottom: 34 },
  footerRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  footerMuted: { fontSize: 12, color: "var(--muted)" },
};

/* Responsive tweaks (non-clunky) */
function useResponsiveTweaks() {
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => {
      styles.heroGrid.gridTemplateColumns = mq.matches ? "1fr" : "1.25fr 0.75fr";
      styles.h1.fontSize = mq.matches ? 42 : 52;
      styles.trio.gridTemplateColumns = mq.matches ? "1fr" : "repeat(3, 1fr)";
    };
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);
}
useResponsiveTweaks();

