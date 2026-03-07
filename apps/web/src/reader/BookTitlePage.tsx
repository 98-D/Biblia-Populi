// apps/web/src/reader/BookTitlePage.tsx
import React, { memo, useMemo } from "react";
import type { CSSProperties } from "react";
import type { BookRow } from "../api";

/**
 * Biblia.to — Book Title Page
 *
 * Hardened goals:
 * - smaller / calmer surface
 * - deterministic sizing for virtualization
 * - no expensive paint effects
 * - no `any`
 * - resilient against odd book/testament values
 */

type TitleParts = {
    prefix: string;
    main: string;
    subtitle?: string;
};

const WRAP_STYLE: CSSProperties = {
    padding: "16px 8px 12px",
    display: "flex",
    justifyContent: "center",
    background: "transparent",
};

const CARD_STYLE: CSSProperties = {
    width: "100%",
    maxWidth: 680,
    borderRadius: 16,
    padding: "14px 14px 12px",
    background: "color-mix(in oklab, var(--panel) 94%, var(--bg))",
    border: "1px solid color-mix(in oklab, var(--hairline) 90%, transparent)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
    overflow: "hidden",
    boxSizing: "border-box",
};

const HAIRLINE_TOP_STYLE: CSSProperties = {
    height: 1,
    marginBottom: 10,
    background:
         "linear-gradient(to right, transparent, color-mix(in oklab, var(--hairline) 94%, transparent), transparent)",
    opacity: 0.9,
};

const HAIRLINE_BOTTOM_STYLE: CSSProperties = {
    height: 1,
    marginTop: 12,
    background:
         "linear-gradient(to right, transparent, color-mix(in oklab, var(--hairline) 88%, transparent), transparent)",
    opacity: 0.7,
};

const KICKER_STYLE: CSSProperties = {
    marginBottom: 10,
    fontFamily: "var(--font-sans)",
    fontSize: 10,
    letterSpacing: "0.24em",
    textTransform: "uppercase",
    color: "var(--muted)",
    textAlign: "center",
    userSelect: "none",
};

const TITLE_BLOCK_STYLE: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "2px 0",
};

const PREFIX_STYLE: CSSProperties = {
    maxWidth: 520,
    padding: "0 6px",
    fontFamily: "var(--font-sans)",
    fontSize: 11,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "color-mix(in oklab, var(--fg) 74%, var(--muted))",
    textAlign: "center",
    lineHeight: 1.25,
    userSelect: "none",
    textWrap: "balance",
};

const MAIN_STYLE: CSSProperties = {
    margin: 0,
    maxWidth: 600,
    padding: "0 6px",
    fontFamily: "var(--font-serif)",
    fontWeight: 720,
    fontSize: 28,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    textAlign: "center",
    color: "var(--fg)",
    lineHeight: 1.05,
    userSelect: "none",
    overflowWrap: "anywhere",
    textWrap: "balance",
};

const SUBTITLE_STYLE: CSSProperties = {
    maxWidth: 600,
    padding: "0 8px",
    fontFamily: "var(--font-serif)",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "color-mix(in oklab, var(--fg) 78%, var(--muted))",
    textAlign: "center",
    lineHeight: 1.15,
    userSelect: "none",
    overflowWrap: "anywhere",
    textWrap: "balance",
};

const RULE_STYLE: CSSProperties = {
    width: "min(320px, 70%)",
    height: 1,
    marginTop: 2,
    background: "color-mix(in oklab, var(--hairline) 92%, transparent)",
    opacity: 0.9,
};

const MOTTO_STYLE: CSSProperties = {
    marginTop: 6,
    maxWidth: 520,
    padding: "0 8px",
    fontFamily: "var(--font-sans)",
    fontSize: 10,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "color-mix(in oklab, var(--fg) 60%, var(--muted))",
    textAlign: "center",
    lineHeight: 1.25,
    userSelect: "none",
};

function readTestament(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const v = value.trim().toUpperCase();
    if (!v) return null;
    return v;
}

function formatTestament(testament: unknown): string {
    const value = readTestament(testament);
    if (!value) return "HOLY SCRIPTURE";
    if (value === "NT" || value === "NEW" || value.includes("NEW")) {
        return "THE NEW TESTAMENT";
    }
    if (value === "OT" || value === "OLD" || value.includes("OLD")) {
        return "THE OLD TESTAMENT";
    }
    return "HOLY SCRIPTURE";
}

function normalizeWhitespace(value: string): string {
    return value.trim().replace(/\s+/g, " ");
}

function normalizeBookName(book: BookRow | null, bookId: string): string {
    const fromBook =
         book && typeof book.name === "string" ? normalizeWhitespace(book.name) : "";
    const fromId = normalizeWhitespace(bookId);
    return fromBook || fromId || "UNKNOWN";
}

function upperWords(value: string): string {
    return normalizeWhitespace(value).toUpperCase();
}

function getBookTitleParts(book: BookRow | null, bookId: string): TitleParts {
    const raw = upperWords(normalizeBookName(book, bookId));

    if (raw === "PSALMS") {
        return { prefix: "", main: "PSALMS" };
    }

    if (raw === "PROVERBS") {
        return { prefix: "THE BOOK OF", main: "PROVERBS" };
    }

    if (raw === "ACTS" || raw === "ACTS OF THE APOSTLES") {
        return { prefix: "", main: "ACTS", subtitle: "OF THE APOSTLES" };
    }

    if (raw === "REVELATION" || raw === "THE REVELATION") {
        return { prefix: "THE REVELATION OF", main: "JOHN" };
    }

    if (raw === "SONG OF SOLOMON" || raw === "SONG OF SONGS") {
        return { prefix: "THE SONG OF", main: "SOLOMON" };
    }

    if (raw === "MATTHEW" || raw === "MARK" || raw === "LUKE" || raw === "JOHN") {
        return { prefix: "THE GOSPEL ACCORDING TO", main: raw };
    }

    if (raw.startsWith("1 ") || raw.startsWith("2 ") || raw.startsWith("3 ")) {
        return { prefix: "THE EPISTLE OF", main: raw };
    }

    return { prefix: "THE BOOK OF", main: raw };
}

function getBookTestament(book: BookRow | null): unknown {
    if (!book) return null;
    const record = book as unknown as Record<string, unknown>;
    return record.testament ?? null;
}

export const BookTitlePage = memo(function BookTitlePage(props: {
    book: BookRow | null;
    bookId: string;
}) {
    const { book, bookId } = props;

    const displayName = useMemo(() => normalizeBookName(book, bookId), [book, bookId]);
    const testament = useMemo(
         () => formatTestament(getBookTestament(book)),
         [book],
    );
    const parts = useMemo(() => getBookTitleParts(book, bookId), [book, bookId]);

    return (
         <section style={WRAP_STYLE} aria-label={`Book: ${displayName}`}>
             <div style={CARD_STYLE}>
                 <div style={HAIRLINE_TOP_STYLE} aria-hidden="true" />

                 <div style={KICKER_STYLE}>{testament}</div>

                 <div style={TITLE_BLOCK_STYLE}>
                     {parts.prefix ? <div style={PREFIX_STYLE}>{parts.prefix}</div> : null}

                     <h1 style={MAIN_STYLE}>{parts.main}</h1>

                     {parts.subtitle ? (
                          <div style={SUBTITLE_STYLE}>{parts.subtitle}</div>
                     ) : null}

                     <div style={RULE_STYLE} aria-hidden="true" />
                     <div style={MOTTO_STYLE}>VERBUM DOMINI MANET IN AETERNUM</div>
                 </div>

                 <div style={HAIRLINE_BOTTOM_STYLE} aria-hidden="true" />
             </div>
         </section>
    );
});