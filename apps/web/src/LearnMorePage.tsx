// apps/web/src/LearnMorePage.tsx
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
 * Learn More — single calm “from me” note
 * - no micro-headings
 * - one clean column
 * - natural paragraphs
 */
export function LearnMorePage(props: Props) {
    // NOTE: toggle is now global (App.tsx), so we intentionally do not render it here.
    const { onBack, styles } = props;

    const [isNarrow, setIsNarrow] = useState<boolean>(() => {
        if (typeof window === "undefined") return true;
        return window.matchMedia("(max-width: 900px)").matches;
    });

    useEffect(() => {
        if (typeof window === "undefined") return;

        const mq = window.matchMedia("(max-width: 900px)");
        const onChange = () => setIsNarrow(mq.matches);

        // Safari fallback
        const anyMq = mq as any;
        if (typeof mq.addEventListener === "function") {
            mq.addEventListener("change", onChange);
            return () => mq.removeEventListener("change", onChange);
        }
        if (typeof anyMq.addListener === "function") {
            anyMq.addListener(onChange);
            return () => anyMq.removeListener(onChange);
        }
        return;
    }, []);

    const maxW = useMemo(() => (isNarrow ? 680 : 720), [isNarrow]);

    const [pressBack, setPressBack] = useState(false);

    const backHandlers = useMemo(
        () => ({
            onPointerDown: () => setPressBack(true),
            onPointerUp: () => setPressBack(false),
            onPointerCancel: () => setPressBack(false),
            onPointerLeave: () => setPressBack(false),
        }),
        [],
    );

    return (
        <main aria-label="Learn more" style={{ ...styles.page, ...sx.page }}>
            <div style={sx.container}>
                {/* Top bar */}
                <div style={sx.topBar}>
                    <button
                        type="button"
                        onClick={onBack}
                        style={{
                            ...sx.backBtn,
                            ...(pressBack ? sx.backBtnPressed : null),
                        }}
                        aria-label="Back"
                        {...backHandlers}
                    >
                        <span aria-hidden style={sx.backArrow}>
                            ←
                        </span>
                        <span>Back</span>
                    </button>

                    <div style={{ flex: 1 }} />
                </div>

                <section style={{ ...sx.content, maxWidth: maxW }}>
                    <div style={sx.kicker}>from the dev</div>
                    <h1 style={sx.h1}>Biblia Populi</h1>

                    <div style={sx.hairline} />

                    <div style={sx.prose}>
                        <p style={sx.p}>
                            Biblia Populi means <strong>Bible for the people</strong>. That’s the whole point.
                        </p>

                        <p style={sx.p}>
                            I’m building this because I’m tired of watching Scripture get treated like property — locked behind paywalls,
                            platforms, gatekeepers, and “experts.” Sometimes it’s well-intentioned. Sometimes it’s corruption. Either
                            way, it becomes control: control the framing, control the emphasis, control access.
                        </p>

                        <p style={sx.p}>
                            I want the opposite. A place where you can open the Bible and read — calmly — without being nudged, steered,
                            marketed to, or pulled into somebody’s agenda.
                        </p>

                        <div style={sx.quote}>
                            <div style={sx.quoteBar} aria-hidden />
                            <div style={sx.quoteText}>
                                Centered on <strong>Jesus Christ</strong> — crucified and risen. The resurrection is not a theme. It’s the
                                spine.
                            </div>
                        </div>

                        <p style={sx.p}>
                            I’m starting with KJV because it’s stable, known, and anchored. Later, if I ever add a “layman” readability
                            layer, it will be optional and meaning-locked — never replacing Scripture, never rewriting the truth.
                        </p>

                        <p style={sx.p}>What I’m building is simple in posture, modern in tooling:</p>

                        <ul style={sx.ul}>
                            <li style={sx.li}>a clean reader that stays out of your way</li>
                            <li style={sx.li}>fast search and reference navigation</li>
                            <li style={sx.li}>maps / people / places / timelines that illuminate without editorializing</li>
                            <li style={sx.li}>no feed, no engagement tricks, no algorithmic steering</li>
                        </ul>

                        <p style={sx.p}>
                            And yes — I’m doing this because gatekeeping is real and corruption is real. But also because I want to.
                            Because I can. Because I care about the text being available to ordinary people without someone “managing”
                            their access.
                        </p>

                        <p style={{ ...sx.p, marginBottom: 0 }}>
                            Bible for the people. Open access. Reading first. Centered on Christ.
                        </p>
                    </div>

                    <div style={sx.footer}>
                        <div style={sx.footerLine} />
                        <div style={sx.footerMuted}>© {new Date().getFullYear()} Biblia Populi</div>
                    </div>
                </section>
            </div>
        </main>
    );
}

const sx: Record<string, React.CSSProperties> = {
    page: {
        padding: "20px 0 100px",
    },

    container: { paddingInline: 20 },

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
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
    },

    backBtn: {
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        color: "var(--fg)",
        cursor: "pointer",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
        boxShadow: "0 10px 26px rgba(0,0,0,0.08)",
        transition: "transform 140ms cubic-bezier(0.23, 1, 0.32, 1), opacity 140ms ease, box-shadow 140ms ease",
        fontSize: 12.8,
        letterSpacing: "0.01em",
    },

    backBtnPressed: {
        transform: "translateY(1px) scale(0.99)",
        opacity: 0.94,
    },

    backArrow: {
        display: "inline-block",
        opacity: 0.75,
        transform: "translateY(-0.5px)",
    },

    content: {
        width: "100%",
        marginInline: "auto",
        paddingTop: 24,
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
        fontSize: 34,
        lineHeight: 1.12,
        letterSpacing: "-0.02em",
    },

    hairline: {
        marginTop: 18,
        height: 1,
        background: "var(--hairline)",
        opacity: 0.9,
    },

    prose: {
        paddingTop: 18,
        color: "var(--muted)",
        fontSize: 13.25,
        letterSpacing: "0.02em",
        lineHeight: 2.0,
    },

    p: {
        marginTop: 0,
        marginBottom: 14,
    },

    quote: {
        display: "grid",
        gridTemplateColumns: "10px 1fr",
        gap: 12,
        alignItems: "start",
        margin: "18px 0 18px",
        padding: "14px 14px",
        borderRadius: 16,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        boxShadow: "0 10px 26px rgba(0,0,0,0.08)",
        color: "var(--fg)",
    },

    quoteBar: {
        width: 3,
        height: "100%",
        borderRadius: 999,
        background: "var(--fg)",
        opacity: 0.12,
        marginTop: 2,
        marginLeft: 2,
    },

    quoteText: {
        fontSize: 13.25,
        lineHeight: 1.85,
        letterSpacing: "0.02em",
        color: "var(--muted)",
    },

    ul: {
        marginTop: 8,
        marginBottom: 16,
        paddingLeft: 18,
    },

    li: {
        marginBottom: 6,
    },

    footer: {
        paddingTop: 18,
    },

    footerLine: {
        height: 1,
        background: "var(--hairline)",
        opacity: 0.85,
        marginBottom: 14,
    },

    footerMuted: {
        color: "var(--muted)",
        fontSize: 12,
        opacity: 0.85,
    },
};