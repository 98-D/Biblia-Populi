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
    const isChapterStart = row.verse === 1;

    // Keep these local, but make them hard to “thrash”:
    // - only set true if not already true
    // - only set false if not already false
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);

    // Hover is a mouse/pen affordance; avoid “sticky hover” on touch.
    const onEnter = useCallback((e: React.PointerEvent) => {
        if (e.pointerType === "touch") return;
        setHovered((v) => (v ? v : true));
    }, []);
    const onLeave = useCallback((e: React.PointerEvent) => {
        if (e.pointerType === "touch") return;
        setHovered((v) => (v ? false : v));
    }, []);

    const onFocus = useCallback(() => setFocused((v) => (v ? v : true)), []);
    const onBlur = useCallback(() => setFocused((v) => (v ? false : v)), []);

    const bookLabel = (book?.name ?? row.bookId).toString();
    const ariaLabel = useMemo(() => `${bookLabel} ${row.chapter}:${row.verse}`, [bookLabel, row.chapter, row.verse]);

    const verseTextId = `ord-${row.verseOrd}-text`;

    const rowStyle = useMemo<React.CSSProperties>(() => {
        const base = sx.verseRow;
        const h = hovered ? sx.verseRowHover : undefined;
        const f = focused ? sx.verseRowFocus : undefined;
        return { ...base, ...(h ?? {}), ...(f ?? {}) };
    }, [hovered, focused]);

    return (
        <div
            id={`ord-${row.verseOrd}`}
            data-ord={row.verseOrd}
            data-verse-key={row.verseKey}
            data-book={row.bookId}
            data-chapter={row.chapter}
            data-verse={row.verse}
            style={{ padding: 0 }}
        >
            {isBookStart ? <BookTitlePage book={book} bookId={row.bookId} /> : null}

            {isChapterStart ? (
                <div style={sx.chapterHeader}>
                    <div style={sx.chapterKicker}>CHAPTER</div>
                    <div style={sx.chapterTitle}>
                        {bookLabel} {row.chapter}
                    </div>
                </div>
            ) : null}

            {/* Make the *row* the focus target (not the inner text). */}
            <div
                role="article"
                aria-roledescription="verse"
                aria-label={ariaLabel}
                aria-describedby={verseTextId}
                tabIndex={0}
                style={rowStyle}
                onPointerEnter={onEnter}
                onPointerLeave={onLeave}
                onFocus={onFocus}
                onBlur={onBlur}
            >
                <div style={sx.verseNum} aria-hidden="true">
                    {row.verse}
                </div>

                <div id={verseTextId} className="scripture" style={sx.verseText}>
                    {row.text ?? ""}
                </div>
            </div>
        </div>
    );
});