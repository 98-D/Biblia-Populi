import type { SpanId } from "./ids";
import { createSpanId, toSpanId } from "./ids";

export interface AnnotationBoundary {
    verseOrd: number;
    verseKey: string;
    tokenIndex: number | null;
    charOffset: number | null;
}

export interface SelectionAnchorInput {
    start: AnnotationBoundary;
    end: AnnotationBoundary;
    text: string | null;
    translationId: string | null;
}

export interface AnnotationSpan {
    spanId: SpanId;
    ordinal: number;
    start: AnnotationBoundary;
    end: AnnotationBoundary;
    text: string | null;
    translationId: string | null;
    createdAt: number;
    updatedAt: number;
    deletedAt: number | null;
}

export interface AnnotationSpanInput {
    spanId?: SpanId;
    ordinal?: number;
    start: AnnotationBoundary;
    end: AnnotationBoundary;
    text?: string | null;
    translationId?: string | null;
    createdAt?: number;
    updatedAt?: number;
    deletedAt?: number | null;
}

export interface AnnotationSpanRow {
    span_id: string;
    ordinal: number;
    start_verse_ord: number;
    start_verse_key: string;
    start_token_index: number | null;
    start_char_offset: number | null;
    end_verse_ord: number;
    end_verse_key: string;
    end_token_index: number | null;
    end_char_offset: number | null;
    quote_text: string | null;
    translation_id: string | null;
    created_at: number;
    updated_at: number;
    deleted_at: number | null;
}

function assertFiniteInteger(value: unknown, label: string): asserts value is number {
    if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new Error(`[span] ${label} must be an integer`);
    }
}

function assertNonNegativeIntegerOrNull(value: unknown, label: string): asserts value is number | null {
    if (value !== null && (typeof value !== "number" || !Number.isInteger(value) || value < 0)) {
        throw new Error(`[span] ${label} must be null or a non-negative integer`);
    }
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
        throw new Error(`[span] ${label} must be a positive integer`);
    }
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`[span] ${label} must be a non-empty string`);
    }
}

function normalizeNullableText(value: string | null | undefined): string | null {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function canonicalBoundary(input: AnnotationBoundary): AnnotationBoundary {
    assertAnnotationBoundary(input);
    return {
        verseOrd: input.verseOrd,
        verseKey: input.verseKey.trim(),
        tokenIndex: input.tokenIndex,
        charOffset: input.charOffset,
    };
}

function compareNullableNumber(a: number | null, b: number | null): number {
    if (a === b) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    return a - b;
}

export function compareAnnotationBoundaries(a: AnnotationBoundary, b: AnnotationBoundary): number {
    if (a.verseOrd !== b.verseOrd) return a.verseOrd - b.verseOrd;
    const tokenDelta = compareNullableNumber(a.tokenIndex, b.tokenIndex);
    if (tokenDelta !== 0) return tokenDelta;
    return compareNullableNumber(a.charOffset, b.charOffset);
}

export function assertAnnotationBoundary(value: unknown): asserts value is AnnotationBoundary {
    if (typeof value !== "object" || value === null) {
        throw new Error("[span] boundary must be an object");
    }
    const input = value as Record<string, unknown>;
    assertPositiveInteger(input.verseOrd, "boundary.verseOrd");
    assertNonEmptyString(input.verseKey, "boundary.verseKey");
    assertNonNegativeIntegerOrNull(input.tokenIndex ?? null, "boundary.tokenIndex");
    assertNonNegativeIntegerOrNull(input.charOffset ?? null, "boundary.charOffset");
}

export function normalizeSelectionAnchorInput(input: SelectionAnchorInput): SelectionAnchorInput {
    assertSelectionAnchorInput(input);
    const start = canonicalBoundary(input.start);
    const end = canonicalBoundary(input.end);
    const ordered = compareAnnotationBoundaries(start, end) <= 0
        ? { start, end }
        : { start: end, end: start };

    return {
        start: ordered.start,
        end: ordered.end,
        text: normalizeNullableText(input.text),
        translationId: normalizeNullableText(input.translationId),
    };
}

export function assertSelectionAnchorInput(value: unknown): asserts value is SelectionAnchorInput {
    if (typeof value !== "object" || value === null) {
        throw new Error("[span] selection anchor input must be an object");
    }
    const input = value as Record<string, unknown>;
    assertAnnotationBoundary(input.start);
    assertAnnotationBoundary(input.end);
    if (input.text != null && typeof input.text !== "string") {
        throw new Error("[span] text must be null or a string");
    }
    if (input.translationId != null && typeof input.translationId !== "string") {
        throw new Error("[span] translationId must be null or a string");
    }
}

export function createAnnotationSpan(input: AnnotationSpanInput, now = Date.now()): AnnotationSpan {
    const selection = normalizeSelectionAnchorInput({
        start: input.start,
        end: input.end,
        text: input.text ?? null,
        translationId: input.translationId ?? null,
    });

    const createdAt = input.createdAt ?? now;
    const updatedAt = input.updatedAt ?? createdAt;
    const deletedAt = input.deletedAt ?? null;
    const span: AnnotationSpan = {
        spanId: input.spanId ?? createSpanId(selection.start.verseKey),
        ordinal: input.ordinal ?? 1,
        start: selection.start,
        end: selection.end,
        text: selection.text,
        translationId: selection.translationId,
        createdAt,
        updatedAt,
        deletedAt,
    };
    assertAnnotationSpan(span);
    return span;
}

export function assertAnnotationSpan(value: unknown): asserts value is AnnotationSpan {
    if (typeof value !== "object" || value === null) {
        throw new Error("[span] annotation span must be an object");
    }

    const input = value as Record<string, unknown>;
    toSpanId(input.spanId);
    assertPositiveInteger(input.ordinal, "ordinal");
    assertAnnotationBoundary(input.start);
    assertAnnotationBoundary(input.end);
    if (compareAnnotationBoundaries(input.start as AnnotationBoundary, input.end as AnnotationBoundary) > 0) {
        throw new Error("[span] start must not sort after end");
    }
    if (input.text != null && typeof input.text !== "string") {
        throw new Error("[span] text must be null or a string");
    }
    if (input.translationId != null && typeof input.translationId !== "string") {
        throw new Error("[span] translationId must be null or a string");
    }
    assertFiniteInteger(input.createdAt, "createdAt");
    assertFiniteInteger(input.updatedAt, "updatedAt");
    assertNonNegativeIntegerOrNull(input.deletedAt ?? null, "deletedAt");

    const createdAt = input.createdAt as number;
    const updatedAt = input.updatedAt as number;
    const deletedAt = (input.deletedAt ?? null) as number | null;
    if (updatedAt < createdAt) {
        throw new Error("[span] updatedAt must be >= createdAt");
    }
    if (deletedAt !== null && deletedAt < createdAt) {
        throw new Error("[span] deletedAt must be >= createdAt");
    }
}

export function annotationSpanToRow(span: AnnotationSpan): AnnotationSpanRow {
    assertAnnotationSpan(span);
    return {
        span_id: span.spanId,
        ordinal: span.ordinal,
        start_verse_ord: span.start.verseOrd,
        start_verse_key: span.start.verseKey,
        start_token_index: span.start.tokenIndex,
        start_char_offset: span.start.charOffset,
        end_verse_ord: span.end.verseOrd,
        end_verse_key: span.end.verseKey,
        end_token_index: span.end.tokenIndex,
        end_char_offset: span.end.charOffset,
        quote_text: span.text,
        translation_id: span.translationId,
        created_at: span.createdAt,
        updated_at: span.updatedAt,
        deleted_at: span.deletedAt,
    };
}

export function annotationSpanFromRow(row: AnnotationSpanRow): AnnotationSpan {
    return createAnnotationSpan({
        spanId: toSpanId(row.span_id),
        ordinal: row.ordinal,
        start: {
            verseOrd: row.start_verse_ord,
            verseKey: row.start_verse_key,
            tokenIndex: row.start_token_index,
            charOffset: row.start_char_offset,
        },
        end: {
            verseOrd: row.end_verse_ord,
            verseKey: row.end_verse_key,
            tokenIndex: row.end_token_index,
            charOffset: row.end_char_offset,
        },
        text: row.quote_text,
        translationId: row.translation_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
    });
}

export function sortAnnotationSpans(spans: readonly AnnotationSpan[]): AnnotationSpan[] {
    return [...spans].sort((a, b) => {
        if (a.ordinal !== b.ordinal) return a.ordinal - b.ordinal;
        const startDelta = compareAnnotationBoundaries(a.start, b.start);
        if (startDelta !== 0) return startDelta;
        const endDelta = compareAnnotationBoundaries(a.end, b.end);
        if (endDelta !== 0) return endDelta;
        return a.spanId.localeCompare(b.spanId);
    });
}

export function normalizeSpanOrdinals(spans: readonly AnnotationSpan[]): AnnotationSpan[] {
    return sortAnnotationSpans(spans).map((span, index) => ({
        ...span,
        ordinal: index + 1,
    }));
}