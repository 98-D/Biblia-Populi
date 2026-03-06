import type { DomSelectionResolver, DomSelectionTokenLocator } from "@biblia/annotation";

const ATTR_VERSE_KEY = "data-verse-key";
const ATTR_VERSE_ORD = "data-verse-ord";
const ATTR_TOKEN_INDEX = "data-token-index";
const ATTR_TOKEN_CHAR_START = "data-token-char-start";
const ATTR_TOKEN_CHAR_END = "data-token-char-end";
const ATTR_TRANSLATION_ID = "data-translation-id";

function isElement(value: unknown): value is Element {
    return typeof Element !== "undefined" && value instanceof Element;
}

function isTextNode(value: unknown): value is Text {
    return typeof Text !== "undefined" && value instanceof Text;
}

function parseIntStrict(value: string | null): number | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const n = Number(trimmed);
    return Number.isInteger(n) ? n : null;
}

function clampInt(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    const asInt = Math.trunc(value);
    if (asInt < min) return min;
    if (asInt > max) return max;
    return asInt;
}

function findClosestElement(node: Node | null): Element | null {
    if (!node) return null;
    if (isElement(node)) return node;
    return node.parentElement;
}

function findClosestAttrElement(node: Node | null, attr: string): HTMLElement | null {
    let current = findClosestElement(node);
    while (current) {
        if (current instanceof HTMLElement && current.hasAttribute(attr)) {
            return current;
        }
        current = current.parentElement;
    }
    return null;
}

function findVerseElement(node: Node | null): HTMLElement | null {
    let current = findClosestElement(node);
    while (current) {
        if (
            current instanceof HTMLElement &&
            current.hasAttribute(ATTR_VERSE_KEY) &&
            current.hasAttribute(ATTR_VERSE_ORD)
        ) {
            return current;
        }
        current = current.parentElement;
    }
    return null;
}

function getNodeTextLength(node: Node | null): number {
    if (!node) return 0;
    const text = node.textContent;
    return typeof text === "string" ? text.length : 0;
}

function getTokenCharStart(tokenEl: HTMLElement | null): number | null {
    if (!tokenEl) return null;
    return parseIntStrict(tokenEl.getAttribute(ATTR_TOKEN_CHAR_START));
}

function getTokenCharEnd(tokenEl: HTMLElement | null): number | null {
    if (!tokenEl) return null;
    return parseIntStrict(tokenEl.getAttribute(ATTR_TOKEN_CHAR_END));
}

function normalizeString(value: string | null): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function resolveTokenRelativeOffset(node: Node, offset: number, tokenEl: HTMLElement): number {
    const tokenTextLen = getNodeTextLength(tokenEl);
    if (isTextNode(node)) {
        return clampInt(offset, 0, getNodeTextLength(node));
    }
    return clampInt(offset, 0, tokenTextLen);
}

function resolveCharOffset(node: Node, offset: number, tokenEl: HTMLElement | null): number | null {
    if (!tokenEl) {
        if (isTextNode(node)) {
            return clampInt(offset, 0, getNodeTextLength(node));
        }
        return null;
    }

    const tokenStart = getTokenCharStart(tokenEl);
    const tokenEnd = getTokenCharEnd(tokenEl);

    if (tokenStart == null && tokenEnd == null) {
        return isTextNode(node) ? clampInt(offset, 0, getNodeTextLength(node)) : null;
    }

    if (tokenStart != null && tokenEnd != null) {
        const width = Math.max(0, tokenEnd - tokenStart);
        const local = resolveTokenRelativeOffset(node, offset, tokenEl);
        return tokenStart + clampInt(local, 0, width);
    }

    if (tokenStart != null) {
        return tokenStart + resolveTokenRelativeOffset(node, offset, tokenEl);
    }

    return tokenEnd;
}

export class ReaderDomSelectionResolver implements DomSelectionResolver {
    resolveBoundary(node: Node, offset: number): DomSelectionTokenLocator | null {
        const verseEl = findVerseElement(node);
        if (!verseEl) return null;

        const verseKey = normalizeString(verseEl.getAttribute(ATTR_VERSE_KEY));
        const verseOrd = parseIntStrict(verseEl.getAttribute(ATTR_VERSE_ORD));
        if (!verseKey || verseOrd == null || verseOrd < 1) {
            return null;
        }

        const tokenEl = findClosestAttrElement(node, ATTR_TOKEN_INDEX);
        const tokenIndex = tokenEl ? parseIntStrict(tokenEl.getAttribute(ATTR_TOKEN_INDEX)) : null;
        const charOffset = resolveCharOffset(node, offset, tokenEl);

        return {
            verseOrd,
            verseKey,
            tokenIndex,
            charOffset,
        };
    }

    resolveTranslationId(root: Node): string | null {
        const el = findClosestAttrElement(root, ATTR_TRANSLATION_ID);
        return normalizeString(el?.getAttribute(ATTR_TRANSLATION_ID) ?? null);
    }
}