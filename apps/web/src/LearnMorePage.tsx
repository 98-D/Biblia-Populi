// apps/web/src/LearnMorePage.tsx
import React, { useEffect, useMemo, useState } from "react";

type Mode = "light" | "dark";
type Styles = Record<string, React.CSSProperties>;

type Props = {
    mode: Mode;
    onToggleTheme: () => void;
    onBack: () => void;
    /** Pass the same styles object from App so this page *matches exactly*. */
    styles: Styles;
};

/**
 * Ultra-minimal Learn More page (chill typography, narrower + centered body)
 * - Statement first
 * - Less wide content for a calmer reading feel
 * - Content column centered within its area
 * - Keeps your tokens: --muted, --hairline, --panel
 */
export function LearnMorePage(props: Props) {
    const { mode, onToggleTheme, onBack, styles } = props;

    const [isNarrow, setIsNarrow] = useState<boolean>(() =>
        typeof window === "undefined" ? true : window.matchMedia("(max-width: 820px)").matches,
    );

    useEffect(() => {
        const mq = window.matchMedia("(max-width: 820px)");
        const onChange = () => setIsNarrow(mq.matches);
        mq.addEventListener?.("change", onChange);
        return () => mq.removeEventListener?.("change", onChange);
    }, []);

    const layout = useMemo(() => {
        const railW = isNarrow ? 0 : 160;
        return {
            railW,
            contentMax: isNarrow ? 640 : 600,
            gap: isNarrow ? 0 : 20,
        };
    }, [isNarrow]);

    return (
        <main className="container" style={styles.learnPage} aria-label="Learn more">
            <div style={styles.learnTopRow}>
                <button type="button" onClick={onBack} style={styles.backBtn}>
                    ← Back
                </button>

                <div style={{ flex: 1 }} />

                <ThemeToggle mode={mode} onToggle={onToggleTheme} styles={styles} />
            </div>

            <div style={{ ...local.headerWrap, marginTop: 22, gap: layout.gap }}>
                {!isNarrow && (
                    <aside style={{ width: layout.railW, paddingTop: 6 }}>
                        <div style={local.rail}>
                            <div style={local.railKicker}>Biblia Populi</div>
                            <div style={local.railMeta}>Reading-first</div>
                            <div style={local.railMeta}>Open access</div>
                            <div style={local.railMeta}>Quiet by design</div>
                        </div>
                    </aside>
                )}

                {/* Center the content column */}
                <section style={{ maxWidth: layout.contentMax, marginInline: "auto" }}>
                    <div style={local.kicker}>Learn more</div>
                    <h1 style={local.title}>Quiet reading, modern form.</h1>
                    <p style={local.lede}>
                        Biblia Populi is designed to keep the text central. Everything else stays secondary — available, but never in
                        the way.
                    </p>

                    <div style={local.hr} />

                    <Section title="Statement">
                        Biblia Populi exists to proclaim and preserve the Holy Scriptures as the true and living Word of God —
                        fulfilled in <strong>Jesus Christ</strong>, crucified and risen.
                    </Section>

                    <Section title="Purpose">
                        A personal labor of faith: to make Scripture freely accessible, readable, and shareable — without noise or
                        gatekeeping. I am the sole developer.
                    </Section>

                    <Section title="Design">
                        Reading comes first. Maps, people, places, and references are optional depth — revealed only when asked,
                        never competing with the passage.
                    </Section>

                    <div style={local.hr} />

                    <footer style={{ marginTop: 18 }}>
                        <div style={styles.footerMuted}>© {new Date().getFullYear()} Biblia Populi</div>
                    </footer>
                </section>
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
            <span style={{ ...styles.themeDot, transform: mode === "dark" ? "translateX(16px)" : "translateX(0px)" }} />
        </button>
    );
}

function Section(props: { title: string; children: React.ReactNode }) {
    return (
        <section style={{ marginTop: 14 }}>
            <div style={local.sectionTitle}>{props.title}</div>
            <div style={local.sectionBody}>{props.children}</div>
        </section>
    );
}

const local: Record<string, React.CSSProperties> = {
    headerWrap: {
        display: "flex",
        alignItems: "flex-start",
    },

    rail: {
        borderLeft: "1px solid var(--hairline)",
        paddingLeft: 12,
    },
    railKicker: {
        fontSize: 9,
        letterSpacing: "0.33em",
        textTransform: "uppercase",
        color: "var(--muted)",
    },
    railMeta: {
        marginTop: 8,
        fontSize: 11,
        color: "var(--muted)",
        letterSpacing: "0.04em",
        lineHeight: 1.6,
        opacity: 0.92,
    },

    kicker: {
        fontSize: 10,
        letterSpacing: "0.30em",
        textTransform: "uppercase",
        color: "var(--muted)",
    },
    title: {
        marginTop: 8,
        fontSize: 28,
        lineHeight: 1.14,
        letterSpacing: "-0.03em",
        marginBottom: 0,
    },
    lede: {
        marginTop: 10,
        fontSize: 12,
        letterSpacing: "0.04em",
        lineHeight: 1.9,
        color: "var(--muted)",
        maxWidth: 520,
    },

    hr: {
        marginTop: 16,
        height: 1,
        background: "var(--hairline)",
        opacity: 1,
    },

    sectionTitle: {
        fontSize: 10,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: "var(--muted)",
        opacity: 0.95,
    },
    sectionBody: {
        marginTop: 6,
        fontSize: 12,
        letterSpacing: "0.04em",
        lineHeight: 1.9,
        color: "var(--muted)",
        maxWidth: 560,
    },
};