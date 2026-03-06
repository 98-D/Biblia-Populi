import React, { useCallback, useEffect, useMemo, useState } from "react";

type Mode = "light" | "dark";
type Styles = Record<string, React.CSSProperties>;

type Props = {
    mode: Mode;
    onToggleTheme: () => void;
    onBack: () => void;
    /** Pass the same styles object from App so this page matches exactly. */
    styles: Styles;

    /**
     * Optional: override product name shown in the page copy/footer.
     * Default: "Biblia"
     */
    brandName?: string;

    /**
     * Optional: show a theme toggle in the top bar.
     * Default: false (since parent app likely already has it)
     */
    showThemeToggle?: boolean;
};

const MQ_NARROW = "(max-width: 900px)";

/** Safe media-query hook (supports older Safari). */
function useMediaQuery(query: string, defaultValue = true): boolean {
    const get = () => {
        if (typeof window === "undefined") return defaultValue;
        return window.matchMedia(query).matches;
    };

    const [matches, setMatches] = useState<boolean>(get);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia(query);
        const onChange = () => setMatches(mq.matches);

        onChange();

        // Modern API
        if (typeof mq.addEventListener === "function") {
            mq.addEventListener("change", onChange);
            return () => mq.removeEventListener("change", onChange);
        }

        // Legacy Safari
        // eslint-disable-next-line deprecation/deprecation
        mq.addListener(onChange);
        // eslint-disable-next-line deprecation/deprecation
        return () => mq.removeListener(onChange);
    }, [query]);

    return matches;
}

function usePrefersReducedMotion(): boolean {
    return useMediaQuery("(prefers-reduced-motion: reduce)", false);
}

/**
 * LearnMorePage — calm, reading-first note
 * Upgrades:
 * - better a11y (Skip link, focus-visible ring, keyboard shortcuts)
 * - optional theme toggle
 * - tiny motion only when allowed (respects prefers-reduced-motion)
 * - branding defaulted to "Biblia" (overrideable)
 */
export function LearnMorePage(props: Props) {
    const { onBack, styles, onToggleTheme, mode, brandName = "Biblia", showThemeToggle = false } = props;

    const isNarrow = useMediaQuery(MQ_NARROW, true);
    const reduceMotion = usePrefersReducedMotion();

    // Button interaction states (subtle, no transforms)
    const [hoverBack, setHoverBack] = useState(false);
    const [hoverTheme, setHoverTheme] = useState(false);

    const onBackEnter = useCallback(() => setHoverBack(true), []);
    const onBackLeave = useCallback(() => setHoverBack(false), []);
    const onThemeEnter = useCallback(() => setHoverTheme(true), []);
    const onThemeLeave = useCallback(() => setHoverTheme(false), []);

    // Keyboard shortcut: Escape / Backspace to go back (unless typing).
    useEffect(() => {
        const isTypingTarget = (t: EventTarget | null) => {
            const el = t as HTMLElement | null;
            if (!el) return false;
            const tag = (el.tagName || "").toLowerCase();
            if (tag === "input" || tag === "textarea" || tag === "select") return true;
            if (el.isContentEditable) return true;
            return false;
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (isTypingTarget(e.target)) return;
            if (e.key === "Escape" || e.key === "Backspace") {
                e.preventDefault();
                onBack();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onBack]);

    const maxContentWidth = isNarrow ? 680 : 760;

    const title = useMemo(() => `Welcome to ${brandName}`, [brandName]);

    const themeLabel = mode === "dark" ? "Light mode" : "Dark mode";

    return (
        <main aria-label="Learn more" style={{ ...styles.page, ...sx.page }}>
            {/* Skip link for keyboard users */}
            <a href="#learnmore-content" style={sx.skipLink}>
                Skip to content
            </a>

            <div style={sx.container}>
                {/* Sticky top bar */}
                <header style={sx.topBar} role="banner">
                    <button
                        type="button"
                        onClick={onBack}
                        style={{
                            ...sx.backBtn,
                            ...(hoverBack ? sx.backBtnHover : {}),
                        }}
                        aria-label="Back"
                        onMouseEnter={onBackEnter}
                        onMouseLeave={onBackLeave}
                    >
                        <span aria-hidden style={sx.backArrow}>
                            ←
                        </span>
                        <span>Back</span>
                    </button>

                    <div style={{ flex: 1 }} />

                    {showThemeToggle ? (
                        <button
                            type="button"
                            onClick={onToggleTheme}
                            aria-label={`Toggle theme (${themeLabel})`}
                            title={`Toggle theme (${themeLabel})`}
                            style={{
                                ...sx.iconBtn,
                                ...(hoverTheme ? sx.iconBtnHover : {}),
                            }}
                            onMouseEnter={onThemeEnter}
                            onMouseLeave={onThemeLeave}
                        >
                            <span aria-hidden style={sx.iconGlyph}>
                                {mode === "dark" ? "☼" : "☾"}
                            </span>
                        </button>
                    ) : null}
                </header>

                <section id="learnmore-content" style={{ ...sx.content, maxWidth: maxContentWidth }}>
                    <div
                        style={{
                            ...sx.paper,
                            ...(reduceMotion ? {} : sx.paperMotion),
                        }}
                    >
                        <div style={sx.kicker}>a note from the dev</div>
                        <h1 style={sx.h1}>{title}</h1>
                        <div style={sx.hairline} />

                        <div style={sx.prose}>
                            <p style={sx.p}>
                                {brandName} is built for reading: calm, beautiful, and fast — no clutter, no noise.
                            </p>

                            <p style={sx.p}>
                                I made this because I believe everyone should be able to open the Bible and read it in peace — no
                                distractions, no paywalls, and no one trying to steer you.
                            </p>

                            <p style={sx.p}>
                                My hope is to give you a quiet space where the Word can speak for itself. Just you and the text.
                            </p>

                            <div style={sx.quote} role="note" aria-label="Core statement">
                                <div style={sx.quoteBar} aria-hidden />
                                <div style={sx.quoteText}>
                                    Centered on <strong>Jesus Christ</strong> — crucified and risen. That’s the heart of everything
                                    here.
                                </div>
                            </div>

                            <p style={sx.p}>
                                I started with the KJV because it’s a steady, well-loved translation. Over time, more translations can
                                be added — but the design stays the same: Scripture first.
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
                            <div style={sx.footerMuted}>
                                © {new Date().getFullYear()} {brandName}
                            </div>
                        </footer>
                    </div>
                </section>
            </div>
        </main>
    );
}

// All styles are inline to keep the component self-contained.
// CSS custom properties (--bg, --fg, --panel, --hairline, --muted) are set by the parent app.
const sx: Record<string, React.CSSProperties> = {
    page: {
        padding: "18px 0 96px",
    },
    container: {
        paddingInline: 18,
    },

    skipLink: {
        position: "absolute",
        left: 12,
        top: 8,
        padding: "10px 12px",
        borderRadius: 12,
        background: "var(--panel)",
        color: "var(--fg)",
        border: "1px solid var(--hairline)",
        boxShadow: "0 12px 26px rgba(0,0,0,0.10)",
        textDecoration: "none",
        transform: "translateY(-140%)",
        outline: "none",
        zIndex: 100,
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
        opacity: 0.78,
        transform: "translateY(-0.5px)",
    },

    iconBtn: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        borderRadius: 12,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        color: "var(--fg)",
        cursor: "pointer",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
        boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
        outline: "none",
    },
    iconBtnHover: {
        borderColor: "color-mix(in oklab, var(--hairline) 55%, var(--fg))",
        boxShadow: "0 10px 26px rgba(0,0,0,0.08)",
        filter: "saturate(1.02)",
    },
    iconGlyph: {
        fontSize: 16,
        lineHeight: 1,
        opacity: 0.82,
        transform: "translateY(-0.5px)",
    },

    content: {
        width: "100%",
        marginInline: "auto",
        paddingTop: 18,
        position: "relative",
    },

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

    // Optional micro-motion only (never transforms layout)
    paperMotion: {
        transition: "box-shadow 140ms ease, border-color 140ms ease, filter 140ms ease",
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
        color: "var(--fg)",
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
        fontSize: 13.6,
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
        fontSize: 13.6,
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

// Focus styles (kept inline-friendly):
// If your base.css already defines :focus-visible, you can remove these additions.
// Otherwise, consider adding a global rule:
// button:focus-visible, a:focus-visible { outline: 2px solid color-mix(in oklab, var(--fg) 35%, transparent); outline-offset: 2px; }