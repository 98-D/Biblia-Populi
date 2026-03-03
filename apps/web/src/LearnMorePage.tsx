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
 * Learn More — a gentle, personal note
 * - warm and welcoming tone
 * - calm, spacious layout
 */
export function LearnMorePage(props: Props) {
    const { onBack, styles } = props;

    const [isNarrow, setIsNarrow] = useState<boolean>(() => {
        if (typeof window === "undefined") return true;
        return window.matchMedia("(max-width: 900px)").matches;
    });

    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia("(max-width: 900px)");
        const onChange = () => setIsNarrow(mq.matches);

        if (typeof mq.addEventListener === "function") {
            mq.addEventListener("change", onChange);
            return () => mq.removeEventListener("change", onChange);
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
        []
    );

    return (
        <main aria-label="Learn more" style={{ ...styles.page, ...sx.page }}>
            <div style={sx.container}>
                {/* Top bar */}
                <div style={sx.topBar}>
                    <button
                        type="button"
                        onClick={onBack}
                        style={{ ...sx.backBtn, ...(pressBack ? sx.backBtnPressed : {}) }}
                        aria-label="Back"
                        {...backHandlers}
                    >
                        <span aria-hidden style={sx.backArrow}>←</span>
                        <span>Back</span>
                    </button>
                    <div style={{ flex: 1 }} />
                </div>

                <section style={{ ...sx.content, maxWidth: maxW }}>
                    <div style={sx.kicker}>a note from the dev</div>
                    <h1 style={sx.h1}>Welcome to Biblia Populi</h1>
                    <div style={sx.hairline} />

                    <div style={sx.prose}>
                        <p style={sx.p}>
                            Biblia Populi simply means <strong>Bible for the people</strong>.
                        </p>

                        <p style={sx.p}>
                            I created this because I believe everyone should be able to open the Bible and read it in peace — no distractions, no paywalls, no one trying to steer you.
                        </p>

                        <p style={sx.p}>
                            My hope is to give you a calm, beautiful space where the Word can speak for itself. Just you and the text.
                        </p>

                        <div style={sx.quote}>
                            <div style={sx.quoteBar} aria-hidden />
                            <div style={sx.quoteText}>
                                Centered on <strong>Jesus Christ</strong> — crucified and risen.
                                That’s the heart of everything here.
                            </div>
                        </div>

                        <p style={sx.p}>
                            I started with the KJV because it’s a steady, well-loved translation.
                            Everything here is built to stay out of your way so the Scripture can stay front and center.
                        </p>

                        <p style={sx.p}>
                            You’ll find a clean reader, thoughtful search, and a few quiet tools to help you explore — all designed with care and simplicity.
                        </p>

                        <p style={sx.p}>
                            Whether you’re new to the Bible or have been reading it for years, I’m really glad you’re here.
                        </p>
                    </div>

                    <div style={sx.footer}>
                        <div style={sx.footerLine} />
                        <div style={sx.footerMuted}>
                            © {new Date().getFullYear()} Biblia Populi
                        </div>
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
        transition: "transform 160ms cubic-bezier(0.23, 1, 0.32, 1), opacity 160ms ease",
        fontSize: 12.8,
        letterSpacing: "0.01em",
    },
    backBtnPressed: {
        transform: "translateY(1px) scale(0.98)",
        opacity: 0.95,
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
        letterSpacing: "0.28em",
        textTransform: "uppercase",
        color: "var(--muted)",
        opacity: 0.85,
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
        borderRadius: 16,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
        color: "var(--fg)",
    },
    quoteBar: {
        width: 3,
        height: "100%",
        borderRadius: 999,
        background: "var(--fg)",
        opacity: 0.1,
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
        paddingTop: 28,
    },
    footerLine: {
        height: 1,
        background: "var(--hairline)",
        opacity: 0.8,
        marginBottom: 14,
    },
    footerMuted: {
        color: "var(--muted)",
        fontSize: 12,
        opacity: 0.85,
    },
};