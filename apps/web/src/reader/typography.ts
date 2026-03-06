// apps/web/src/reader/typography.ts
//
// Reader typography + layout tuning (scripture + measure)
//
// Principles:
// - Persist stable IDs, not CSS strings.
// - Resolve IDs -> actual font-family strings via FONT_PRESETS (which can point at CSS vars).
// - Normalize/clamp deterministically (safe JSON round-trip).
// - One authoritative apply() that sets CSS vars on <html>.
// - Optional font-load readiness helpers (for stable measurement / virtualizer calm).
//
// CSS vars expected (defined in base.css):
// --bpScriptureFont         (font-family value)
// --bpScriptureSize         (px)
// --bpScriptureLeading      (number)
// --bpScriptureWeight       (number)
// --bpReaderMeasure         (px)

export type TypographyFont =
    | "serif"
    | "sans"
    | "rounded"
    | "book"
    | "human"
    // reserved slots for future (hosted/uploaded/custom):
    | "custom_1"
    | "custom_2";

export type ReaderTypography = Readonly<{
    /** Stable id, resolved to actual font-family via FONT_PRESETS. */
    font: TypographyFont;

    /** Scripture text size in px (clamped). */
    sizePx: number; // 12..30

    /** font-weight (integer). */
    weight: number; // 200..650

    /** line-height multiplier. */
    leading: number; // 0.95..2.1

    /** max line length (measure) in px. */
    measurePx: number; // 535..980
}>;

export const DEFAULT_TYPOGRAPHY: ReaderTypography = Object.freeze({
    font: "serif",
    sizePx: 18,
    weight: 400,
    leading: 1.75,
    measurePx: 840,
});

// Storage key
const STORAGE_KEY_V2 = "bp_reader_typography_v2";

// Legacy keys (kept for migration)
const STORAGE_KEY_V1 = "bp_reader_typography_v1";
const LEGACY_KEYS = Object.freeze(["bp_reader_typography", "bp_typography"]);

// Optional: future envelope (we still accept raw v2 objects for backward compat)
type TypographyEnvelopeV1 = Readonly<{
    v: 1;
    t: ReaderTypography;
}>;

// ──────────────────────────────────────────────────────────────
// Limits — keep UI + normalization synced
// ──────────────────────────────────────────────────────────────
const LIMITS = Object.freeze({
    sizePx: { lo: 12, hi: 30, step: 1 },
    weight: { lo: 200, hi: 650, step: 1 },
    leading: { lo: 0.95, hi: 2.1, digits: 2 },
    measurePx: { lo: 535, hi: 980, step: 1 },
});

/**
 * Font presets.
 * - `css` must be a valid font-family value.
 * - For app fonts, point at CSS vars (base.css controls actual stacks/loaded fonts).
 * - For system fallbacks, provide explicit stacks.
 */
export const FONT_PRESETS: Readonly<Record<TypographyFont, { label: string; css: string }>> = Object.freeze({
    serif: { label: "Literata", css: "var(--font-serif)" },
    sans: { label: "Inter", css: "var(--font-sans)" },
    rounded: { label: "Quicksand", css: "var(--font-rounded)" },

    book: { label: "Book", css: 'ui-serif, Charter, "Iowan Old Style", Georgia, "Times New Roman", Times, serif' },
    human: { label: "Human", css: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, "Noto Sans", sans-serif' },

    // Future: if you add CSS vars like --font-custom-1, --font-custom-2 in base.css:
    custom_1: { label: "Custom 1", css: "var(--font-custom-1, var(--font-serif))" },
    custom_2: { label: "Custom 2", css: "var(--font-custom-2, var(--font-serif))" },
});

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
function clamp(n: number, lo: number, hi: number): number {
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
}

function clampInt(n: number, lo: number, hi: number): number {
    return Math.round(clamp(n, lo, hi));
}

function clampFloat(n: number, lo: number, hi: number, digits: number): number {
    const v = clamp(n, lo, hi);
    const f = Number(v.toFixed(digits));
    return Number.isFinite(f) ? f : lo;
}

function toNumber(x: unknown): number | null {
    if (typeof x === "number" && Number.isFinite(x)) return x;
    if (typeof x === "string") {
        const t = x.trim();
        if (!t) return null;
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function toString(x: unknown): string | null {
    return typeof x === "string" ? x : null;
}

function safeJsonParse(text: string | null): unknown | null {
    if (!text) return null;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return null;
    }
}

function safeLocalStorageGet(key: string): string | null {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeLocalStorageSet(key: string, value: string): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // ignore
    }
}

function safeLocalStorageRemove(key: string): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

function isTypographyFont(x: string): x is TypographyFont {
    return (
        x === "serif" ||
        x === "sans" ||
        x === "rounded" ||
        x === "book" ||
        x === "human" ||
        x === "custom_1" ||
        x === "custom_2"
    );
}

function normalizeFont(raw: unknown): TypographyFont {
    const s = (toString(raw) ?? "").trim().toLowerCase();

    // Direct ids
    if (isTypographyFont(s)) return s;

    // Common synonyms (old saves / human inputs)
    if (s.includes("literata")) return "serif";
    if (s.includes("inter")) return "sans";
    if (s.includes("quicksand")) return "rounded";
    if (s.includes("charter") || s.includes("iowan") || s.includes("times")) return "book";
    if (s.includes("ui") || s.includes("system") || s.includes("segoe") || s.includes("roboto")) return "human";

    return DEFAULT_TYPOGRAPHY.font;
}

function normalizeTypography(t: Partial<ReaderTypography> | null | undefined): ReaderTypography {
    const font = normalizeFont(t?.font);

    return Object.freeze({
        font,
        sizePx: clampInt(toNumber(t?.sizePx) ?? DEFAULT_TYPOGRAPHY.sizePx, LIMITS.sizePx.lo, LIMITS.sizePx.hi),
        weight: clampInt(toNumber(t?.weight) ?? DEFAULT_TYPOGRAPHY.weight, LIMITS.weight.lo, LIMITS.weight.hi),
        leading: clampFloat(
            toNumber(t?.leading) ?? DEFAULT_TYPOGRAPHY.leading,
            LIMITS.leading.lo,
            LIMITS.leading.hi,
            LIMITS.leading.digits,
        ),
        measurePx: clampInt(
            toNumber(t?.measurePx) ?? DEFAULT_TYPOGRAPHY.measurePx,
            LIMITS.measurePx.lo,
            LIMITS.measurePx.hi,
        ),
    });
}

function unwrapTypographyPayload(parsed: unknown): ReaderTypography | null {
    if (!parsed || typeof parsed !== "object") return null;

    // Envelope form: { v: 1, t: {...} }
    const anyObj = parsed as Record<string, unknown>;
    if (anyObj.v === 1 && anyObj.t && typeof anyObj.t === "object") {
        return normalizeTypography(anyObj.t as Partial<ReaderTypography>);
    }

    // Raw form: { font, sizePx, ... } (your current v2/v1)
    return normalizeTypography(anyObj as Partial<ReaderTypography>);
}

/**
 * A stable signature for projections/caches.
 * Use this to know when to recompute highlight rects, drawing projections, etc.
 */
export function typographySignature(t: ReaderTypography): string {
    // Keep it short and stable (order matters).
    return `f=${t.font}|s=${t.sizePx}|w=${t.weight}|l=${t.leading}|m=${t.measurePx}`;
}

// ──────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────

export function typographyLimits() {
    return LIMITS;
}

/** UI helper */
export function getFontLabel(font: TypographyFont): string {
    return FONT_PRESETS[font]?.label ?? font;
}

/** Actual CSS `font-family` string */
export function getFontCssFamily(font: TypographyFont): string {
    return FONT_PRESETS[font]?.css ?? "var(--font-serif)";
}

/**
 * Try v2 → v1 → legacy keys, normalize, and migrate to v2.
 */
export function loadReaderTypography(): ReaderTypography | null {
    const rawV2 = safeLocalStorageGet(STORAGE_KEY_V2);
    if (rawV2) {
        const parsed = safeJsonParse(rawV2);
        const t = unwrapTypographyPayload(parsed);
        if (t) return t;
    }

    const rawV1 = safeLocalStorageGet(STORAGE_KEY_V1);
    if (rawV1) {
        const parsed = safeJsonParse(rawV1);
        const t = unwrapTypographyPayload(parsed);
        if (t) {
            saveReaderTypography(t);
            safeLocalStorageRemove(STORAGE_KEY_V1);
            return t;
        }
    }

    for (const k of LEGACY_KEYS) {
        const raw = safeLocalStorageGet(k);
        if (!raw) continue;
        const parsed = safeJsonParse(raw);
        const t = unwrapTypographyPayload(parsed);
        if (t) {
            saveReaderTypography(t);
            safeLocalStorageRemove(k);
            return t;
        }
    }

    return null;
}

export function saveReaderTypography(t: ReaderTypography): void {
    // Keep raw shape for maximum backward compatibility (simple, readable).
    safeLocalStorageSet(STORAGE_KEY_V2, JSON.stringify(t));

    // If you ever want to switch to envelope, you can do:
    // const env: TypographyEnvelopeV1 = { v: 1, t };
    // safeLocalStorageSet(STORAGE_KEY_V2, JSON.stringify(env));
}

export function clearReaderTypography(): void {
    safeLocalStorageRemove(STORAGE_KEY_V2);
}

/**
 * Apply CSS vars to <html>.
 * NOTE: --bpScriptureFont is a *font-family value* (string), not an id.
 */
export function applyReaderTypography(t: ReaderTypography | null): void {
    if (typeof document === "undefined") return;
    const root = document.documentElement;

    if (!t) {
        root.style.removeProperty("--bpScriptureFont");
        root.style.removeProperty("--bpScriptureSize");
        root.style.removeProperty("--bpScriptureLeading");
        root.style.removeProperty("--bpScriptureWeight");
        root.style.removeProperty("--bpReaderMeasure");
        return;
    }

    const fontCss = getFontCssFamily(t.font);

    root.style.setProperty("--bpScriptureFont", fontCss);
    root.style.setProperty("--bpScriptureSize", `${t.sizePx}px`);
    root.style.setProperty("--bpScriptureLeading", String(t.leading));
    root.style.setProperty("--bpScriptureWeight", String(t.weight));
    root.style.setProperty("--bpReaderMeasure", `${t.measurePx}px`);
}

export function applyReaderTypographyFromStorage(): ReaderTypography | null {
    const t = loadReaderTypography();
    applyReaderTypography(t);
    return t;
}

export function updateTypography(base: ReaderTypography, patch: Partial<ReaderTypography>): ReaderTypography {
    return normalizeTypography({ ...base, ...patch });
}

/**
 * UI options (previews can use cssFamily to render different fonts in the picker).
 */
export function fontOptions(): Array<{ id: TypographyFont; label: string; cssFamily: string }> {
    return (Object.keys(FONT_PRESETS) as TypographyFont[]).map((k) => ({
        id: k,
        label: FONT_PRESETS[k].label,
        cssFamily: FONT_PRESETS[k].css,
    }));
}

/**
 * Optional: Wait for fonts to be ready after applying.
 * Useful if you notice measurement jitter with virtualizer when switching fonts.
 */
export async function waitForFontsIfSupported(timeoutMs = 600): Promise<void> {
    if (typeof document === "undefined") return;
    const fonts: FontFaceSet | undefined = (document as any).fonts;
    if (!fonts || typeof fonts.ready?.then !== "function") return;

    // race with timeout so we never hang
    await Promise.race([
        fonts.ready.then(() => undefined),
        new Promise<void>((resolve) => {
            const id = window.setTimeout(() => resolve(), timeoutMs);
            // best-effort cleanup is handled by resolve path
            void id;
        }),
    ]);
}