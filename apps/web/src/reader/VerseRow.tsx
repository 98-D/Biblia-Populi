// apps/web/src/reader/VerseRow.tsx
import React, { useCallback, useState } from "react";
import type { BookRow } from "../api";
import type { SliceVerse } from "./types";
import { sx } from "./sx";

export const VerseRow = React.memo(function VerseRow(props: { row: SliceVerse; book: BookRow | null }) {
    const { row, book } = props;

    const isChapterStart = row.verse === 1;
    const isBookStart = row.chapter === 1 && row.verse === 1;

    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);

    const onEnter = useCallback(() => setHovered(true), []);
    const onLeave = useCallback(() => setHovered(false), []);
    const onFocus = useCallback(() => setFocused(true), []);
    const onBlur = useCallback(() => setFocused(false), []);

    return (
        <div id={`ord-${row.verseOrd}`} style={{ padding: 0 }}>
            {isBookStart ? (
                <div style={sx.bookHeader}>
                    <div style={sx.bookKicker}>{book?.testament ?? ""}</div>
                    <div style={sx.bookTitle}>{book?.name ?? row.bookId}</div>
                </div>
            ) : null}

            {isChapterStart ? (
                <div style={sx.chapterHeader}>
                    <div style={sx.chapterKicker}>SCRIPTURE</div>
                    <div style={sx.chapterTitle}>
                        {book?.name ?? row.bookId} {row.chapter}
                    </div>
                </div>
            ) : null}

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

                {/* Focus target: gives keyboard users a real affordance without changing layout */}
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