// apps/web/src/reader/VerseRow.tsx
import React, { memo, useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Annotation } from "@biblia/annotation";
import type { BookRow } from "../api";
import { ReaderAnnotationOverlay } from "./ReaderAnnotationOverlay";
import type { SliceToken, SliceVerse } from "./types";
import { BookTitlePage } from "./BookTitlePage";

type Props = Readonly<{
    row: SliceVerse;
    book: BookRow | null;
    annotations?: readonly Annotation[];
}>;

type TokenKind = SliceToken["tokenKind"] | string;

type TokenMeta = Readonly<{
    key: string;
    sourceIndex: number;
    tokenIndex: number;
    tokenKind?: TokenKind;
    charStart?: number;
    charEnd?: number;
    text: string;
}>;

type VerseMeta = Readonly<{
    verseOrd: number;
    verseKey: string;
    translationId: string | null;

    normalizedTokens: readonly TokenMeta[] | null;
    plainVerseText: string;
    hasTokens: boolean;

    isBookStart: boolean;
    isChapterStart: boolean;

    bookLabel: string;
    ariaLabel: string;

    rootId: string;
    verseTextId: string;

    showBookTitlePage: boolean;
    showChapterKick: boolean;
    showInlineBookLabel: boolean;
}>;

const EMPTY_ANNOTATIONS: readonly Annotation[] = Object.freeze([]);

const ROW_WRAP_STYLE: CSSProperties = Object.freeze({
    position: "relative",
    width: "100%",
    boxSizing: "border-box",
    paddingBlock: 4,
});

const BOOK_HEADING_WRAP_STYLE: CSSProperties = Object.freeze({
    paddingTop: 10,
    paddingBottom: 10,
});

const CARD_STYLE: CSSProperties = Object.freeze({
    position: "relative",
    borderRadius: 16,
    padding: "13px 14px 13px 44px",
    minHeight: 54,
    boxSizing: "border-box",
    isolation: "isolate",
});

const TEXT_ROW_STYLE: CSSProperties = Object.freeze({
    position: "relative",
    zIndex: 1,
    minWidth: 0,
    lineHeight: "var(--bpScriptureLeading, 1.72)",
    fontFamily: "var(--bpScriptureFont, inherit)",
    fontSize: "var(--bpScriptureSize, 18px)",
    fontWeight: "var(--bpScriptureWeight, 400)",
    color: "var(--fg)",
    overflowWrap: "anywhere",
    wordBreak: "normal",
});

const VERSE_NUM_STYLE: CSSProperties = Object.freeze({
    position: "absolute",
    left: 12,
    top: 13,
    width: 22,
    textAlign: "right",
    fontSize: 12,
    lineHeight: 1.2,
    color: "var(--muted)",
    userSelect: "none",
    WebkitUserSelect: "none",
    pointerEvents: "none",
    fontVariantNumeric: "tabular-nums",
});

const CHAPTER_KICK_STYLE: CSSProperties = Object.freeze({
    display: "inline-block",
    marginRight: 8,
    fontSize: "1.2em",
    lineHeight: 1,
    fontWeight: 760,
    verticalAlign: "baseline",
    color: "var(--fg)",
    userSelect: "none",
    WebkitUserSelect: "none",
    pointerEvents: "none",
});

const INLINE_BOOK_LABEL_STYLE: CSSProperties = Object.freeze({
    display: "block",
    marginBottom: 10,
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--muted)",
    userSelect: "none",
    WebkitUserSelect: "none",
    pointerEvents: "none",
});

const TOKEN_BASE_STYLE: CSSProperties = Object.freeze({
    whiteSpace: "pre-wrap",
    userSelect: "text",
    WebkitUserSelect: "text",
    position: "relative",
    zIndex: 1,
});

const TOKEN_MARKER_STYLE: CSSProperties = Object.freeze({
    ...TOKEN_BASE_STYLE,
    opacity: 0.82,
});

function readMaybeTrimmedString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function readRawString(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

function readMaybeNumber(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    return Math.trunc(value);
}

function readMaybeBool(value: unknown): boolean | null {
    return typeof value === "boolean" ? value : null;
}

function getRecord(value: unknown): Record<string, unknown> {
    return value != null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getBookDisplayName(book: BookRow | null, fallback: string): string {
    if (!book) return fallback;

    const record = getRecord(book);
    return (
        readMaybeTrimmedString(record.name) ??
        readMaybeTrimmedString(record.title) ??
        readMaybeTrimmedString(record.shortName) ??
        readMaybeTrimmedString(record.short_name) ??
        readMaybeTrimmedString(record.label) ??
        fallback
    );
}

function getRowBookId(row: SliceVerse): string {
    const record = getRecord(row);
    return readMaybeTrimmedString(record.bookId) ?? readMaybeTrimmedString(record.book_id) ?? row.bookId;
}

function getRowVerseOrd(row: SliceVerse): number {
    const record = getRecord(row);
    return readMaybeNumber(record.verseOrd) ?? readMaybeNumber(record.verse_ord) ?? 0;
}

function getRowVerseKey(row: SliceVerse): string {
    const record = getRecord(row);
    return (
        readMaybeTrimmedString(record.verseKey) ??
        readMaybeTrimmedString(record.verse_key) ??
        `${getRowBookId(row)}.${row.chapter}.${row.verse}`
    );
}

function getRowTranslationId(row: SliceVerse): string | null {
    const record = getRecord(row);
    return readMaybeTrimmedString(record.translationId) ?? readMaybeTrimmedString(record.translation_id) ?? null;
}

function getRowIsBookStart(row: SliceVerse): boolean {
    const record = getRecord(row);
    return (
        readMaybeBool(record.isBookStart) ??
        readMaybeBool(record.is_book_start) ??
        (row.chapter === 1 && row.verse === 1)
    );
}

function getRowIsChapterStart(row: SliceVerse): boolean {
    const record = getRecord(row);
    return (
        readMaybeBool(record.isChapterStart) ??
        readMaybeBool(record.is_chapter_start) ??
        row.verse === 1
    );
}

function getRowPlainText(row: SliceVerse): string {
    const record = getRecord(row);
    return readRawString(record.text) ?? row.text ?? "";
}

function getTokenIndex(token: SliceToken, fallback: number): number {
    const record = getRecord(token);
    return readMaybeNumber(record.tokenIndex) ?? readMaybeNumber(record.token_index) ?? fallback;
}

function getTokenKind(token: SliceToken): TokenKind | undefined {
    const record = getRecord(token);
    return readMaybeTrimmedString(record.tokenKind) ?? readMaybeTrimmedString(record.token_kind) ?? undefined;
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
    return readRawString(record.token) ?? readRawString(record.text) ?? "";
}

function buildVerseAriaLabel(bookLabel: string, chapter: number, verse: number): string {
    return `${bookLabel} ${chapter}:${verse}`;
}

function normalizeTokens(tokens: readonly SliceToken[] | null | undefined): readonly TokenMeta[] | null {
    if (!tokens || tokens.length === 0) return null;

    return tokens.map((token, sourceIndex) => {
        const tokenIndex = getTokenIndex(token, sourceIndex);
        const text = getTokenText(token);

        return {
            key: `${tokenIndex}:${sourceIndex}:${text.length}`,
            sourceIndex,
            tokenIndex,
            tokenKind: getTokenKind(token),
            charStart: getTokenCharStart(token),
            charEnd: getTokenCharEnd(token),
            text,
        };
    });
}

function buildVerseTextPlain(row: SliceVerse, tokens: readonly TokenMeta[] | null): string {
    if (tokens && tokens.length > 0) {
        return tokens.map((token) => token.text).join("");
    }

    return getRowPlainText(row);
}

function tokenStyleForKind(kind: TokenKind | undefined): CSSProperties {
    return kind === "MARKER" ? TOKEN_MARKER_STYLE : TOKEN_BASE_STYLE;
}

function buildVerseMeta(row: SliceVerse, book: BookRow | null): VerseMeta {
    const verseOrd = getRowVerseOrd(row);
    const verseKey = getRowVerseKey(row);
    const translationId = getRowTranslationId(row);
    const normalizedTokens = normalizeTokens(row.tokens ?? null);
    const plainVerseText = buildVerseTextPlain(row, normalizedTokens);
    const bookLabel = getBookDisplayName(book, getRowBookId(row));
    const isBookStart = getRowIsBookStart(row);
    const isChapterStart = getRowIsChapterStart(row);

    return {
        verseOrd,
        verseKey,
        translationId,
        normalizedTokens,
        plainVerseText,
        hasTokens: !!normalizedTokens && normalizedTokens.length > 0,
        isBookStart,
        isChapterStart,
        bookLabel,
        ariaLabel: buildVerseAriaLabel(bookLabel, row.chapter, row.verse),
        rootId: `verse-${verseOrd}`,
        verseTextId: `verse-text-${verseOrd}`,
        showBookTitlePage: isBookStart && !!book,
        showChapterKick: !isBookStart && isChapterStart,
        showInlineBookLabel: !isBookStart && isChapterStart && row.chapter > 1,
    };
}

function renderTokenSpan(
    token: TokenMeta,
    meta: VerseMeta,
    row: SliceVerse,
): ReactNode {
    return (
        <span
            key={token.key}
            data-verse-key={meta.verseKey}
            data-verse-ord={meta.verseOrd}
            data-book-id={getRowBookId(row)}
            data-chapter={row.chapter}
            data-verse={row.verse}
            data-translation-id={meta.translationId ?? undefined}
            data-token-index={token.tokenIndex}
            data-token-kind={token.tokenKind ?? undefined}
            data-token-char-start={token.charStart ?? undefined}
            data-token-char-end={token.charEnd ?? undefined}
            style={tokenStyleForKind(token.tokenKind)}
        >
            {token.text}
        </span>
    );
}

function VerseRowInner(props: Props) {
    const { row, book } = props;
    const annotations = props.annotations ?? EMPTY_ANNOTATIONS;

    const meta = useMemo(() => buildVerseMeta(row, book), [book, row]);

    return (
        <article
            id={meta.rootId}
            data-verse-key={meta.verseKey}
            data-verse-ord={meta.verseOrd}
            data-book-id={getRowBookId(row)}
            data-chapter={row.chapter}
            data-verse={row.verse}
            data-translation-id={meta.translationId ?? undefined}
            aria-label={meta.ariaLabel}
            aria-labelledby={meta.verseTextId}
            style={ROW_WRAP_STYLE}
        >
            {meta.showBookTitlePage ? (
                <div style={BOOK_HEADING_WRAP_STYLE}>
                    <BookTitlePage book={book} bookId={getRowBookId(row)} />
                </div>
            ) : null}

            <div style={CARD_STYLE}>
                <ReaderAnnotationOverlay annotations={annotations} />

                <div aria-hidden="true" style={VERSE_NUM_STYLE}>
                    {row.verse}
                </div>

                <div
                    id={meta.verseTextId}
                    data-verse-key={meta.verseKey}
                    data-verse-ord={meta.verseOrd}
                    data-book-id={getRowBookId(row)}
                    data-chapter={row.chapter}
                    data-verse={row.verse}
                    data-translation-id={meta.translationId ?? undefined}
                    style={TEXT_ROW_STYLE}
                    dir="auto"
                >
                    {meta.showChapterKick ? (
                        <span aria-hidden="true" style={CHAPTER_KICK_STYLE}>
                            {row.chapter}
                        </span>
                    ) : null}

                    {meta.showInlineBookLabel ? (
                        <span aria-hidden="true" style={INLINE_BOOK_LABEL_STYLE}>
                            {meta.bookLabel}
                        </span>
                    ) : null}

                    {meta.hasTokens ? (
                        meta.normalizedTokens!.map((token) => renderTokenSpan(token, meta, row))
                    ) : (
                        <span
                            data-verse-key={meta.verseKey}
                            data-verse-ord={meta.verseOrd}
                            data-book-id={getRowBookId(row)}
                            data-chapter={row.chapter}
                            data-verse={row.verse}
                            data-translation-id={meta.translationId ?? undefined}
                            style={TOKEN_BASE_STYLE}
                        >
                            {meta.plainVerseText}
                        </span>
                    )}
                </div>
            </div>
        </article>
    );
}

function areEqual(prev: Props, next: Props): boolean {
    return (
        prev.row === next.row &&
        prev.book === next.book &&
        prev.annotations === next.annotations
    );
}

export const VerseRow = memo(VerseRowInner, areEqual);
VerseRow.displayName = "VerseRow";