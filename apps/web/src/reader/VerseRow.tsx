import React, { useCallback, useMemo, useState } from "react";
import type { Annotation } from "@biblia/annotation";
import type { BookRow } from "../api";
import { ReaderAnnotationOverlay } from "./ReaderAnnotationOverlay";
import type { SliceVerse } from "./types";
import { sx } from "./sx";
import { BookTitlePage } from "./BookTitlePage";

type Props = {
    row: SliceVerse;
    book: BookRow | null;
    annotations?: readonly Annotation[];
};

function readMaybeString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function getRowTranslationId(row: SliceVerse): string | null {
    const record = row as unknown as Record<string, unknown>;
    return (
        readMaybeString(record.translationId) ??
        readMaybeString(record.translation_id) ??
        null
    );
}

export const VerseRow = React.memo(function VerseRow(props: Props) {
    const { row, book, annotations = [] } = props;

    const isBookStart = row.chapter === 1 && row.verse === 1;
    const isChapterStart = row.verse === 1;

    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);

    const isInteractive = annotations.length > 0;
    const translationId = getRowTranslationId(row);
    const verseTextId = `ord-${row.verseOrd}-text`;

    const onEnter = useCallback((e: React.PointerEvent) => {
        if (e.pointerType === "touch") return;
        setHovered(true);
    }, []);

    const onLeave = useCallback((e: React.PointerEvent) => {
        if (e.pointerType === "touch") return;
        setHovered(false);
    }, []);

    const onFocus = useCallback(() => {
        setFocused(true);
    }, []);

    const onBlur = useCallback(() => {
        setFocused(false);
    }, []);

    const bookLabel = (book?.name ?? row.bookId).toString();
    const ariaLabel = useMemo(() => `${bookLabel} ${row.chapter}:${row.verse}`, [bookLabel, row.chapter, row.verse]);

    const rowStyle = useMemo<React.CSSProperties>(() => {
        const base = sx.verseRow;
        const hover = hovered ? sx.verseRowHover : undefined;
        const focus = focused ? sx.verseRowFocus : undefined;
        return {
            ...base,
            ...(hover ?? {}),
            ...(focus ?? {}),
            position: "relative",
            isolation: "isolate",
        };
    }, [hovered, focused]);

    const tokens = row.tokens ?? null;

    const verseBody = useMemo(() => {
        if (!tokens || tokens.length === 0) {
            return row.text ?? "";
        }

        return (
            <>
                {tokens.map((token) => {
                    const key = `${row.verseOrd}:${token.tokenIndex}`;
                    return (
                        <span
                            key={key}
                            data-token-index={token.tokenIndex}
                            data-token-kind={token.tokenKind ?? undefined}
                            data-token-char-start={token.charStart ?? undefined}
                            data-token-char-end={token.charEnd ?? undefined}
                        >
                            {token.token}
                        </span>
                    );
                })}
            </>
        );
    }, [tokens, row.text, row.verseOrd]);

    return (
        <div
            id={`ord-${row.verseOrd}`}
            data-ord={row.verseOrd}
            data-verse-ord={row.verseOrd}
            data-verse-key={row.verseKey}
            data-book={row.bookId}
            data-chapter={row.chapter}
            data-verse={row.verse}
            data-translation-id={translationId ?? undefined}
            data-has-tokens={tokens && tokens.length > 0 ? "1" : "0"}
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
                data-has-annotations={isInteractive ? "1" : "0"}
            >
                <ReaderAnnotationOverlay annotations={annotations} />

                <div style={sx.verseNum} aria-hidden="true">
                    {row.verse}
                </div>

                <div
                    id={verseTextId}
                    className="scripture"
                    style={sx.verseText}
                    data-verse-ord={row.verseOrd}
                    data-verse-key={row.verseKey}
                    data-translation-id={translationId ?? undefined}
                >
                    {verseBody}
                </div>
            </div>
        </div>
    );
});