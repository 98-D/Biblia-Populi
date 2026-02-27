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
 * Ultra-minimal Learn More page
 * - Matches your styling tokens (muted, hairline, panel, shadowSoft)
 * - Tight typography, whitespace, no cards
 * - Single thin rail on wide screens
 * - No runtime style mutation; responsive handled via state + inline style
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
        const railW = isNarrow ? 0 : 180;
        return {
            railW,
            contentMax: isNarrow ? 760 : 720,
            gap: isNarrow ? 0 : 26,
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

            <div style={{ ...local.headerWrap, marginTop: 28, gap: layout.gap }}>
                {!isNarrow && (
                    <aside style={{ width: layout.railW, paddingTop: 8 }}>
                        <div style={local.rail}>
                            <div style={local.railKicker}>Biblia Populi</div>
                            <div style={local.railMeta}>Reading-first Scripture</div>
                            <div style={local.railMeta}>Open access</div>
                            <div style={local.railMeta}>Quiet by design</div>
                        </div>
                    </aside>
                )}

                <section style={{ maxWidth: layout.contentMax }}>
                    <div style={local.kicker}>Learn more</div>
                    <h1 style={local.title}>Built for quiet reading.</h1>
                    <p style={local.lede}>
                        Biblia Populi is a calm, modern Scripture platform — designed to keep the text central, and everything else
                        secondary.
                    </p>

                    <div style={local.hr} />

                    <Section title="Purpose">
                        A personal labor of faith: to make Scripture freely accessible, readable, and shareable — without noise or
                        gatekeeping.
                    </Section>

                    <Section title="Design">
                        Reading comes first. Maps, people, places, and references are optional depth — revealed only when asked,
                        never competing with the passage.
                    </Section>

                    <Section title="Statement">
                        Biblia Populi exists to proclaim and preserve the Holy Scriptures as the true and living Word of God —
                        fulfilled in <strong>Jesus Christ</strong>, crucified and risen.
                    </Section>

                    <div style={local.hr} />

                    <footer style={{ marginTop: 22 }}>
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
        <section style={{ marginTop: 18 }}>
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
        paddingLeft: 14,
    },
    railKicker: {
        fontSize: 10,
        letterSpacing: "0.33em",
        textTransform: "uppercase",
        color: "var(--muted)",
    },
    railMeta: {
        marginTop: 10,
        fontSize: 12,
        color: "var(--muted)",
        letterSpacing: "0.04em",
        lineHeight: 1.6,
    },

    kicker: {
        fontSize: 11,
        letterSpacing: "0.33em",
        textTransform: "uppercase",
        color: "var(--muted)",
    },
    title: {
        marginTop: 10,
        fontSize: 44,
        lineHeight: 1.06,
        letterSpacing: "-0.05em",
        marginBottom: 0,
    },
    lede: {
        marginTop: 10,
        fontSize: 13,
        letterSpacing: "0.04em",
        lineHeight: 1.9,
        color: "var(--muted)",
        maxWidth: 640,
    },

    hr: {
        marginTop: 18,
        height: 1,
        background: "var(--hairline)",
        opacity: 1,
    },

    sectionTitle: {
        fontSize: 11,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: "var(--muted)",
    },
    sectionBody: {
        marginTop: 8,
        fontSize: 13,
        letterSpacing: "0.04em",
        lineHeight: 1.9,
        color: "var(--muted)",
        maxWidth: 660,
    },
};