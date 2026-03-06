import type { AnnotationBoundary, SelectionAnchorInput } from "./model/span";
import { compareAnnotationBoundaries, normalizeSelectionAnchorInput } from "./model/span";

export interface DomSelectionTokenLocator {
    verseOrd: number;
    verseKey: string;
    tokenIndex: number | null;
    charOffset: number | null;
}

export interface DomSelectionResolved {
    start: DomSelectionTokenLocator;
    end: DomSelectionTokenLocator;
    text: string | null;
    translationId: string | null;
}

export interface DomSelectionResolver {
    resolveBoundary(node: Node, offset: number): DomSelectionTokenLocator | null;
    resolveTranslationId(root: Node): string | null;
}

function normalizeText(value: string): string | null {
    const collapsed = value.replace(/\s+/g, " ").trim();
    return collapsed.length > 0 ? collapsed : null;
}

function toBoundary(locator: DomSelectionTokenLocator): AnnotationBoundary {
    return {
        verseOrd: locator.verseOrd,
        verseKey: locator.verseKey,
        tokenIndex: locator.tokenIndex,
        charOffset: locator.charOffset,
    };
}

export function resolveDomSelection(
    selection: Selection | null,
    resolver: DomSelectionResolver,
): DomSelectionResolved | null {
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        return null;
    }

    const range = selection.getRangeAt(0);
    const start = resolver.resolveBoundary(range.startContainer, range.startOffset);
    const end = resolver.resolveBoundary(range.endContainer, range.endOffset);
    if (!start || !end) {
        return null;
    }

    const ordered = compareAnnotationBoundaries(toBoundary(start), toBoundary(end)) <= 0
        ? { start, end }
        : { start: end, end: start };

    return {
        start: ordered.start,
        end: ordered.end,
        text: normalizeText(selection.toString()),
        translationId: resolver.resolveTranslationId(range.commonAncestorContainer),
    };
}

export function domSelectionToAnchorInput(
    selection: Selection | null,
    resolver: DomSelectionResolver,
): SelectionAnchorInput | null {
    const resolved = resolveDomSelection(selection, resolver);
    if (!resolved) return null;
    return normalizeSelectionAnchorInput({
        start: toBoundary(resolved.start),
        end: toBoundary(resolved.end),
        text: resolved.text,
        translationId: resolved.translationId,
    });
}