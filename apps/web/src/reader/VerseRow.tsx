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

type TokenMeta = Readonly<{
    tokenIndex: number;
    tokenKind?: string;
    charStart?: number;
    charEnd?: number;
    text: string;
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
    return value != null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getRowTranslationId(row: SliceVerse): string | null {
    const record = getRecord(row);
    return readMaybeString(record.translationId) ?? readMaybeString(record.translation_id) ?? null;
}

function getRowVerseOrd(row: SliceVerse): number {
    const record = getRecord(row);
    return readMaybeNumber(record.verseOrd) ?? readMaybeNumber(record.verse_ord) ?? 0;
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
    return readMaybeNumber(record.tokenIndex) ?? readMaybeNumber(record.token_index) ?? fallback;
}

function getTokenKind(token: SliceToken): string | undefined {
    const record = getRecord(token);
    return readMaybeString(record.tokenKind) ?? readMaybeString(record.token_kind) ?? undefined;
}

function getTokenCharStart(token: SliceToken): number | undefined {
    const record = getRecord(token);
    return readMaybeNumber(record.charStart) ?? readMaybeNumber(record.char_start) ?? undefined;
}

function getTokenCharEnd(token: SliceToken): number | undefined {
    const record = getRecord(token);
    return readMaybeNumber(record.charEnd) ?? readMaybeNumber(record.char_end) ?? undefined;
}

function getTokenText(token: SliceToken): string {
    const record = getRecord(token);
    return readMaybeString(record.token) ?? readMaybeString(record.text) ?? "";
}

function buildVerseAriaLabel(bookLabel: string, chapter: number, verse: number): string {
    return `${bookLabel} ${chapter}:${verse}`;
}

function buildVerseTextPlain(row: SliceVerse, tokens: readonly TokenMeta[] | null): string {
    if (tokens && tokens.length > 0) {
        return tokens.map((token) => token.text).join("");
    }
    return row.text ?? "";
}

function normalizeTokens(row: SliceVerse): readonly TokenMeta[] | null {
    if (!Array.isArray(row.tokens) || row.tokens.length === 0) return null;

    return row.tokens.map((token, index) => ({
        tokenIndex: getTokenIndex(token, index),
        tokenKind: getTokenKind(token),
        charStart: getTokenCharStart(token),
        charEnd: getTokenCharEnd(token),
        text: getTokenText(token),
    }));
}

function shouldHideTokenFromAT(tokenKind: string | undefined): boolean {
    return tokenKind === "SPACE" || tokenKind === "LINEBREAK";
}

export const VerseRow = React.memo(function VerseRow(props: Props) {
    const { row, book, annotations = [] } = props;

    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);

    const verseOrd = useMemo(() => getRowVerseOrd(row), [row]);
    const verseKey = useMemo(() => getRowVerseKey(row), [row]);
    const translationId = useMemo(() => getRowTranslationId(row), [row]);

    const normalizedTokens = useMemo(() => normalizeTokens(row), [row]);
    const hasTokens = !!normalizedTokens && normalizedTokens.length > 0;
    const hasAnnotations = annotations.length > 0;

    const isBookStart = row.chapter === 1 && row.verse === 1;
    const isChapterStart = row.verse === 1;

    const rootId = verseOrd > 0 ? `ord-${verseOrd}` : `verse-${verseKey}`;
    const verseTextId = `${rootId}-text`;

    const bookLabel = useMemo(() => readMaybeString(book?.name) ?? row.bookId, [book?.name, row.bookId]);

    const ariaLabel = useMemo(
         () => buildVerseAriaLabel(bookLabel, row.chapter, row.verse),
         [bookLabel, row.chapter, row.verse],
    );

    const plainVerseText = useMemo(
         () => buildVerseTextPlain(row, normalizedTokens),
         [normalizedTokens, row],
    );

    const rowStyle = useMemo<React.CSSProperties>(() => {
        const isSelected = hasAnnotations;
        return {
            ...sx.verseRow,
            ...(hovered ? sx.verseRowHover : {}),
            ...(focused ? sx.verseRowFocus : {}),
            ...(isSelected ? sx.verseRowSelected : {}),
            position: "relative",
            isolation: "isolate",
            cursor: "text",
        };
    }, [focused, hasAnnotations, hovered]);

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

    const onMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        if (event.defaultPrevented) return;
        if (event.button !== 0) return;
        if (event.detail > 1) return;

        const target = event.target as HTMLElement | null;
        if (!target) return;

        const interactive = target.closest(
             "button, a, input, textarea, select, summary, [role='button'], [contenteditable='true']",
        );
        if (interactive) return;

        event.currentTarget.focus({ preventScroll: true });
    }, []);

    const verseBody = useMemo(() => {
        if (!hasTokens || !normalizedTokens) {
            return row.text ?? "";
        }

        return (
             <>
                 {normalizedTokens.map((token, index) => {
                     const isWhitespaceOnly =
                          token.tokenKind === "SPACE" ||
                          token.tokenKind === "LINEBREAK" ||
                          token.text.trim().length === 0;

                     return (
                          <span
                               key={`${verseOrd}:${token.tokenIndex}:${index}`}
                               data-token-index={token.tokenIndex}
                               data-token-kind={token.tokenKind}
                               data-token-char-start={token.charStart}
                               data-token-char-end={token.charEnd}
                               aria-hidden={shouldHideTokenFromAT(token.tokenKind) ? true : undefined}
                               style={isWhitespaceOnly ? undefined : tokenSpanStyle}
                          >
                            {token.text}
                        </span>
                     );
                 })}
             </>
        );
    }, [hasTokens, normalizedTokens, row.text, verseOrd]);

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
              style={sx.verseRowWrap}
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
                  onMouseDown={onMouseDown}
                  data-has-annotations={hasAnnotations ? "1" : "0"}
                  data-selected={hasAnnotations ? "1" : "0"}
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
                      aria-label={plainVerseText}
                 >
                     {verseBody}
                 </div>
             </div>
         </div>
    );
});

const tokenSpanStyle: React.CSSProperties = {
    whiteSpace: "pre-wrap",
};