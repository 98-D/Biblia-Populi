// packages/annotation/src/model/anchor.ts

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type VerseKey = Brand<string, "VerseKey">;
export type TranslationId = Brand<string, "TranslationId">;

export type AnnotationAnchor = Readonly<{
    /**
     * Stable canon identity.
     * Must always exist.
     */
    verseOrd: number;
    verseKey: VerseKey;

    /**
     * Optional semantic context.
     * Useful for deterministic replay across translation/tokenizer changes.
     */
    translationId?: TranslationId | null;
    tokenizerId?: string | null;

    /**
     * Preferred partial-anchor method.
     * Half-open [start, end) semantics.
     */
    tokenStart?: number | null;
    tokenEnd?: number | null;

    /**
     * Fallback partial-anchor method when tokens are unavailable.
     * Half-open [start, end) semantics.
     */
    charStart?: number | null;
    charEnd?: number | null;
}>;

export type AnnotationRange = Readonly<{
    start: AnnotationAnchor;
    end: AnnotationAnchor;
}>;

export type AnnotationScope = "RANGE" | "WHOLE_VERSE";

export function hasTokenOffsets(anchor: AnnotationAnchor): boolean {
    return Number.isInteger(anchor.tokenStart) && Number.isInteger(anchor.tokenEnd);
}

export function hasCharOffsets(anchor: AnnotationAnchor): boolean {
    return Number.isInteger(anchor.charStart) && Number.isInteger(anchor.charEnd);
}

export function compareAnchors(a: AnnotationAnchor, b: AnnotationAnchor): number {
    if (a.verseOrd !== b.verseOrd) return a.verseOrd - b.verseOrd;

    const aPos = firstDefinedNumber(a.tokenStart, a.charStart, 0);
    const bPos = firstDefinedNumber(b.tokenStart, b.charStart, 0);

    return aPos - bPos;
}

export function normalizeRange(range: AnnotationRange): AnnotationRange {
    return compareAnchors(range.start, range.end) <= 0
        ? range
        : { start: range.end, end: range.start };
}

export function validateAnchor(anchor: AnnotationAnchor): void {
    if (!Number.isInteger(anchor.verseOrd) || anchor.verseOrd <= 0) {
        throw new Error("anchor.verseOrd must be a positive integer");
    }

    if (!anchor.verseKey || typeof anchor.verseKey !== "string") {
        throw new Error("anchor.verseKey must be present");
    }

    const hasTokens = hasTokenOffsets(anchor);
    const hasChars = hasCharOffsets(anchor);

    if (hasTokens) {
        if ((anchor.tokenStart as number) < 0 || (anchor.tokenEnd as number) < (anchor.tokenStart as number)) {
            throw new Error("anchor token range is invalid");
        }
    }

    if (hasChars) {
        if ((anchor.charStart as number) < 0 || (anchor.charEnd as number) < (anchor.charStart as number)) {
            throw new Error("anchor char range is invalid");
        }
    }

    if (
        anchor.tokenStart != null ||
        anchor.tokenEnd != null ||
        anchor.charStart != null ||
        anchor.charEnd != null
    ) {
        const completeTokenPair = anchor.tokenStart != null && anchor.tokenEnd != null;
        const completeCharPair = anchor.charStart != null && anchor.charEnd != null;

        if (!completeTokenPair && !completeCharPair) {
            throw new Error("partial anchor must provide tokenStart/tokenEnd or charStart/charEnd");
        }
    }
}

export function validateRange(range: AnnotationRange): void {
    validateAnchor(range.start);
    validateAnchor(range.end);

    if (compareAnchors(range.start, range.end) > 0) {
        throw new Error("range start must be <= range end");
    }
}

function firstDefinedNumber(...values: Array<number | null | undefined>): number {
    for (const value of values) {
        if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return 0;
}