import React, { useEffect, useMemo, useState } from "react";

type Mode = "light" | "dark";
type Styles = Record<string, React.CSSProperties>;

type Props = {
    mode: Mode;
    onToggleTheme: () => void;
    onBack: () => void;
    styles: Styles;
    brandName?: string;
    showThemeToggle?: boolean;
};

const MQ_NARROW = "(max-width: 900px)";
const MQ_REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function canUseDOM(): boolean {
    return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function useMediaQuery(query: string, defaultValue = false): boolean {
    const getSnapshot = (): boolean => {
        if (!canUseDOM()) return defaultValue;
        return window.matchMedia(query).matches;
    };

    const [matches, setMatches] = useState<boolean>(getSnapshot);

    useEffect(() => {
        if (!canUseDOM()) return;

        const media = window.matchMedia(query);
        const update = () => setMatches(media.matches);

        update();

        if (typeof media.addEventListener === "function") {
            media.addEventListener("change", update);
            return () => media.removeEventListener("change", update);
        }

        // Safari legacy
        // eslint-disable-next-line deprecation/deprecation
        media.addListener(update);
        // eslint-disable-next-line deprecation/deprecation
        return () => media.removeListener(update);
    }, [query]);

    return matches;
}

function usePrefersReducedMotion(): boolean {
    return useMediaQuery(MQ_REDUCED_MOTION, false);
}

function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;

    const tag = el.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

function useBackShortcuts(onBack: () => void): void {
    useEffect(() => {
        if (!canUseDOM()) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented) return;
            if (isTypingTarget(event.target)) return;

            if (event.key === "Escape") {
                event.preventDefault();
                onBack();
                return;
            }

            if (event.key === "Backspace") {
                const active = document.activeElement as HTMLElement | null;
                if (active && isTypingTarget(active)) return;
                event.preventDefault();
                onBack();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onBack]);
}

function useCurrentYear(): number {
    return useMemo(() => new Date().getFullYear(), []);
}

function buttonStyle(base: React.CSSProperties, hover: boolean, active: boolean): React.CSSProperties {
    return {
        ...base,
        ...(hover ? sx.buttonHover : null),
        ...(active ? sx.buttonActive : null),
    };
}

export function LearnMorePage({
                                  mode,
                                  onToggleTheme,
                                  onBack,
                                  styles,
                                  brandName = "Biblia.to",
                                  showThemeToggle = false,
                              }: Props) {
    const isNarrow = useMediaQuery(MQ_NARROW, true);
    const reduceMotion = usePrefersReducedMotion();
    const year = useCurrentYear();

    const [backHovered, setBackHovered] = useState(false);
    const [backPressed, setBackPressed] = useState(false);
    const [themeHovered, setThemeHovered] = useState(false);
    const [themePressed, setThemePressed] = useState(false);

    useBackShortcuts(onBack);

    const themeLabel = mode === "dark" ? "Light mode" : "Dark mode";
    const contentWidth = isNarrow ? 680 : 760;

    const title = useMemo(() => {
        return `About ${brandName}`;
    }, [brandName]);

    const paperStyle = useMemo<React.CSSProperties>(() => {
        return {
            ...sx.paper,
            ...(reduceMotion ? null : sx.paperMotion),
        };
    }, [reduceMotion]);

    return (
         <main aria-label="About Biblia" style={{ ...styles.page, ...sx.page }}>
             <a href="#learn-more-content" style={sx.skipLink}>
                 Skip to content
             </a>

             <div style={sx.container}>
                 <header style={sx.topBar} role="banner">
                     <button
                          type="button"
                          onClick={onBack}
                          aria-label="Back"
                          style={buttonStyle(sx.backButton, backHovered, backPressed)}
                          onMouseEnter={() => setBackHovered(true)}
                          onMouseLeave={() => {
                              setBackHovered(false);
                              setBackPressed(false);
                          }}
                          onMouseDown={() => setBackPressed(true)}
                          onMouseUp={() => setBackPressed(false)}
                          onBlur={() => setBackPressed(false)}
                     >
                        <span aria-hidden style={sx.backArrow}>
                            ←
                        </span>
                         <span>Back</span>
                     </button>

                     <div style={sx.spacer} />

                     {showThemeToggle ? (
                          <button
                               type="button"
                               onClick={onToggleTheme}
                               aria-label={`Toggle theme (${themeLabel})`}
                               title={themeLabel}
                               style={buttonStyle(sx.iconButton, themeHovered, themePressed)}
                               onMouseEnter={() => setThemeHovered(true)}
                               onMouseLeave={() => {
                                   setThemeHovered(false);
                                   setThemePressed(false);
                               }}
                               onMouseDown={() => setThemePressed(true)}
                               onMouseUp={() => setThemePressed(false)}
                               onBlur={() => setThemePressed(false)}
                          >
                            <span aria-hidden style={sx.iconGlyph}>
                                {mode === "dark" ? "☼" : "☾"}
                            </span>
                          </button>
                     ) : null}
                 </header>

                 <section id="learn-more-content" style={{ ...sx.content, maxWidth: contentWidth }}>
                     <article style={paperStyle}>
                         <div style={sx.kicker}>kjv · truth · jesus christ</div>
                         <h1 style={sx.h1}>{title}</h1>
                         <div style={sx.hairline} />

                         <div style={sx.prose}>
                             <p style={sx.p}>
                                 {brandName} exists to keep the Bible in front of you plainly and reverently.
                             </p>

                             <p style={sx.p}>
                                 The aim is simple: open the Scriptures, read the text, and let the Word speak without clutter,
                                 manipulation, or noise.
                             </p>

                             <p style={sx.p}>
                                 This project begins with the <strong>King James Version</strong>. Not because novelty is needed, but
                                 because the text is weighty, familiar, and deeply rooted in the English-speaking church.
                             </p>

                             <div style={sx.statement} role="note" aria-label="Foundation">
                                 <div style={sx.statementBar} aria-hidden />
                                 <div style={sx.statementText}>
                                     Centered on <strong>Jesus Christ</strong> — the Son of God, crucified and risen, Lord and
                                     Saviour.
                                 </div>
                             </div>

                             <p style={sx.p}>
                                 This is not built to entertain. It is built to serve truth, to honour Scripture, and to keep the
                                 reading experience clean and serious.
                             </p>

                             <p style={sx.p}>
                                 Search should be useful. Reading should be calm. Design should get out of the way. The point is not
                                 the app. The point is the Bible.
                             </p>

                             <p style={{ ...sx.p, marginBottom: 0 }}>
                                 If this helps even one person spend more time with the Word of God and behold Christ more clearly, it
                                 is worth building.
                             </p>
                         </div>

                         <footer style={sx.footer}>
                             <div style={sx.footerLine} />
                             <div style={sx.footerText}>© {year} {brandName}</div>
                         </footer>
                     </article>
                 </section>
             </div>
         </main>
    );
}

const sx: Record<string, React.CSSProperties> = {
    page: {
        minHeight: "100%",
        padding: "18px 0 88px",
    },

    container: {
        paddingInline: 18,
    },

    skipLink: {
        position: "absolute",
        left: 12,
        top: 10,
        zIndex: 100,
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        color: "var(--fg)",
        textDecoration: "none",
        boxShadow: "0 10px 24px rgba(0,0,0,0.10)",
        transform: "translateY(-140%)",
        outline: "none",
    },

    topBar: {
        position: "sticky",
        top: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        gap: 12,
        paddingTop: 12,
        paddingBottom: 12,
        background:
             "linear-gradient(to bottom, var(--bg) 0%, color-mix(in oklab, var(--bg) 76%, transparent) 72%, transparent 100%)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
    },

    spacer: {
        flex: 1,
    },

    backButton: {
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        minHeight: 40,
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        color: "var(--fg)",
        cursor: "pointer",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
        boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
        fontSize: 12.5,
        fontWeight: 500,
        letterSpacing: "0.01em",
        outline: "none",
        transition: "border-color 140ms ease, box-shadow 140ms ease, background 140ms ease, opacity 140ms ease",
    },

    iconButton: {
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
        boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
        outline: "none",
        transition: "border-color 140ms ease, box-shadow 140ms ease, background 140ms ease, opacity 140ms ease",
    },

    buttonHover: {
        borderColor: "color-mix(in oklab, var(--hairline) 52%, var(--fg))",
        boxShadow: "0 10px 24px rgba(0,0,0,0.07)",
    },

    buttonActive: {
        boxShadow: "0 6px 14px rgba(0,0,0,0.05)",
        background: "color-mix(in oklab, var(--panel) 92%, var(--fg))",
    },

    backArrow: {
        display: "inline-block",
        opacity: 0.8,
        transform: "translateY(-0.5px)",
    },

    iconGlyph: {
        fontSize: 16,
        lineHeight: 1,
        opacity: 0.84,
    },

    content: {
        width: "100%",
        marginInline: "auto",
        paddingTop: 18,
    },

    paper: {
        borderRadius: 22,
        border: "1px solid var(--hairline)",
        background:
             "linear-gradient(180deg, color-mix(in oklab, var(--panel) 94%, transparent) 0%, var(--panel) 36%, var(--panel) 100%)",
        boxShadow: "0 22px 56px rgba(0,0,0,0.06)",
        padding: "28px 22px",
    },

    paperMotion: {
        transition: "box-shadow 180ms ease, border-color 180ms ease, background 180ms ease",
    },

    kicker: {
        fontSize: 10,
        lineHeight: 1.4,
        letterSpacing: "0.24em",
        textTransform: "uppercase",
        color: "var(--muted)",
        opacity: 0.88,
    },

    h1: {
        marginTop: 12,
        marginBottom: 0,
        color: "var(--fg)",
        fontSize: 34,
        lineHeight: 1.1,
        letterSpacing: "-0.025em",
        fontWeight: 600,
    },

    hairline: {
        height: 1,
        marginTop: 18,
        background: "var(--hairline)",
        opacity: 0.9,
    },

    prose: {
        paddingTop: 18,
        color: "var(--muted)",
        fontSize: 14,
        lineHeight: 1.9,
        letterSpacing: "0.01em",
    },

    p: {
        marginTop: 0,
        marginBottom: 15,
    },

    statement: {
        display: "grid",
        gridTemplateColumns: "8px 1fr",
        gap: 12,
        alignItems: "stretch",
        margin: "20px 0",
        padding: "16px",
        borderRadius: 18,
        border: "1px solid var(--hairline)",
        background:
             "linear-gradient(180deg, color-mix(in oklab, var(--panel) 90%, transparent) 0%, var(--panel) 100%)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.05)",
    },

    statementBar: {
        width: 3,
        height: "100%",
        borderRadius: 999,
        background: "var(--fg)",
        opacity: 0.16,
        marginLeft: 2,
    },

    statementText: {
        color: "var(--fg)",
        fontSize: 13.8,
        lineHeight: 1.8,
        letterSpacing: "0.01em",
    },

    footer: {
        paddingTop: 22,
    },

    footerLine: {
        height: 1,
        background: "var(--hairline)",
        opacity: 0.82,
        marginBottom: 12,
    },

    footerText: {
        color: "var(--muted)",
        fontSize: 12,
        opacity: 0.86,
    },
};