// apps/web/src/reader/BookTitlePage.tsx
import React, { useMemo } from "react";
import type { BookRow } from "../api";

/**
 * Biblia.to — Book Title Page (premium + virtualizer-safe)
 *
 * Design goals:
 * - Predictable height + wrapping (TanStack Virtual friendly)
 * - No huge shadows/filters that explode paint cost
 * - Uses your actual font tokens (base.css): --font-serif / --font-sans
 * - Clean, “luxury card” with subtle ink + hairlines
 *
 * Notes:
 * - All text is short and wraps; no long unbroken runs.
 * - Uses color-mix tokens already present elsewhere in your app.
 */

function formatTestament(t: unknown): string {
    const v = String(t ?? "").trim().toUpperCase();
    if (v === "NT" || v === "NEW" || v.includes("NEW")) return "THE NEW TESTAMENT";
    if (v === "OT" || v === "OLD" || v.includes("OLD")) return "THE OLD TESTAMENT";
    return "HOLY SCRIPTURE";
}

function normalizeBookName(book: BookRow | null, bookId: string): string {
    const raw = (book?.name ?? bookId).toString().trim();
    return raw || bookId;
}

function upperWords(s: string): string {
    return s
        .trim()
        .replace(/\s+/g, " ")
        .toUpperCase();
}

function getBookTitleParts(book: BookRow | null, bookId: string): { prefix: string; main: string; subtitle?: string } {
    const raw = upperWords(normalizeBookName(book, bookId));

    if (raw === "PSALMS") return { prefix: "", main: "PSALMS" };
    if (raw === "PROVERBS") return { prefix: "THE BOOK OF", main: "PROVERBS" };

    if (["MATTHEW", "MARK", "LUKE", "JOHN"].includes(raw)) {
        return { prefix: "THE GOSPEL ACCORDING TO", main: raw };
    }

    if (raw === "ACTS" || raw === "ACTS OF THE APOSTLES") {
        return { prefix: "", main: "ACTS", subtitle: "OF THE APOSTLES" };
    }

    if (raw === "REVELATION" || raw === "THE REVELATION") {
        return { prefix: "THE REVELATION OF", main: "JOHN" };
    }

    // Epistles styling (optional flourish)
    if (raw.startsWith("1 ") || raw.startsWith("2 ") || raw.startsWith("3 ")) {
        return { prefix: "THE EPISTLE OF", main: raw };
    }

    return { prefix: "THE BOOK OF", main: raw };
}

export const BookTitlePage = React.memo(function BookTitlePage(props: { book: BookRow | null; bookId: string }) {
    const { book, bookId } = props;

    const displayName = useMemo(() => normalizeBookName(book, bookId), [book, bookId]);
    const testament = useMemo(() => formatTestament((book as any)?.testament), [book]);
    const { prefix, main, subtitle } = useMemo(() => getBookTitleParts(book, bookId), [book, bookId]);

    return (
        <section style={s.wrap} aria-label={`Book: ${displayName}`}>
            <div style={s.card}>
                {/* Top hairline */}
                <div style={s.hairlineTop} aria-hidden="true" />

                {/* Kicker */}
                <div style={s.kicker}>{testament}</div>

                {/* Title */}
                <div style={s.titleBlock}>
                    {prefix ? <div style={s.prefix}>{prefix}</div> : null}

                    <h1 style={s.main}>{main}</h1>

                    {subtitle ? <div style={s.subtitle}>{subtitle}</div> : null}

                    <div style={s.rule} aria-hidden="true" />

                    <div style={s.motto}>VERBUM DOMINI MANET IN AETERNUM</div>
                </div>

                {/* Bottom hairline */}
                <div style={s.hairlineBot} aria-hidden="true" />
            </div>
        </section>
    );
});

const s: Record<string, React.CSSProperties> = {
    wrap: {
        padding: "24px 12px 18px",
        display: "flex",
        justifyContent: "center",
        background: "transparent",
    },

    card: {
        width: "100%",
        maxWidth: 760,
        borderRadius: 20,
        padding: "18px 16px",
        background: "color-mix(in oklab, var(--card) 92%, var(--bg) 8%)",
        border: "1px solid color-mix(in oklab, var(--border) 78%, transparent)",
        boxShadow: "0 16px 44px color-mix(in oklab, black 14%, transparent), inset 0 1px 0 rgba(255,255,255,0.16)",
        overflow: "hidden",
        contain: "paint",
    },

    hairlineTop: {
        height: 1,
        background:
            "linear-gradient(to right, transparent, color-mix(in oklab, var(--border) 78%, transparent), transparent)",
        opacity: 0.95,
        marginBottom: 12,
    },
    hairlineBot: {
        height: 1,
        background:
            "linear-gradient(to right, transparent, color-mix(in oklab, var(--border) 72%, transparent), transparent)",
        opacity: 0.75,
        marginTop: 14,
    },

    kicker: {
        fontFamily: "var(--font-sans)",
        fontSize: 12,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: "color-mix(in oklab, var(--fg) 70%, var(--muted) 30%)",
        textAlign: "center",
        marginBottom: 12,
        userSelect: "none",
    },

    titleBlock: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "4px 0 2px",
    },

    prefix: {
        fontFamily: "var(--font-sans)",
        fontSize: 12.5,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "color-mix(in oklab, var(--fg) 72%, var(--muted) 28%)",
        textAlign: "center",
        userSelect: "none",
        maxWidth: 560,
        lineHeight: 1.25,
        padding: "0 6px",
    },

    main: {
        margin: 0,
        fontFamily: "var(--font-serif)",
        fontWeight: 760,
        fontSize: 34,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        textAlign: "center",
        color: "color-mix(in oklab, var(--fg) 92%, var(--muted) 8%)",
        lineHeight: 1.06,
        userSelect: "none",
        maxWidth: 660,
        padding: "0 6px",
        overflowWrap: "anywhere",
        textWrap: "balance",
    },

    subtitle: {
        fontFamily: "var(--font-serif)",
        fontSize: 16,
        fontWeight: 620,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "color-mix(in oklab, var(--fg) 78%, var(--muted) 22%)",
        textAlign: "center",
        userSelect: "none",
        maxWidth: 660,
        lineHeight: 1.12,
        padding: "0 8px",
        overflowWrap: "anywhere",
    },

    rule: {
        width: "min(520px, 86%)",
        height: 1,
        background: "color-mix(in oklab, var(--border) 75%, transparent)",
        opacity: 0.9,
        marginTop: 2,
    },

    motto: {
        marginTop: 8,
        fontFamily: "var(--font-sans)",
        fontSize: 11.5,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "color-mix(in oklab, var(--fg) 62%, var(--muted) 38%)",
        textAlign: "center",
        userSelect: "none",
        maxWidth: 620,
        lineHeight: 1.25,
        padding: "0 8px",
    },
};