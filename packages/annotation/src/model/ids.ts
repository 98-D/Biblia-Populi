// packages/annotation/src/model/ids.ts
// Biblia.to — annotation ids + hashing
//
// Goals:
// - strict branded string ids for annotation-domain objects
// - lexicographically sortable, time-prefixed ids
// - monotonic generation within the same millisecond
// - runtime-safe validation helpers
// - deterministic text normalization + hashing
// - zero external dependencies
//
// Compatibility:
// - preserves defaultMakeId(prefix?: string): string
// - preserves defaultHashText(input: string): string
// - preserves defaultHashNullableText(input): string | null
// - preserves normalizeName(s: string): string
//
// Notes:
// - IDs are not secrets and are not auth tokens.
// - Hashes here are for stable fingerprints / change detection, not security.
// - This file is safe for Bun / Node / browser runtimes and does not rely on DOM lib typings.

export type Brand<T, B extends string> = T & { readonly __brand: B };

/* ============================================================================
   Branded ID types
============================================================================ */

export type AnnotationId = Brand<string, "AnnotationId">;
export type CollectionId = Brand<string, "CollectionId">;
export type LabelId = Brand<string, "LabelId">;
export type PaletteId = Brand<string, "PaletteId">;
export type ShareId = Brand<string, "ShareId">;
export type EventId = Brand<string, "EventId">;
export type StrokeId = Brand<string, "StrokeId">;
export type AttachmentId = Brand<string, "AttachmentId">;

export type UserId = Brand<string, "UserId">;
export type DeviceId = Brand<string, "DeviceId">;

export type VerseKey = Brand<string, "VerseKey">;
export type TranslationId = Brand<string, "TranslationId">;
export type BlockId = Brand<string, "BlockId">;
export type ContainerKey = Brand<string, "ContainerKey">;

export type SelectionHash = Brand<string, "SelectionHash">;

/* ============================================================================
   Prefix registry
============================================================================ */

export const ID_PREFIX = {
    annotation: "ann",
    collection: "col",
    label: "lab",
    palette: "pal",
    share: "shr",
    event: "evt",
    stroke: "stk",
    attachment: "att",
} as const;

export type KnownIdPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX];

/* ============================================================================
   Public name normalization
============================================================================ */

/**
 * Normalize a user-visible name for comparison / indexing.
 *
 * Behavior:
 * - unicode normalizes with NFKC
 * - trims ends
 * - collapses internal whitespace
 * - lowercases
 */
export function normalizeName(s: string): string {
    if (typeof s !== "string") {
        throw new Error("[ids] normalizeName requires a string");
    }

    return s
        .normalize("NFKC")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}

/* ============================================================================
   Public ID creation API
============================================================================ */

/**
 * Backward-compatible generic id maker.
 *
 * Format:
 *   <prefix>_<26-char-monotonic-body>
 *
 * Example:
 *   ann_01JNCFSY8PG0A0FQ5FD7X7X9FH
 */
export function defaultMakeId(prefix = "ann"): string {
    return makeId(prefix);
}

export function makeId(prefix = "ann", nowMs = Date.now()): string {
    const safePrefix = normalizePrefix(prefix);
    const body = makeMonotonicBody(nowMs);
    return `${safePrefix}_${body}`;
}

export function createAnnotationId(nowMs?: number): AnnotationId {
    return makeKnownId(ID_PREFIX.annotation, nowMs) as AnnotationId;
}

export function createCollectionId(nowMs?: number): CollectionId {
    return makeKnownId(ID_PREFIX.collection, nowMs) as CollectionId;
}

export function createLabelId(nowMs?: number): LabelId {
    return makeKnownId(ID_PREFIX.label, nowMs) as LabelId;
}

export function createPaletteId(nowMs?: number): PaletteId {
    return makeKnownId(ID_PREFIX.palette, nowMs) as PaletteId;
}

export function createShareId(nowMs?: number): ShareId {
    return makeKnownId(ID_PREFIX.share, nowMs) as ShareId;
}

export function createEventId(nowMs?: number): EventId {
    return makeKnownId(ID_PREFIX.event, nowMs) as EventId;
}

export function createStrokeId(nowMs?: number): StrokeId {
    return makeKnownId(ID_PREFIX.stroke, nowMs) as StrokeId;
}

export function createAttachmentId(nowMs?: number): AttachmentId {
    return makeKnownId(ID_PREFIX.attachment, nowMs) as AttachmentId;
}

/* ============================================================================
   Public ID validation / coercion
============================================================================ */

export function isAnnotationId(value: unknown): value is AnnotationId {
    return isPrefixedId(value, ID_PREFIX.annotation);
}

export function isCollectionId(value: unknown): value is CollectionId {
    return isPrefixedId(value, ID_PREFIX.collection);
}

export function isLabelId(value: unknown): value is LabelId {
    return isPrefixedId(value, ID_PREFIX.label);
}

export function isPaletteId(value: unknown): value is PaletteId {
    return isPrefixedId(value, ID_PREFIX.palette);
}

export function isShareId(value: unknown): value is ShareId {
    return isPrefixedId(value, ID_PREFIX.share);
}

export function isEventId(value: unknown): value is EventId {
    return isPrefixedId(value, ID_PREFIX.event);
}

export function isStrokeId(value: unknown): value is StrokeId {
    return isPrefixedId(value, ID_PREFIX.stroke);
}

export function isAttachmentId(value: unknown): value is AttachmentId {
    return isPrefixedId(value, ID_PREFIX.attachment);
}

export function toAnnotationId(value: string): AnnotationId {
    assertPrefixedId(value, ID_PREFIX.annotation, "AnnotationId");
    return value as AnnotationId;
}

export function toCollectionId(value: string): CollectionId {
    assertPrefixedId(value, ID_PREFIX.collection, "CollectionId");
    return value as CollectionId;
}

export function toLabelId(value: string): LabelId {
    assertPrefixedId(value, ID_PREFIX.label, "LabelId");
    return value as LabelId;
}

export function toPaletteId(value: string): PaletteId {
    assertPrefixedId(value, ID_PREFIX.palette, "PaletteId");
    return value as PaletteId;
}

export function toShareId(value: string): ShareId {
    assertPrefixedId(value, ID_PREFIX.share, "ShareId");
    return value as ShareId;
}

export function toEventId(value: string): EventId {
    assertPrefixedId(value, ID_PREFIX.event, "EventId");
    return value as EventId;
}

export function toStrokeId(value: string): StrokeId {
    assertPrefixedId(value, ID_PREFIX.stroke, "StrokeId");
    return value as StrokeId;
}

export function toAttachmentId(value: string): AttachmentId {
    assertPrefixedId(value, ID_PREFIX.attachment, "AttachmentId");
    return value as AttachmentId;
}

export function assertAnnotationId(value: unknown): asserts value is AnnotationId {
    assertPrefixedId(value, ID_PREFIX.annotation, "AnnotationId");
}

export function assertCollectionId(value: unknown): asserts value is CollectionId {
    assertPrefixedId(value, ID_PREFIX.collection, "CollectionId");
}

export function assertLabelId(value: unknown): asserts value is LabelId {
    assertPrefixedId(value, ID_PREFIX.label, "LabelId");
}

export function assertPaletteId(value: unknown): asserts value is PaletteId {
    assertPrefixedId(value, ID_PREFIX.palette, "PaletteId");
}

export function assertShareId(value: unknown): asserts value is ShareId {
    assertPrefixedId(value, ID_PREFIX.share, "ShareId");
}

export function assertEventId(value: unknown): asserts value is EventId {
    assertPrefixedId(value, ID_PREFIX.event, "EventId");
}

export function assertStrokeId(value: unknown): asserts value is StrokeId {
    assertPrefixedId(value, ID_PREFIX.stroke, "StrokeId");
}

export function assertAttachmentId(value: unknown): asserts value is AttachmentId {
    assertPrefixedId(value, ID_PREFIX.attachment, "AttachmentId");
}

export function isPrefixedId(value: unknown, prefix: string): value is string {
    if (typeof value !== "string") return false;
    if (!SAFE_PREFIX_RE.test(prefix)) return false;
    if (!value.startsWith(`${prefix}_`)) return false;

    const body = value.slice(prefix.length + 1);
    return ID_BODY_RE.test(body);
}

export function assertPrefixedId(
    value: unknown,
    prefix: string,
    label = "id",
): asserts value is string {
    if (!isPrefixedId(value, prefix)) {
        throw new Error(`[ids] invalid ${label}: expected "${prefix}_<26-char-body>"`);
    }
}

export function extractIdPrefix(value: string): string | null {
    const idx = value.indexOf("_");
    if (idx <= 0) return null;

    const prefix = value.slice(0, idx);
    return SAFE_PREFIX_RE.test(prefix) ? prefix : null;
}

export function splitId(value: string): Readonly<{ prefix: string; body: string }> | null {
    const idx = value.indexOf("_");
    if (idx <= 0) return null;

    const prefix = value.slice(0, idx);
    const body = value.slice(idx + 1);

    if (!SAFE_PREFIX_RE.test(prefix)) return null;
    if (!ID_BODY_RE.test(body)) return null;

    return { prefix, body };
}

/* ============================================================================
   Public hashing API
============================================================================ */

/**
 * Deterministic 64-bit FNV-1a over UTF-8 bytes.
 *
 * Output format:
 *   fnv1a64_<16 hex chars>
 *
 * Good for:
 * - selection fingerprints
 * - re-anchor comparison
 * - change detection
 * - cache keys
 *
 * Not suitable for:
 * - passwords
 * - secrets
 * - adversarial collision resistance
 */
export function defaultHashText(input: string): string {
    if (typeof input !== "string") {
        throw new Error("[ids] defaultHashText requires a string");
    }

    const bytes = utf8Encode(input);
    let hash = FNV64_OFFSET_BASIS;
    for (let i = 0; i < bytes.length; i += 1) {
        hash ^= BigInt(bytes[i] ?? 0);
        hash = BigInt.asUintN(64, hash * FNV64_PRIME);
    }

    return `fnv1a64_${hash.toString(16).padStart(16, "0")}`;
}

/**
 * Convenience helper for optional text.
 * Returns null for nullish / blank values, otherwise hashed text.
 */
export function defaultHashNullableText(input: string | null | undefined): string | null {
    if (!isNonEmptyString(input)) return null;
    return defaultHashText(input);
}

export function toSelectionHash(value: string): SelectionHash {
    if (!isSelectionHash(value)) {
        throw new Error("[ids] invalid SelectionHash");
    }
    return value as SelectionHash;
}

export function isSelectionHash(value: unknown): value is SelectionHash {
    return typeof value === "string" && /^fnv1a64_[0-9a-f]{16}$/u.test(value);
}

export function assertSelectionHash(value: unknown): asserts value is SelectionHash {
    if (!isSelectionHash(value)) {
        throw new Error("[ids] invalid SelectionHash");
    }
}

/* ============================================================================
   Internal constants
============================================================================ */

const SAFE_PREFIX_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/u;
const ID_BODY_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/u;

const CROCKFORD32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_PART_LEN = 10;
const RANDOM_PART_LEN = 16;

const FNV64_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;

/* ============================================================================
   Internal monotonic ID state
============================================================================ */

let lastTimestampMs = -1;
let lastRandomDigits: number[] | null = null;

/* ============================================================================
   Internal helpers
============================================================================ */

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function normalizePrefix(prefix: string): string {
    const normalized = String(prefix)
        .normalize("NFKC")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

    if (normalized.length === 0) return "id";
    return normalized.slice(0, 24);
}

function makeKnownId(prefix: KnownIdPrefix, nowMs = Date.now()): string {
    return `${prefix}_${makeMonotonicBody(nowMs)}`;
}

function makeMonotonicBody(nowMs: number): string {
    assertValidTimestamp(nowMs);

    const timePart = encodeTime48(nowMs);
    const randomDigits = nextRandomDigits(nowMs);
    const randomPart = encodeDigits(randomDigits);

    return `${timePart}${randomPart}`;
}

function nextRandomDigits(nowMs: number): number[] {
    if (nowMs === lastTimestampMs && lastRandomDigits !== null) {
        const next = lastRandomDigits.slice();
        incrementBase32Digits(next);
        lastRandomDigits = next;
        return next;
    }

    const next = randomBase32Digits(RANDOM_PART_LEN);
    lastTimestampMs = nowMs;
    lastRandomDigits = next;
    return next;
}

function incrementBase32Digits(digits: number[]): void {
    for (let i = digits.length - 1; i >= 0; i -= 1) {
        const digit = digits[i] ?? 0;
        if (digit < 31) {
            digits[i] = digit + 1;
            return;
        }
        digits[i] = 0;
    }

    throw new Error("[ids] monotonic id overflow within the same millisecond");
}

function randomBase32Digits(length: number): number[] {
    const out = new Array<number>(length);
    const bytes = getRandomBytes(length);

    for (let i = 0; i < length; i += 1) {
        out[i] = (bytes[i] ?? 0) & 31;
    }

    return out;
}

function encodeTime48(nowMs: number): string {
    let value = Math.trunc(nowMs);
    let out = "";

    for (let i = 0; i < TIME_PART_LEN; i += 1) {
        out = alphabetChar(value % 32) + out;
        value = Math.floor(value / 32);
    }

    return out;
}

function encodeDigits(digits: readonly number[]): string {
    let out = "";
    for (let i = 0; i < digits.length; i += 1) {
        out += alphabetChar(digits[i] ?? 0);
    }
    return out;
}

function alphabetChar(index: number): string {
    if (!Number.isInteger(index) || index < 0 || index >= 32) {
        throw new Error("[ids] invalid base32 alphabet index");
    }

    const char = CROCKFORD32.charAt(index);
    if (!char) {
        throw new Error("[ids] base32 alphabet lookup failed");
    }

    return char;
}

function assertValidTimestamp(value: number): void {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
        throw new Error("[ids] timestamp must be a non-negative integer millisecond value");
    }

    // 48-bit ULID-compatible time ceiling.
    if (value > 281_474_976_710_655) {
        throw new Error("[ids] timestamp exceeds 48-bit time range");
    }
}

function getRandomBytes(length: number): Uint8Array {
    const g = globalThis as {
        crypto?: {
            getRandomValues?: (array: Uint8Array) => Uint8Array;
        };
    };

    const cryptoLike = g.crypto;
    if (cryptoLike && typeof cryptoLike.getRandomValues === "function") {
        return cryptoLike.getRandomValues(new Uint8Array(length));
    }

    // Fallback only for unusual runtimes without crypto.
    // Fine for local uniqueness; crypto-backed runtimes are preferred.
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
        out[i] = Math.floor(Math.random() * 256);
    }
    return out;
}

/**
 * UTF-8 encoder with no dependency on DOM typings.
 */
function utf8Encode(input: string): Uint8Array {
    const bytes: number[] = [];

    for (let i = 0; i < input.length; i += 1) {
        let codePoint = input.charCodeAt(i);

        // surrogate pair
        if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < input.length) {
            const next = input.charCodeAt(i + 1);
            if (next >= 0xdc00 && next <= 0xdfff) {
                codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
                i += 1;
            }
        }

        if (codePoint <= 0x7f) {
            bytes.push(codePoint);
            continue;
        }

        if (codePoint <= 0x7ff) {
            bytes.push(
                0xc0 | (codePoint >> 6),
                0x80 | (codePoint & 0x3f),
            );
            continue;
        }

        if (codePoint <= 0xffff) {
            bytes.push(
                0xe0 | (codePoint >> 12),
                0x80 | ((codePoint >> 6) & 0x3f),
                0x80 | (codePoint & 0x3f),
            );
            continue;
        }

        bytes.push(
            0xf0 | (codePoint >> 18),
            0x80 | ((codePoint >> 12) & 0x3f),
            0x80 | ((codePoint >> 6) & 0x3f),
            0x80 | (codePoint & 0x3f),
        );
    }

    return Uint8Array.from(bytes);
}