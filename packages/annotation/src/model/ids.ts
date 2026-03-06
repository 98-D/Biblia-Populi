export const ID_PREFIX = {
    ANNOTATION: "ann",
    DEVICE: "dev",
    EVENT: "evt",
    PALETTE: "pal",
    SPAN: "spn",
    STROKE: "stk",
    USER: "usr",
} as const;

declare const annotationIdBrand: unique symbol;
declare const deviceIdBrand: unique symbol;
declare const eventIdBrand: unique symbol;
declare const paletteIdBrand: unique symbol;
declare const spanIdBrand: unique symbol;
declare const strokeIdBrand: unique symbol;
declare const userIdBrand: unique symbol;

export type AnnotationId = string & { readonly [annotationIdBrand]: true };
export type DeviceId = string & { readonly [deviceIdBrand]: true };
export type EventId = string & { readonly [eventIdBrand]: true };
export type PaletteId = string & { readonly [paletteIdBrand]: true };
export type SpanId = string & { readonly [spanIdBrand]: true };
export type StrokeId = string & { readonly [strokeIdBrand]: true };
export type UserId = string & { readonly [userIdBrand]: true };

type Brand<T> = T extends AnnotationId
    ? AnnotationId
    : T extends DeviceId
        ? DeviceId
        : T extends EventId
            ? EventId
            : T extends PaletteId
                ? PaletteId
                : T extends SpanId
                    ? SpanId
                    : T extends StrokeId
                        ? StrokeId
                        : T extends UserId
                            ? UserId
                            : never;

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`[ids] ${label} must be a non-empty string`);
    }
}

function randomHex(bytes = 8): string {
    const out = new Uint8Array(bytes);
    const cryptoObject = globalThis.crypto;
    if (cryptoObject?.getRandomValues) {
        cryptoObject.getRandomValues(out);
    } else {
        for (let i = 0; i < out.length; i += 1) {
            out[i] = Math.floor(Math.random() * 256);
        }
    }
    return Array.from(out, (n) => n.toString(16).padStart(2, "0")).join("");
}

function nowHex(): string {
    return Date.now().toString(16).padStart(12, "0");
}

function normalizeIdFragment(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function createPrefixedId<T extends string>(prefix: string, seed?: string): Brand<T> {
    const seedPart = seed ? normalizeIdFragment(seed) : "";
    const core = seedPart.length > 0 ? `${nowHex()}-${seedPart}-${randomHex(4)}` : `${nowHex()}-${randomHex(6)}`;
    return `${prefix}_${core}` as Brand<T>;
}

function toPrefixedId<T extends string>(value: unknown, prefix: string, label: string): Brand<T> {
    assertNonEmptyString(value, label);
    const trimmed = value.trim();
    if (!trimmed.startsWith(`${prefix}_`)) {
        throw new Error(`[ids] ${label} must start with ${prefix}_`);
    }
    return trimmed as Brand<T>;
}

export function defaultHashText(text: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return `h${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createAnnotationId(seed?: string): AnnotationId {
    return createPrefixedId<AnnotationId>(ID_PREFIX.ANNOTATION, seed);
}

export function createDeviceId(seed?: string): DeviceId {
    return createPrefixedId<DeviceId>(ID_PREFIX.DEVICE, seed);
}

export function createEventId(seed?: string): EventId {
    return createPrefixedId<EventId>(ID_PREFIX.EVENT, seed);
}

export function createPaletteId(seed?: string): PaletteId {
    return createPrefixedId<PaletteId>(ID_PREFIX.PALETTE, seed);
}

export function createSpanId(seed?: string): SpanId {
    return createPrefixedId<SpanId>(ID_PREFIX.SPAN, seed);
}

export function createStrokeId(seed?: string): StrokeId {
    return createPrefixedId<StrokeId>(ID_PREFIX.STROKE, seed);
}

export function createUserId(seed?: string): UserId {
    return createPrefixedId<UserId>(ID_PREFIX.USER, seed);
}

export function toAnnotationId(value: unknown): AnnotationId {
    return toPrefixedId<AnnotationId>(value, ID_PREFIX.ANNOTATION, "annotationId");
}

export function toDeviceId(value: unknown): DeviceId {
    return toPrefixedId<DeviceId>(value, ID_PREFIX.DEVICE, "deviceId");
}

export function toEventId(value: unknown): EventId {
    return toPrefixedId<EventId>(value, ID_PREFIX.EVENT, "eventId");
}

export function toPaletteId(value: unknown): PaletteId {
    return toPrefixedId<PaletteId>(value, ID_PREFIX.PALETTE, "paletteId");
}

export function toSpanId(value: unknown): SpanId {
    return toPrefixedId<SpanId>(value, ID_PREFIX.SPAN, "spanId");
}

export function toStrokeId(value: unknown): StrokeId {
    return toPrefixedId<StrokeId>(value, ID_PREFIX.STROKE, "strokeId");
}

export function toUserId(value: unknown): UserId {
    return toPrefixedId<UserId>(value, ID_PREFIX.USER, "userId");
}

export function isAnnotationId(value: unknown): value is AnnotationId {
    return typeof value === "string" && value.startsWith(`${ID_PREFIX.ANNOTATION}_`);
}

export function isSpanId(value: unknown): value is SpanId {
    return typeof value === "string" && value.startsWith(`${ID_PREFIX.SPAN}_`);
}

export function isStrokeId(value: unknown): value is StrokeId {
    return typeof value === "string" && value.startsWith(`${ID_PREFIX.STROKE}_`);
}