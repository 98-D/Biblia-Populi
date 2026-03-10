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

function findClosestAttrElement(node: Node | null, attr: string): HTMLElement | null {
    let current = getClosestHTMLElement(node);

    while (current) {
        if (current.hasAttribute(attr)) {
            return current;
        }
        current = current.parentElement;
    }

    return null;
}

function findVerseElement(node: Node | null): HTMLElement | null {
    let current = getClosestHTMLElement(node);

    while (current) {
        if (current.hasAttribute(ATTR_VERSE_KEY) && current.hasAttribute(ATTR_VERSE_ORD)) {
            return current;
        }
        current = current.parentElement;
    }

    return null;
}

function isTokenElement(el: HTMLElement): boolean {
    return (
        el.hasAttribute(ATTR_TOKEN_INDEX) ||
        el.hasAttribute(ATTR_TOKEN_CHAR_START) ||
        el.hasAttribute(ATTR_TOKEN_CHAR_END)
    );
}

function findTokenElement(node: Node | null, verseEl: HTMLElement | null): HTMLElement | null {
    let current = getClosestHTMLElement(node);

    while (current) {
        if (verseEl && current === verseEl.parentElement) break;

        if (isTokenElement(current)) {
            if (!verseEl || verseEl.contains(current)) return current;
            return null;
        }

        if (verseEl && current === verseEl) break;
        current = current.parentElement;
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

function sumTextLengthOfChildrenBefore(node: Node, childOffset: number): number {
    const count = clampInt(childOffset, 0, node.childNodes.length);
    let total = 0;

    for (let i = 0; i < count; i += 1) {
        total += getNodeTextLength(node.childNodes[i] ?? null);
    }

    return total;
}

/**
 * Computes a character offset relative to `ancestor` from DOM boundary `(node, offset)`.
 *
 * Rules:
 * - text node => offset is character offset within that text node
 * - element node => offset is child-node boundary index
 * - while walking upward, sum text lengths of preceding siblings
 *
 * Returns null if `node` is not contained inside `ancestor`.
 */
function resolveOffsetRelativeToAncestor(
    node: Node,
    offset: number,
    ancestor: HTMLElement,
): number | null {
    if (!ancestor.contains(node) && node !== ancestor) {
        return null;
    }

    if (node === ancestor) {
        if (isTextNode(node)) {
            return clampInt(offset, 0, getNodeTextLength(node));
        }
        return sumTextLengthOfChildrenBefore(node, offset);
    }

    let total = 0;
    let current: Node | null = node;

    if (isTextNode(current)) {
        total += clampInt(offset, 0, getNodeTextLength(current));
    } else {
        total += sumTextLengthOfChildrenBefore(current, offset);
    }

    while (current && current !== ancestor) {
        const parent: Node | null = current.parentNode;
        if (!parent) return null;

        let sibling: Node | null = parent.firstChild;
        while (sibling && sibling !== current) {
            total += getNodeTextLength(sibling);
            sibling = sibling.nextSibling;
        }

        current = parent;
    }

    if (current !== ancestor) return null;
    return clampInt(total, 0, getNodeTextLength(ancestor));
}

function resolveTokenRelativeOffset(node: Node, offset: number, tokenEl: HTMLElement): number {
    const tokenTextLen = getNodeTextLength(tokenEl);
    const relative = resolveOffsetRelativeToAncestor(node, offset, tokenEl);
    if (relative == null) return 0;
    return clampInt(relative, 0, tokenTextLen);
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
    const local = resolveTokenRelativeOffset(node, offset, tokenEl);

    if (tokenStart == null && tokenEnd == null) {
        return local;
    }

    if (tokenStart != null && tokenEnd != null) {
        const lo = Math.min(tokenStart, tokenEnd);
        const hi = Math.max(tokenStart, tokenEnd);
        const width = Math.max(0, hi - lo);
        return lo + clampInt(local, 0, width);
    }

    if (tokenStart != null) {
        return tokenStart + Math.max(0, local);
    }

    if (tokenEnd != null) {
        const tokenTextLen = getNodeTextLength(tokenEl);
        const inferredStart = Math.max(0, tokenEnd - tokenTextLen);
        const width = Math.max(0, tokenEnd - inferredStart);
        return inferredStart + clampInt(local, 0, width);
    }

    return null;
}

function readTranslationIdFromVerseOrAncestors(
    node: Node,
    verseEl: HTMLElement | null,
): string | null {
    const verseScoped =
        verseEl && verseEl.hasAttribute(ATTR_TRANSLATION_ID)
            ? normalizeString(verseEl.getAttribute(ATTR_TRANSLATION_ID))
            : null;

    if (verseScoped) return verseScoped;

    const nearest = findClosestAttrElement(node, ATTR_TRANSLATION_ID);
    if (!nearest) return null;

    if (verseEl && !nearest.contains(verseEl) && !verseEl.contains(nearest)) {
        return null;
    }

    return normalizeString(nearest.getAttribute(ATTR_TRANSLATION_ID));
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

        const tokenEl = findTokenElement(node, verseEl);
        return buildLocator(verseEl, tokenEl, node, offset);
    }

    resolveTranslationId(node: Node): string | null {
        const verseEl = findVerseElement(node);
        return readTranslationIdFromVerseOrAncestors(node, verseEl);
    }
}