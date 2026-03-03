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

const MQ_NARROW = "(max-width: 900px)";

function useMediaQuery(query: string, defaultValue = true): boolean {
    const [matches, setMatches] = useState<boolean>(() => {
        if (typeof window === "undefined") return defaultValue;
        return window.matchMedia(query).matches;
    });

    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia(query);
        const onChange = () => setMatches(mq.matches);

        onChange();
        if (typeof mq.addEventListener === "function") {
            mq.addEventListener("change", onChange);
            return () => mq.removeEventListener("change", onChange);
        }

        // Safari < 14
        // eslint-disable-next-line deprecation/deprecation
        mq.addListener(onChange);
        // eslint-disable-next-line deprecation/deprecation
        return () => mq.removeListener(onChange);
    }, [query]);

    return matches;
}

function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState<boolean>(() => {
        if (typeof window === "undefined") return false;
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    });

    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const onChange = () => setReduced(mq.matches);

        onChange();
        if (typeof mq.addEventListener === "function") {
            mq.addEventListener("change", onChange);
            return () => mq.removeEventListener("change", onChange);
        }

        // eslint-disable-next-line deprecation/deprecation
        mq.addListener(onChange);
        // eslint-disable-next-line deprecation/deprecation
        return () => mq.removeListener(onChange);
    }, []);

    return reduced;
}

type Particle = {
    id: string;
    leftPct: number;
    topPct: number;
    sizePx: number;
    durMs: number;
    delayMs: number;
    driftPx: number;
    blurPx: number;
    alpha: number;
};

function rand(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

function makeParticles(count: number): Particle[] {
    const out: Particle[] = [];
    for (let i = 0; i < count; i++) {
        const id = `p_${i}_${Math.random().toString(16).slice(2)}`;
        out.push({
            id,
            leftPct: rand(6, 94),
            topPct: rand(6, 94),
            sizePx: rand(2.2, 5.6),
            durMs: rand(5200, 9800),
            delayMs: rand(0, 2400),
            driftPx: rand(10, 26),
            blurPx: rand(0.6, 2.2),
            alpha: rand(0.08, 0.16),
        });
    }
    return out;
}

/**
 * Learn More — a gentle, personal note
 * - warm + welcoming
 * - calm, paper-like layout
 * - subtle entrance + micro-interactions + soft idle particles (respects reduced motion)
 */
export function LearnMorePage(props: Props) {
    const { onBack, styles } = props;

    const isNarrow = useMediaQuery(MQ_NARROW, true);
    const maxW = isNarrow ? 680 : 740;

    const reducedMotion = useReducedMotion();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const id = window.setTimeout(() => setMounted(true), 10);
        return () => window.clearTimeout(id);
    }, []);

    const [pressBack, setPressBack] = useState(false);
    const [hoverBack, setHoverBack] = useState(false);

    const backHandlers = useMemo(
        () => ({
            onPointerDown: () => setPressBack(true),
            onPointerUp: () => setPressBack(false),
            onPointerCancel: () => setPressBack(false),
            onPointerLeave: () => setPressBack(false),
            onMouseEnter: () => setHoverBack(true),
            onMouseLeave: () => setHoverBack(false),
        }),
        [],
    );

    const paperAnim: React.CSSProperties = useMemo(() => {
        if (reducedMotion) return {};
        return mounted ? sx.paperEnter : sx.paperPre;
    }, [mounted, reducedMotion]);

    const kickerAnim: React.CSSProperties = useMemo(() => {
        if (reducedMotion) return {};
        return mounted ? sx.kickerEnter : sx.kickerPre;
    }, [mounted, reducedMotion]);

    const titleAnim: React.CSSProperties = useMemo(() => {
        if (reducedMotion) return {};
        return mounted ? sx.h1Enter : sx.h1Pre;
    }, [mounted, reducedMotion]);

    const quoteAnim: React.CSSProperties = useMemo(() => {
        if (reducedMotion) return {};
        return mounted ? sx.quoteEnter : sx.quotePre;
    }, [mounted, reducedMotion]);

    const backBtnFx: React.CSSProperties = useMemo(() => {
        if (reducedMotion) return {};
        if (pressBack) return sx.backBtnPressed;
        if (hoverBack) return sx.backBtnHover;
        return {};
    }, [hoverBack, pressBack, reducedMotion]);

    // Soft idle particles that sit *behind* the paper card.
    const particles = useMemo(() => {
        if (reducedMotion) return [] as Particle[];
        // Fewer particles on narrow screens to keep it subtle + cheap.
        return makeParticles(isNarrow ? 10 : 14);
    }, [isNarrow, reducedMotion]);

    return (
        <main aria-label="Learn more" style={{ ...styles.page, ...sx.page }}>
            <div style={sx.container}>
                {/* Sticky top bar */}
                <header style={sx.topBar}>
                    <button
                        type="button"
                        onClick={onBack}
                        style={{ ...sx.backBtn, ...backBtnFx }}
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

                <section style={{ ...sx.content, maxWidth: maxW }}>
                    {/* Ambient layer */}
                    {!reducedMotion && (
                        <div aria-hidden style={sx.ambientWrap}>
                            <div style={sx.ambientGlowA} />
                            <div style={sx.ambientGlowB} />
                            <div style={sx.particleField}>
                                {particles.map((p) => (
                                    <span
                                        key={p.id}
                                        style={{
                                            ...sx.particle,
                                            left: `${p.leftPct}%`,
                                            top: `${p.topPct}%`,
                                            width: p.sizePx,
                                            height: p.sizePx,
                                            opacity: p.alpha,
                                            filter: `blur(${p.blurPx}px)`,
                                            animationDuration: `${p.durMs}ms`,
                                            animationDelay: `${p.delayMs}ms`,
                                            ["--drift" as any]: `${p.driftPx}px`,
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    <div style={{ ...sx.paper, ...paperAnim }}>
                        <div style={{ ...sx.kicker, ...kickerAnim }}>a note from the dev</div>
                        <h1 style={{ ...sx.h1, ...titleAnim }}>Welcome to Biblia Populi</h1>
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

                            <div style={{ ...sx.quote, ...quoteAnim }} role="note" aria-label="Core statement">
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

            {/* Local keyframes (kept inline, no global CSS dependency) */}
            <style>
                {`
          @keyframes bpFloatDrift {
            0%   { transform: translate3d(0px, 0px, 0); }
            45%  { transform: translate3d(var(--drift, 16px), -10px, 0); }
            100% { transform: translate3d(0px, 0px, 0); }
          }
          @keyframes bpPulseSoft {
            0%   { transform: translateZ(0) scale(1); opacity: 0.45; }
            50%  { transform: translateZ(0) scale(1.06); opacity: 0.62; }
            100% { transform: translateZ(0) scale(1); opacity: 0.45; }
          }
          @media (prefers-reduced-motion: reduce) {
            .bp-particle { animation: none !important; }
          }
        `}
            </style>
        </main>
    );
}

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
        transition:
            "transform 160ms cubic-bezier(0.23, 1, 0.32, 1), opacity 160ms ease, box-shadow 160ms ease, border-color 160ms ease, filter 160ms ease",
        fontSize: 12.8,
        letterSpacing: "0.01em",
        outline: "none",
    },
    backBtnHover: {
        transform: "translateY(-1px)",
        borderColor: "color-mix(in oklab, var(--hairline) 55%, var(--fg))",
        boxShadow: "0 10px 26px rgba(0,0,0,0.08)",
        filter: "saturate(1.02)",
    },
    backBtnPressed: {
        transform: "translateY(1px) scale(0.98)",
        opacity: 0.95,
        boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
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

    // Ambient wrapper sits behind the paper (zIndex lower), doesn't capture clicks.
    ambientWrap: {
        position: "absolute",
        inset: -24,
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
        borderRadius: 26,
    },
    ambientGlowA: {
        position: "absolute",
        left: "8%",
        top: "12%",
        width: 260,
        height: 260,
        borderRadius: 999,
        background: "color-mix(in oklab, var(--fg) 6%, transparent)",
        filter: "blur(28px)",
        opacity: 0.18,
        animation: "bpPulseSoft 8200ms ease-in-out infinite",
    },
    ambientGlowB: {
        position: "absolute",
        right: "8%",
        bottom: "10%",
        width: 320,
        height: 320,
        borderRadius: 999,
        background: "color-mix(in oklab, var(--fg) 5%, transparent)",
        filter: "blur(34px)",
        opacity: 0.12,
        animation: "bpPulseSoft 9800ms ease-in-out infinite",
    },
    particleField: {
        position: "absolute",
        inset: 0,
    },
    particle: {
        position: "absolute",
        borderRadius: 999,
        background: "var(--fg)",
        mixBlendMode: "soft-light",
        // "soft dust" look
        boxShadow: "0 0 0 1px color-mix(in oklab, var(--fg) 6%, transparent)",
        animationName: "bpFloatDrift",
        animationTimingFunction: "ease-in-out",
        animationIterationCount: "infinite",
        willChange: "transform",
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
        willChange: "transform, opacity, filter",
    },

    // Entrance anim states
    paperPre: {
        opacity: 0,
        transform: "translateY(8px) scale(0.995)",
        filter: "blur(2px)",
    },
    paperEnter: {
        opacity: 1,
        transform: "translateY(0) scale(1)",
        filter: "blur(0px)",
        transition:
            "opacity 520ms cubic-bezier(0.22, 1, 0.36, 1), transform 520ms cubic-bezier(0.22, 1, 0.36, 1), filter 520ms cubic-bezier(0.22, 1, 0.36, 1)",
    },

    kicker: {
        fontSize: 10,
        letterSpacing: "0.28em",
        textTransform: "uppercase",
        color: "var(--muted)",
        opacity: 0.86,
        willChange: "transform, opacity",
    },
    kickerPre: {
        opacity: 0,
        transform: "translateY(6px)",
    },
    kickerEnter: {
        opacity: 0.86,
        transform: "translateY(0)",
        transition: "opacity 520ms cubic-bezier(0.22, 1, 0.36, 1) 60ms, transform 520ms cubic-bezier(0.22, 1, 0.36, 1) 60ms",
    },

    h1: {
        marginTop: 12,
        marginBottom: 0,
        fontSize: 34,
        lineHeight: 1.12,
        letterSpacing: "-0.02em",
        willChange: "transform, opacity",
    },
    h1Pre: {
        opacity: 0,
        transform: "translateY(8px)",
    },
    h1Enter: {
        opacity: 1,
        transform: "translateY(0)",
        transition:
            "opacity 620ms cubic-bezier(0.22, 1, 0.36, 1) 90ms, transform 620ms cubic-bezier(0.22, 1, 0.36, 1) 90ms",
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
        willChange: "transform, opacity",
    },
    quotePre: {
        opacity: 0,
        transform: "translateY(8px)",
    },
    quoteEnter: {
        opacity: 1,
        transform: "translateY(0)",
        transition:
            "opacity 620ms cubic-bezier(0.22, 1, 0.36, 1) 150ms, transform 620ms cubic-bezier(0.22, 1, 0.36, 1) 150ms",
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