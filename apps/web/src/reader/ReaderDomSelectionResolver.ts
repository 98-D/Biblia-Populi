// apps/web/src/reader/ReaderDomSelectionResolver.ts
import type {
    DomSelectionResolver,
    DomSelectionTokenLocator,
} from "@biblia/annotation";

const ATTR_VERSE_KEY = "data-verse-key";
const ATTR_VERSE_ORD = "data-verse-ord";
const ATTR_TOKEN_INDEX = "data-token-index";
const ATTR_TOKEN_CHAR_START = "data-token-char-start";
const ATTR_TOKEN_CHAR_END = "data-token-char-end";
const ATTR_TRANSLATION_ID = "data-translation-id";

type HTMLElementWithParent = HTMLElement & { parentElement: HTMLElement | null };

function isElement(value: unknown): value is Element {
    return typeof Element !== "undefined" && value instanceof Element;
}

function isHTMLElement(value: unknown): value is HTMLElement {
    return typeof HTMLElement !== "undefined" && value instanceof HTMLElement;
}

function isTextNode(value: unknown): value is Text {
    return typeof Text !== "undefined" && value instanceof Text;
}

function normalizeString(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function parseIntStrict(value: string | null | undefined): number | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    if (!/^-?\d+$/.test(trimmed)) return null;

    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed)) return null;
    return parsed;
}

function clampInt(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    const asInt = Math.trunc(value);
    if (asInt < min) return min;
    if (asInt > max) return max;
    return asInt;
}

function getNodeTextLength(node: Node | null): number {
    if (!node) return 0;
    const text = node.textContent;
    return typeof text === "string" ? text.length : 0;
}

function getClosestElement(node: Node | null): Element | null {
    if (!node) return null;
    if (isElement(node)) return node;
    return node.parentElement;
}

function getClosestHTMLElement(node: Node | null): HTMLElement | null {
    const el = getClosestElement(node);
    return isHTMLElement(el) ? el : null;
}

function getParentHTMLElement(el: HTMLElement | null): HTMLElement | null {
    if (!el) return null;
    return (el as HTMLElementWithParent).parentElement;
}

function findClosestAttrElement(node: Node | null, attr: string): HTMLElement | null {
    let current = getClosestHTMLElement(node);

    while (current) {
        if (current.hasAttribute(attr)) {
            return current;
        }
        current = getParentHTMLElement(current);
    }

    return null;
}

function findVerseElement(node: Node | null): HTMLElement | null {
    let current = getClosestHTMLElement(node);

    while (current) {
        if (current.hasAttribute(ATTR_VERSE_KEY) && current.hasAttribute(ATTR_VERSE_ORD)) {
            return current;
        }
        current = getParentHTMLElement(current);
    }

    return null;
}

function getVerseKey(verseEl: HTMLElement): string | null {
    return normalizeString(verseEl.getAttribute(ATTR_VERSE_KEY));
}

function getVerseOrd(verseEl: HTMLElement): number | null {
    const ord = parseIntStrict(verseEl.getAttribute(ATTR_VERSE_ORD));
    if (ord == null || ord < 1) return null;
    return ord;
}

function getTokenIndex(tokenEl: HTMLElement | null): number | null {
    if (!tokenEl) return null;
    const index = parseIntStrict(tokenEl.getAttribute(ATTR_TOKEN_INDEX));
    if (index == null || index < 0) return null;
    return index;
}

function getTokenCharStart(tokenEl: HTMLElement | null): number | null {
    if (!tokenEl) return null;
    const start = parseIntStrict(tokenEl.getAttribute(ATTR_TOKEN_CHAR_START));
    if (start == null || start < 0) return null;
    return start;
}

function getTokenCharEnd(tokenEl: HTMLElement | null): number | null {
    if (!tokenEl) return null;
    const end = parseIntStrict(tokenEl.getAttribute(ATTR_TOKEN_CHAR_END));
    if (end == null || end < 0) return null;
    return end;
}

function resolveOffsetWithinNode(node: Node, offset: number): number {
    if (isTextNode(node)) {
        return clampInt(offset, 0, getNodeTextLength(node));
    }

    const maxOffset = node.childNodes.length;
    return clampInt(offset, 0, maxOffset);
}

function resolveTokenRelativeOffset(node: Node, offset: number, tokenEl: HTMLElement): number {
    const tokenTextLen = getNodeTextLength(tokenEl);

    if (isTextNode(node)) {
        return clampInt(offset, 0, getNodeTextLength(node));
    }

    if (node === tokenEl) {
        const structuralOffset = resolveOffsetWithinNode(node, offset);
        return clampInt(structuralOffset, 0, tokenTextLen);
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
        if (isTextNode(node)) {
            return clampInt(offset, 0, getNodeTextLength(node));
        }
        return null;
    }

    if (tokenStart != null && tokenEnd != null) {
        const lo = Math.min(tokenStart, tokenEnd);
        const hi = Math.max(tokenStart, tokenEnd);
        const width = hi - lo;
        const local = resolveTokenRelativeOffset(node, offset, tokenEl);
        return lo + clampInt(local, 0, width);
    }

    if (tokenStart != null) {
        const local = resolveTokenRelativeOffset(node, offset, tokenEl);
        return tokenStart + Math.max(0, local);
    }

    return tokenEnd;
}

function buildLocator(
     verseEl: HTMLElement,
     tokenEl: HTMLElement | null,
     node: Node,
     offset: number,
): DomSelectionTokenLocator | null {
    const verseKey = getVerseKey(verseEl);
    const verseOrd = getVerseOrd(verseEl);

    if (!verseKey || verseOrd == null) {
        return null;
    }

    const tokenIndex = getTokenIndex(tokenEl);
    const charOffset = resolveCharOffset(node, offset, tokenEl);

    return {
        verseOrd,
        verseKey,
        tokenIndex,
        charOffset,
    };
}

export class ReaderDomSelectionResolver implements DomSelectionResolver {
    resolveBoundary(node: Node, offset: number): DomSelectionTokenLocator | null {
        const verseEl = findVerseElement(node);
        if (!verseEl) return null;

        const tokenEl = findClosestAttrElement(node, ATTR_TOKEN_INDEX);

        return buildLocator(verseEl, tokenEl, node, offset);
    }

    resolveTranslationId(root: Node): string | null {
        const el = findClosestAttrElement(root, ATTR_TRANSLATION_ID);
        if (!el) return null;
        return normalizeString(el.getAttribute(ATTR_TRANSLATION_ID));
    }
}