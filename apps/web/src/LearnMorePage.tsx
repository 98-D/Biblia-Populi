import React, { useEffect, useMemo, useState } from "react";

type Mode = "light" | "dark";
type Styles = Record<string, React.CSSProperties>;

type Props = {
    mode: Mode;
    onToggleTheme: () => void;
    onBack: () => void;
    /** Pass the same styles object from App so this page matches exactly. */
    styles: Styles;
};

/**
 * Learn More — refined, minimalist, humble
 * - single calm column, centered
 * - no panels, faint hairlines only
 * - precise typography, generous quiet space
 * - optional side rail only on wide screens
 * - keeps your tokens: --bg, --panel, --fg, --muted, --hairline, --shadowSoft
 */
export function LearnMorePage(props: Props) {
    const { mode, onToggleTheme, onBack, styles } = props;

    const [isNarrow, setIsNarrow] = useState<boolean>(
        () => typeof window === "undefined" ? true : window.matchMedia("(max-width: 900px)").matches,
    );

    useEffect(() => {
        const mq = window.matchMedia("(max-width: 900px)");
        const onChange = () => setIsNarrow(mq.matches);
        mq.addEventListener?.("change", onChange);
        return () => mq.removeEventListener?.("change", onChange);
    }, []);

    const layout = useMemo(() => {
        return {
            railW: isNarrow ? 0 : 160,
            gap: isNarrow ? 0 : 32,
            contentMax: isNarrow ? 660 : 620,
        };
    }, [isNarrow]);

    return (
        <main aria-label="Learn more" style={sx.page}>
            <div className="container" style={sx.container}>
                {/* Top bar */}
                <div style={sx.topBar}>
                    <button
                        type="button"
                        onClick={onBack}
                        style={{ ...styles.backBtn, ...sx.backBtnTweak }}
                    >
                        ← Back
                    </button>
                    <div style={{ flex: 1 }} />
                    <ThemeToggle mode={mode} onToggle={onToggleTheme} styles={styles} />
                </div>

                <div style={{ ...sx.grid, gap: layout.gap }}>
                    {!isNarrow ? (
                        <aside style={{ width: layout.railW }}>
                            <div style={sx.rail}>
                                <div style={sx.railKicker}>Biblia Populi</div>
                                <div style={sx.railLine} />
                                <RailItem label="Reading first" />
                                <RailItem label="Open access" />
                                <RailItem label="Quiet by design" />
                                <div style={sx.railFoot}>No commentary • No noise</div>
                            </div>
                        </aside>
                    ) : null}

                    <section
                        style={{
                            maxWidth: layout.contentMax,
                            width: "100%",
                            marginInline: "auto",
                        }}
                    >
                        {/* Hero header */}
                        <div style={sx.hero}>
                            <div style={sx.kicker}>Learn more</div>
                            <h1 style={sx.h1}>Quiet reading, modern form.</h1>
                            <p style={sx.lede}>
                                Biblia Populi is a humble effort to keep Scripture at the center.
                                Visuals and aids—people, places, maps, timelines—remain secondary:
                                present only when needed, never overshadowing the Word.
                            </p>
                            <div style={sx.hairline} />
                            <div style={sx.miniRow}>
                                <MiniTag>Reading first</MiniTag>
                                <MiniDot />
                                <MiniTag>Essential aids only</MiniTag>
                                <MiniDot />
                                <MiniTag>Reverence in simplicity</MiniTag>
                            </div>
                        </div>

                        {/* Body */}
                        <div style={sx.body}>
                            <Section title="Statement">
                                Biblia Populi seeks to honor the Holy Scriptures as the living Word of
                                God—fulfilled in <strong>Jesus Christ</strong>, crucified and risen.
                            </Section>
                            <Section title="Purpose">
                                This is a simple labor of faith, built by one person, to offer Scripture
                                freely: accessible, readable, shareable—without barriers or distractions.
                            </Section>
                            <Section title="Design">
                                The text leads. Context emerges gently, on request—never competing for
                                attention.
                            </Section>
                            <div style={sx.footer}>
                                <div style={sx.footerLine} />
                                <div style={styles.footerMuted}>
                                    © {new Date().getFullYear()} Biblia Populi
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}

function ThemeToggle(props: { mode: Mode; onToggle: () => void; styles: Styles }) {
    const { mode, onToggle, styles } = props;
    return (
        <button
            type="button"
            onClick={onToggle}
            style={styles.themePill}
            aria-label={mode === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={mode === "dark" ? "Light" : "Dark"}
        >
      <span
          style={{
              ...styles.themeDot,
              transform: mode === "dark" ? "translateX(16px)" : "translateX(0px)",
          }}
      />
        </button>
    );
}

function RailItem(props: { label: string }) {
    return <div style={sx.railItem}>{props.label}</div>;
}

function MiniTag(props: { children: React.ReactNode }) {
    return <span style={sx.miniTag}>{props.children}</span>;
}

function MiniDot() {
    return <span style={sx.miniDot} aria-hidden />;
}

function Section(props: { title: string; children: React.ReactNode }) {
    return (
        <section style={sx.section}>
            <div style={sx.sectionTitle}>{props.title}</div>
            <div style={sx.sectionBody}>{props.children}</div>
        </section>
    );
}

const sx: Record<string, React.CSSProperties> = {
    page: {
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--fg)",
        padding: "20px 0 100px",
    },
    container: {
        paddingInline: 20,
    },
    topBar: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        paddingTop: 12,
        paddingBottom: 12,
        position: "sticky",
        top: 0,
        zIndex: 5,
        background: "linear-gradient(to bottom, var(--bg), transparent)",
        backdropFilter: "blur(8px)",
    },
    backBtnTweak: {
        boxShadow: "none",
    },
    grid: {
        display: "flex",
        alignItems: "flex-start",
        marginTop: 24,
    },
    rail: {
        paddingLeft: 16,
        paddingTop: 8,
        position: "sticky",
        top: 68,
    },
    railKicker: {
        fontSize: 9,
        letterSpacing: "0.35em",
        textTransform: "uppercase",
        color: "var(--muted)",
        opacity: 0.9,
    },
    railLine: {
        marginTop: 12,
        height: 1,
        background: "var(--hairline)",
        opacity: 0.85,
        width: 100,
    },
    railItem: {
        marginTop: 12,
        fontSize: 11,
        letterSpacing: "0.05em",
        lineHeight: 1.6,
        color: "var(--muted)",
        opacity: 0.9,
    },
    railFoot: {
        marginTop: 16,
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--muted)",
        opacity: 0.7,
        lineHeight: 1.5,
    },
    hero: {
        padding: "20px 0",
    },
    kicker: {
        fontSize: 10,
        letterSpacing: "0.32em",
        textTransform: "uppercase",
        color: "var(--muted)",
        opacity: 0.9,
    },
    h1: {
        marginTop: 12,
        marginBottom: 0,
        fontSize: 28,
        lineHeight: 1.15,
        letterSpacing: "-0.02em",
    },
    lede: {
        marginTop: 12,
        marginBottom: 0,
        fontSize: 13,
        letterSpacing: "0.03em",
        lineHeight: 1.9,
        color: "var(--muted)",
        maxWidth: 540,
    },
    hairline: {
        marginTop: 18,
        height: 1,
        background: "var(--hairline)",
        opacity: 0.9,
    },
    miniRow: {
        marginTop: 14,
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
        color: "var(--muted)",
    },
    miniTag: {
        fontSize: 10,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        opacity: 0.8,
        userSelect: "none",
    },
    miniDot: {
        width: 3,
        height: 3,
        borderRadius: 999,
        background: "var(--muted)",
        opacity: 0.5,
        display: "inline-block",
    },
    body: {
        marginTop: 20,
        padding: "8px 0",
    },
    section: {
        padding: "16px 0",
    },
    sectionTitle: {
        fontSize: 10,
        letterSpacing: "0.24em",
        textTransform: "uppercase",
        color: "var(--muted)",
        opacity: 0.9,
    },
    sectionBody: {
        marginTop: 8,
        fontSize: 13,
        letterSpacing: "0.03em",
        lineHeight: 1.9,
        color: "var(--muted)",
        maxWidth: 580,
    },
    footer: {
        padding: "16px 0 12px",
    },
    footerLine: {
        height: 1,
        background: "var(--hairline)",
        opacity: 0.85,
        marginBottom: 14,
    },
};