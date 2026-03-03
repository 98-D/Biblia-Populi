// apps/web/src/reader/BookTitlePage.tsx
import React, { useMemo } from "react";
import type { BookRow } from "../api";

function formatTestament(t: unknown): string {
    const v = String(t ?? "").toUpperCase();
    if (v === "NT") return "THE NEW TESTAMENT";
    if (v === "OT") return "THE OLD TESTAMENT";
    return "HOLY SCRIPTURE";
}

function getBookTitleParts(book: BookRow | null, bookId: string) {
    const raw = (book?.name ?? bookId).toUpperCase().trim();

    // Traditional printed-Bible phrasing.
    if (raw === "PSALMS") return { prefix: "", main: "PSALMS" };
    if (["MATTHEW", "MARK", "LUKE", "JOHN"].includes(raw)) {
        return { prefix: "THE GOSPEL ACCORDING TO", main: raw };
    }
    if (raw === "REVELATION") return { prefix: "THE REVELATION OF", main: "JOHN" };

    // Common KJV headers use “THE FIRST/SECOND BOOK OF …” for some,
    // but we keep it simple unless you want a full canonical naming map.
    return { prefix: "THE BOOK OF", main: raw };
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

function centerLine(text: string, width: number): string {
    const t = text.trim();
    if (!t) return "";
    if (t.length >= width) return t;
    const pad = Math.floor((width - t.length) / 2);
    return " ".repeat(pad) + t;
}

function frameLine(content: string, width: number): string {
    // width is the total inside width, not counting the borders
    const c = content.length > width ? content.slice(0, width) : content;
    return `│${c}${" ".repeat(width - c.length)}│`;
}

function makeAsciiTitlePage(opts: { testament: string; prefix: string; main: string; width?: number }): string {
    const width = clamp(Math.floor(opts.width ?? 58), 42, 78);

    const top = `┌${"─".repeat(width)}┐`;
    const bot = `└${"─".repeat(width)}┘`;
    const sep = `├${"─".repeat(width)}┤`;

    const cross = [
        "     +     ",
        "    +++    ",
        "   + + +   ",
        "  +   +  ",
        " +     + ",
        "+       +",
        " +     + ",
        "  +   +  ",
        "   +++   ",
        "    +    ",
    ].map((l) => centerLine(l, width));

    const lines: string[] = [];
    lines.push(top);

    // breathable padding
    lines.push(frameLine("", width));
    for (const l of cross) lines.push(frameLine(l, width));
    lines.push(frameLine("", width));

    lines.push(sep);
    lines.push(frameLine(centerLine(opts.testament, width), width));
    lines.push(frameLine("", width));

    if (opts.prefix) {
        lines.push(frameLine(centerLine(opts.prefix, width), width));
        lines.push(frameLine("", width));
    }

    // Title with underline “rule”
    const title = centerLine(opts.main, width);
    lines.push(frameLine(title, width));
    lines.push(frameLine(centerLine("─".repeat(Math.min(opts.main.length, width)), width), width));
    lines.push(frameLine("", width));

    // small ornament
    lines.push(frameLine(centerLine("✶  ✶  ✶", width), width));
    lines.push(frameLine("", width));

    lines.push(bot);
    return lines.join("\n");
}

export const BookTitlePage = React.memo(function BookTitlePage(props: {
    book: BookRow | null;
    bookId: string;
}) {
    const { book, bookId } = props;

    const testament = useMemo(() => formatTestament(book?.testament), [book?.testament]);
    const { prefix, main } = useMemo(() => getBookTitleParts(book, bookId), [book, bookId]);

    // Terminal/printer vibe, but uses theme colors and won't “flashbang” dark mode.
    const asciiArt = useMemo(() => {
        return makeAsciiTitlePage({ testament, prefix, main, width: 58 });
    }, [testament, prefix, main]);

    return (
        <section style={s.wrap} aria-label={`Book: ${book?.name ?? bookId}`}>
            <div style={s.card}>
                <pre style={s.ascii}>{asciiArt}</pre>
            </div>
        </section>
    );
});

const s: Record<string, React.CSSProperties> = {
    wrap: {
        padding: "34px 12px 34px",
        display: "flex",
        justifyContent: "center",
        background: "transparent",
    },
    card: {
        maxWidth: 760,
        width: "100%",
        background: "color-mix(in oklab, var(--panel) 86%, #000 14%)",
        border: "1px solid color-mix(in oklab, var(--hairline) 70%, #000 30%)",
        borderRadius: 18,
        padding: "22px 18px",
        boxShadow: "0 14px 40px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.20)",
        overflow: "hidden",
    },
    ascii: {
        fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        fontSize: 13,
        lineHeight: 1.15,
        color: "color-mix(in oklab, var(--fg) 82%, var(--muted) 18%)",
        textAlign: "left",
        whiteSpace: "pre",
        margin: 0,
        letterSpacing: "0.2px",
        userSelect: "none",
        // subtle “ink”
        textShadow: "0 1px 0 rgba(0,0,0,0.18)",
    },
};