// apps/web/src/reader/VerseRow.tsx
import React, { useCallback, useState } from "react";
import type { BookRow } from "../api";
import type { SliceVerse } from "./types";
import { sx } from "./sx";
import { BookTitlePage } from "./BookTitlePage";

export const VerseRow = React.memo(function VerseRow(props: { row: SliceVerse; book: BookRow | null }) {
    const { row, book } = props;

    const isBookStart = row.chapter === 1 && row.verse === 1;

    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);

    const onEnter = useCallback(() => setHovered(true), []);
    const onLeave = useCallback(() => setHovered(false), []);
    const onFocus = useCallback(() => setFocused(true), []);
    const onBlur = useCallback(() => setFocused(false), []);

    return (
        <div id={`ord-${row.verseOrd}`} style={{ padding: 0 }}>
            {isBookStart ? <BookTitlePage book={book} bookId={row.bookId} /> : null}

            <div
                style={{
                    ...sx.verseRow,
                    ...(hovered ? (sx as any).verseRowHover : null),
                    ...(focused ? (sx as any).verseRowFocus : null),
                }}
                onPointerEnter={onEnter}
                onPointerLeave={onLeave}
            >
                <div style={sx.verseNum}>{row.verse}</div>

                <div
                    className="scripture"
                    style={sx.verseText}
                    tabIndex={0}
                    onFocus={onFocus}
                    onBlur={onBlur}
                >
                    {row.text ?? ""}
                </div>
            </div>
        </div>
    );
});