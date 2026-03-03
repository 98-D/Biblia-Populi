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
    // Traditional biblical phrasing (exactly as in centuries-old printed Bibles)
    if (raw === "PSALMS") {
        return { prefix: "", main: "PSALMS" };
    }
    if (["MATTHEW", "MARK", "LUKE", "JOHN"].includes(raw)) {
        return { prefix: "THE GOSPEL ACCORDING TO", main: raw };
    }
    if (raw === "REVELATION") {
        return { prefix: "THE REVELATION TO", main: "JOHN" };
    }
    return { prefix: "THE BOOK OF", main: raw };
}

export const BookTitlePage = React.memo(function BookTitlePage(props: {
    book: BookRow | null;
    bookId: string;
}) {
    const { book, bookId } = props;

    const testament = useMemo(() => formatTestament(book?.testament), [book?.testament]);
    const { prefix, main } = useMemo(() => getBookTitleParts(book, bookId), [book, bookId]);

    // Pure ASCII art title page (terminal / old-school Bible printer vibe)
    const asciiArt = useMemo(() => {
        const cross = `
     +
    +++
   + + +
  +   +
 +     +
+       +
 +     +
  +   +
   +++
    +
     +
`.trim();

        const topDivider = "=".repeat(60);
        const bottomDivider = "=".repeat(60);
        const ornament = "* * *   * * *   * * *";

        const lines: string[] = [];

        lines.push(cross);
        lines.push("");
        lines.push(testament.padStart(30 + Math.floor(testament.length / 2)));
        lines.push(topDivider);
        lines.push("");

        if (prefix) {
            lines.push(prefix);
            lines.push("");
        }

        // Big title — centered with ASCII "shadow" effect
        const titleLine = main.padStart(30 + Math.floor(main.length / 2));
        lines.push(titleLine);
        lines.push("".padStart(titleLine.length, "-")); // underline

        lines.push("");
        lines.push(ornament);
        lines.push("");
        lines.push(bottomDivider);

        return lines.join("\n");
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
        padding: "40px 12px 40px",
        display: "flex",
        justifyContent: "center",
        background: "#111",
    },
    card: {
        maxWidth: "720px",
        width: "100%",
        background: "#000",
        border: "4px double #ccc",
        padding: "32px 24px",
        boxShadow: "0 0 0 8px #222, inset 0 0 40px rgba(255,255,255,0.08)",
    },
    ascii: {
        fontFamily: "'Courier New', monospace",
        fontSize: "15px",
        lineHeight: "1.1",
        color: "#ddd",
        textAlign: "center",
        whiteSpace: "pre",
        margin: 0,
        letterSpacing: "0.5px",
        textShadow: "0 0 4px #fff",
    },
};