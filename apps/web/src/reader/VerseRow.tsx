// apps/web/src/reader/VerseRow.tsx
import React, { useCallback, useMemo, useState } from "react";
import type { BookRow } from "../api";
import type { SliceVerse } from "./types";
import { sx } from "./sx";
import { BookTitlePage } from "./BookTitlePage";

type Props = {
    row: SliceVerse;
    book: BookRow | null;
};

export const VerseRow = React.memo(function VerseRow({ row, book }: Props) {
    const isBookStart = row.chapter === 1 && row.verse === 1;

    // Keep these local, but make them hard to “thrash”:
    // - only set true if not already true
    // - only set false if not already false
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);

    const onEnter = useCallback(() => setHovered((v) => (v ? v : true)), []);
    const onLeave = useCallback(() => setHovered((v) => (v ? false : v)), []);
    const onFocus = useCallback(() => setFocused((v) => (v ? v : true)), []);
    const onBlur = useCallback(() => setFocused((v) => (v ? false : v)), []);

    const ariaLabel = useMemo(() => {
        const bookLabel = (book?.name ?? row.bookId).toString();
        const txt = (row.text ?? "").toString().trim();
        // Keep it useful but not absurdly long in screen readers.
        const snippet = txt.length > 160 ? `${txt.slice(0, 160)}…` : txt;
        return `${bookLabel} ${row.chapter}:${row.verse}. ${snippet}`;
    }, [book?.name, row.bookId, row.chapter, row.verse, row.text]);

    return (
        <div id={`ord-${row.verseOrd}`} data-ord={row.verseOrd} style={{ padding: 0 }}>
            {isBookStart ? <BookTitlePage book={book} bookId={row.bookId} /> : null}

            {/* Make the *row* the focus target (not the inner text). */}
            <div
                role="article"
                aria-label={ariaLabel}
                tabIndex={0}
                style={{
                    ...sx.verseRow,
                    ...(hovered ? (sx as any).verseRowHover : null),
                    ...(focused ? (sx as any).verseRowFocus : null),
                }}
                onPointerEnter={onEnter}
                onPointerLeave={onLeave}
                onFocus={onFocus}
                onBlur={onBlur}
            >
                <div style={sx.verseNum} aria-hidden="true">
                    {row.verse}
                </div>

                <div className="scripture" style={sx.verseText}>
                    {row.text ?? ""}
                </div>
            </div>
        </div>
    );
});