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

const MQ_NARROW = "(max-width: 900px)";

// Generic media query hook with legacy Safari support
function useMediaQuery(query: string, defaultValue = true): boolean {
    const [matches, setMatches] = useState<boolean>(() => {
        if (typeof window === "undefined") return defaultValue;
        return window.matchMedia(query).matches;
    });

    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia(query);
        const onChange = () => setMatches(mq.matches);

        // Set initial value
        onChange();

        // Use modern API first, fallback to legacy for Safari <14
        if (typeof mq.addEventListener === "function") {
            mq.addEventListener("change", onChange);
            return () => mq.removeEventListener("change", onChange);
        }

        // Safari <14
        // eslint-disable-next-line deprecation/deprecation
        mq.addListener(onChange);
        // eslint-disable-next-line deprecation/deprecation
        return () => mq.removeListener(onChange);
    }, [query]);

    return matches;
}

/**
 * LearnMorePage – a gentle, personal note
 * - warm + welcoming
 * - calm, paper-like layout
 * - static design, no motion
 */
export function LearnMorePage(props: Props) {
    const { onBack, styles } = props;

    const isNarrow = useMediaQuery(MQ_NARROW, true);

    // Button interaction states (simple visual feedback, no transforms/transitions)
    const [hoverBack, setHoverBack] = useState(false);

    const backHandlers = useMemo(
        () => ({
            onMouseEnter: () => setHoverBack(true),
            onMouseLeave: () => setHoverBack(false),
        }),
        [],
    );

    const maxContentWidth = isNarrow ? 680 : 740;

    return (
        <main aria-label="Learn more" style={{ ...styles.page, ...sx.page }}>
            <div style={sx.container}>
                {/* Sticky top bar */}
                <header style={sx.topBar}>
                    <button
                        type="button"
                        onClick={onBack}
                        style={{
                            ...sx.backBtn,
                            ...(hoverBack ? sx.backBtnHover : {}),
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
                </header>

                <section style={{ ...sx.content, maxWidth: maxContentWidth }}>
                    <div style={sx.paper}>
                        <div style={sx.kicker}>a note from the dev</div>
                        <h1 style={sx.h1}>Welcome to Biblia Populi</h1>
                        <div style={sx.hairline} />

                        <div style={sx.prose}>
                            <p style={sx.p}>
                                Biblia Populi simply means <strong>Bible for the people</strong>.
                            </p>

                            <p style={sx.p}>
                                I created this because I believe everyone should be able to open the Bible and read it in peace — no
                                distractions, no paywalls, no one trying to steer you.
                            </p>

                            <p style={sx.p}>
                                My hope is to give you a calm, beautiful space where the Word can speak for itself. Just you and the
                                text.
                            </p>

                            <div style={sx.quote} role="note" aria-label="Core statement">
                                <div style={sx.quoteBar} aria-hidden />
                                <div style={sx.quoteText}>
                                    Centered on <strong>Jesus Christ</strong> — crucified and risen. That’s the heart of everything here.
                                </div>
                            </div>

                            <p style={sx.p}>
                                I started with the KJV because it’s a steady, well-loved translation. Everything here is built to stay
                                out of your way so the Scripture can stay front and center.
                            </p>

                            <p style={sx.p}>
                                You’ll find a clean reader, thoughtful search, and a few quiet tools to help you explore — all designed
                                with care and simplicity.
                            </p>

                            <p style={{ ...sx.p, marginBottom: 0 }}>
                                Whether you’re new to the Bible or have been reading it for years, I’m really glad you’re here.
                            </p>
                        </div>

                        <footer style={sx.footer}>
                            <div style={sx.footerLine} />
                            <div style={sx.footerMuted}>© {new Date().getFullYear()} Biblia Populi</div>
                        </footer>
                    </div>
                </section>
            </div>
        </main>
    );
}

// All styles are defined inline to keep the component self‑contained.
// CSS custom properties (--bg, --fg, --panel, --hairline, --muted) are set by the parent app.
const sx: Record<string, React.CSSProperties> = {
    page: {
        padding: "18px 0 96px",
    },
    container: {
        paddingInline: 18,
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
        background:
            "linear-gradient(to bottom, var(--bg) 0%, color-mix(in oklab, var(--bg) 70%, transparent) 70%, transparent 100%)",
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
        boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
        fontSize: 12.8,
        letterSpacing: "0.01em",
        outline: "none",
    },
    backBtnHover: {
        borderColor: "color-mix(in oklab, var(--hairline) 55%, var(--fg))",
        boxShadow: "0 10px 26px rgba(0,0,0,0.08)",
        filter: "saturate(1.02)",
    },
    backArrow: {
        display: "inline-block",
        opacity: 0.75,
        transform: "translateY(-0.5px)",
    },

    content: {
        width: "100%",
        marginInline: "auto",
        paddingTop: 18,
        position: "relative",
    },

    // Paper-like card: subtle texture + gentle border
    paper: {
        position: "relative",
        zIndex: 1,
        borderRadius: 22,
        border: "1px solid var(--hairline)",
        background:
            "linear-gradient(180deg, color-mix(in oklab, var(--panel) 92%, transparent) 0%, var(--panel) 38%, var(--panel) 100%)",
        boxShadow: "0 22px 60px rgba(0,0,0,0.06)",
        padding: "26px 22px",
    },

    kicker: {
        fontSize: 10,
        letterSpacing: "0.28em",
        textTransform: "uppercase",
        color: "var(--muted)",
        opacity: 0.86,
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
        opacity: 0.85,
    },

    prose: {
        paddingTop: 18,
        color: "var(--muted)",
        fontSize: 13.4,
        letterSpacing: "0.015em",
        lineHeight: 1.95,
    },
    p: {
        marginTop: 0,
        marginBottom: 15,
    },

    quote: {
        display: "grid",
        gridTemplateColumns: "10px 1fr",
        gap: 12,
        alignItems: "start",
        margin: "20px 0 20px",
        padding: "16px 16px",
        borderRadius: 18,
        border: "1px solid var(--hairline)",
        background:
            "linear-gradient(180deg, color-mix(in oklab, var(--panel) 88%, transparent) 0%, var(--panel) 60%, var(--panel) 100%)",
        boxShadow: "0 10px 26px rgba(0,0,0,0.06)",
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
        fontSize: 13.4,
        lineHeight: 1.85,
        letterSpacing: "0.015em",
        color: "var(--muted)",
    },

    footer: {
        paddingTop: 22,
    },
    footerLine: {
        height: 1,
        background: "var(--hairline)",
        opacity: 0.8,
        marginBottom: 12,
    },
    footerMuted: {
        color: "var(--muted)",
        fontSize: 12,
        opacity: 0.85,
    },
};