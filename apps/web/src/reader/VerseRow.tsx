// apps/web/src/reader/VerseRow.tsx
import React, { useCallback, useMemo, useState } from "react";
import type { Annotation } from "@biblia/annotation";
import type { BookRow } from "../api";
import { ReaderAnnotationOverlay } from "./ReaderAnnotationOverlay";
import type { SliceToken, SliceVerse } from "./types";
import { sx } from "./sx";
import { BookTitlePage } from "./BookTitlePage";

type Props = Readonly<{
    row: SliceVerse;
    book: BookRow | null;
    annotations?: readonly Annotation[];
}>;

function readMaybeString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function readMaybeNumber(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return Math.trunc(value);
}

function getRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getRowTranslationId(row: SliceVerse): string | null {
    const record = getRecord(row);
    return (
         readMaybeString(record.translationId) ??
         readMaybeString(record.translation_id) ??
         null
    );
}

function getRowVerseOrd(row: SliceVerse): number {
    const record = getRecord(row);
    return (
         readMaybeNumber(record.verseOrd) ??
         readMaybeNumber(record.verse_ord) ??
         0
    );
}

function getRowVerseKey(row: SliceVerse): string {
    const record = getRecord(row);
    return (
         readMaybeString(record.verseKey) ??
         readMaybeString(record.verse_key) ??
         `${row.bookId}.${row.chapter}.${row.verse}`
    );
}

function getTokenIndex(token: SliceToken, fallback: number): number {
    const record = getRecord(token);
    return (
         readMaybeNumber(record.tokenIndex) ??
         readMaybeNumber(record.token_index) ??
         fallback
    );
}

function getTokenKind(token: SliceToken): string | undefined {
    const record = getRecord(token);
    return (
         readMaybeString(record.tokenKind) ??
         readMaybeString(record.token_kind) ??
         undefined
    );
}

function getTokenCharStart(token: SliceToken): number | undefined {
    const record = getRecord(token);
    return (
         readMaybeNumber(record.charStart) ??
         readMaybeNumber(record.char_start) ??
         undefined
    );
}

function getTokenCharEnd(token: SliceToken): number | undefined {
    const record = getRecord(token);
    return (
         readMaybeNumber(record.charEnd) ??
         readMaybeNumber(record.char_end) ??
         undefined
    );
}

function getTokenText(token: SliceToken): string {
    const record = getRecord(token);
    return (
         readMaybeString(record.token) ??
         readMaybeString(record.text) ??
         ""
    );
}

function buildVerseAriaLabel(
     bookLabel: string,
     chapter: number,
     verse: number,
): string {
    return `${bookLabel} ${chapter}:${verse}`;
}

export const VerseRow = React.memo(function VerseRow(props: Props) {
    const { row, book, annotations = [] } = props;

    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);

    const verseOrd = getRowVerseOrd(row);
    const verseKey = getRowVerseKey(row);
    const translationId = getRowTranslationId(row);
    const tokens = Array.isArray(row.tokens) ? row.tokens : null;

    const isBookStart = row.chapter === 1 && row.verse === 1;
    const isChapterStart = row.verse === 1;
    const hasTokens = !!tokens && tokens.length > 0;
    const hasAnnotations = annotations.length > 0;

    const rootId = verseOrd > 0 ? `ord-${verseOrd}` : `verse-${verseKey}`;
    const verseTextId = `${rootId}-text`;

    const bookLabel = useMemo(
         () => readMaybeString(book?.name) ?? row.bookId,
         [book?.name, row.bookId],
    );

    const ariaLabel = useMemo(
         () => buildVerseAriaLabel(bookLabel, row.chapter, row.verse),
         [bookLabel, row.chapter, row.verse],
    );

    const rowStyle = useMemo<React.CSSProperties>(() => {
        return {
            ...sx.verseRow,
            ...(hovered ? sx.verseRowHover : {}),
            ...(focused ? sx.verseRowFocus : {}),
            position: "relative",
            isolation: "isolate",
        };
    }, [focused, hovered]);

    const onPointerEnter = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === "touch") return;
        setHovered(true);
    }, []);

    const onPointerLeave = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === "touch") return;
        setHovered(false);
    }, []);

    const onFocus = useCallback(() => {
        setFocused(true);
    }, []);

    const onBlur = useCallback(() => {
        setFocused(false);
    }, []);

    const verseBody = useMemo(() => {
        if (!hasTokens || !tokens) {
            return row.text ?? "";
        }

        return (
             <>
                 {tokens.map((token, index) => {
                     const tokenIndex = getTokenIndex(token, index);
                     const tokenKind = getTokenKind(token);
                     const charStart = getTokenCharStart(token);
                     const charEnd = getTokenCharEnd(token);
                     const tokenText = getTokenText(token);

                     return (
                          <span
                               key={`${verseOrd}:${tokenIndex}:${index}`}
                               data-token-index={tokenIndex}
                               data-token-kind={tokenKind}
                               data-token-char-start={charStart}
                               data-token-char-end={charEnd}
                          >
                            {tokenText}
                        </span>
                     );
                 })}
             </>
        );
    }, [hasTokens, row.text, tokens, verseOrd]);

    return (
         <div
              id={rootId}
              data-ord={verseOrd || undefined}
              data-verse-ord={verseOrd || undefined}
              data-verse-key={verseKey}
              data-book={row.bookId}
              data-chapter={row.chapter}
              data-verse={row.verse}
              data-translation-id={translationId ?? undefined}
              data-has-tokens={hasTokens ? "1" : "0"}
              style={sx.verseRowWrap ?? { padding: 0 }}
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
                  onPointerEnter={onPointerEnter}
                  onPointerLeave={onPointerLeave}
                  onFocus={onFocus}
                  onBlur={onBlur}
                  data-has-annotations={hasAnnotations ? "1" : "0"}
             >
                 <ReaderAnnotationOverlay annotations={annotations} />

                 <div style={sx.verseNum} aria-hidden="true">
                     {row.verse}
                 </div>

                 <div
                      id={verseTextId}
                      className="scripture"
                      style={sx.verseText}
                      data-verse-ord={verseOrd || undefined}
                      data-verse-key={verseKey}
                      data-translation-id={translationId ?? undefined}
                 >
                     {verseBody}
                 </div>
             </div>
         </div>
    );
});