// apps/web/src/reader/typography.ts
//
// Reader typography + layout tuning (scripture + measure)
// - Robust storage (handles legacy keys + bad/malformed values)
// - Deterministic normalization (always clamps to sane ranges)
// - Single source of truth for CSS var application
//
// CSS vars expected (defined in base.css):
// --bpScriptureFont
// --bpScriptureSize
// --bpScriptureLeading
// --bpScriptureWeight
// --bpReaderMeasure

export type TypographyFont = "serif" | "sans" | "rounded" | "book" | "human";

export type ReaderTypography = Readonly<{
    font: TypographyFont;        // Scripture text only
    sizePx: number;              // 12..30
    weight: number;              // 200..650 (integer)
    leading: number;             // 0.95..2.1
    measurePx: number;           // 240..980
}>;

export const DEFAULT_TYPOGRAPHY: ReaderTypography = Object.freeze({
    font: "serif",
    sizePx: 18,
    weight: 400,
    leading: 1.75,
    measurePx: 840,
});

// Current storage key
const STORAGE_KEY_V2 = "bp_reader_typography_v2";

// Legacy keys (kept for migration)
const STORAGE_KEY_V1 = "bp_reader_typography_v1";
const LEGACY_KEYS = Object.freeze([
    "bp_reader_typography",
    "bp_typography",
]);

// ──────────────────────────────────────────────────────────────
// Limits — synced with UI (sizePx now floors at 12px)
// ──────────────────────────────────────────────────────────────
const LIMITS = Object.freeze({
    sizePx:    { lo: 12,  hi: 30,   step: 1 },
    weight:    { lo: 200, hi: 650,  step: 1 },
    leading:   { lo: 0.95, hi: 2.1,  digits: 2 },   // ← updated minimum
    measurePx: { lo: 240, hi: 980,  step: 1 },
});

export const FONT_PRESETS: Readonly<Record<TypographyFont, { label: string; css: string }>> = Object.freeze({
    serif:   { label: "Literata", css: "var(--font-serif)" },
    sans:    { label: "Inter",    css: "var(--font-sans)" },
    rounded: { label: "Quicksand", css: "var(--font-rounded)" },
    book:    { label: "Book",     css: 'ui-serif, Charter, "Iowan Old Style", Georgia, "Times New Roman", Times, serif' },
    human:   { label: "Human",    css: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, "Noto Sans", sans-serif' },
});

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
function isRecord(x: unknown): x is Record<string, unknown> {
    return typeof x === "object" && x !== null;
}

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
    try { return JSON.parse(text) as unknown; } catch { return null; }
}

function safeLocalStorageGet(key: string): string | null {
    if (typeof window === "undefined") return null;
    try { return window.localStorage.getItem(key); } catch { return null; }
}

function safeLocalStorageSet(key: string, value: string): void {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem(key, value); } catch {}
}

function safeLocalStorageRemove(key: string): void {
    if (typeof window === "undefined") return;
    try { window.localStorage.removeItem(key); } catch {}
}

function normalizeFont(raw: unknown): TypographyFont {
    const s = (toString(raw) ?? "").trim().toLowerCase();
    if (s === "serif" || s === "sans" || s === "rounded" || s === "book" || s === "human") return s as TypographyFont;

    // Common synonyms
    if (s.includes("literata")) return "serif";
    if (s.includes("inter")) return "sans";
    if (s.includes("quicksand")) return "rounded";
    if (s.includes("ui") || s.includes("system")) return "human";

    return DEFAULT_TYPOGRAPHY.font;
}

function normalizeTypography(t: Partial<ReaderTypography> | null | undefined): ReaderTypography {
    const font = normalizeFont(t?.font);

    return Object.freeze({
        font,
        sizePx:    clampInt(toNumber(t?.sizePx)    ?? DEFAULT_TYPOGRAPHY.sizePx,    LIMITS.sizePx.lo,    LIMITS.sizePx.hi),
        weight:    clampInt(toNumber(t?.weight)    ?? DEFAULT_TYPOGRAPHY.weight,    LIMITS.weight.lo,    LIMITS.weight.hi),
        leading:   clampFloat(toNumber(t?.leading) ?? DEFAULT_TYPOGRAPHY.leading,   LIMITS.leading.lo,   LIMITS.leading.hi, LIMITS.leading.digits),
        measurePx: clampInt(toNumber(t?.measurePx) ?? DEFAULT_TYPOGRAPHY.measurePx, LIMITS.measurePx.lo, LIMITS.measurePx.hi),
    });
}

/** Public helper for UI (e.g. titles, tooltips) */
export function getFontLabel(font: TypographyFont): string {
    return FONT_PRESETS[font]?.label ?? font;
}

/** Try v2 → v1 → legacy keys */
export function loadReaderTypography(): ReaderTypography | null {
    const rawV2 = safeLocalStorageGet(STORAGE_KEY_V2);
    if (rawV2) {
        const parsed = safeJsonParse(rawV2);
        const t = parsed ? normalizeTypography(parsed as Partial<ReaderTypography>) : null;
        if (t) return t;
    }

    const rawV1 = safeLocalStorageGet(STORAGE_KEY_V1);
    if (rawV1) {
        const parsed = safeJsonParse(rawV1);
        const t = parsed ? normalizeTypography(parsed as Partial<ReaderTypography>) : null;
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
        const t = parsed ? normalizeTypography(parsed as Partial<ReaderTypography>) : null;
        if (t) {
            saveReaderTypography(t);
            safeLocalStorageRemove(k);
            return t;
        }
    }

    return null;
}

export function saveReaderTypography(t: ReaderTypography): void {
    safeLocalStorageSet(STORAGE_KEY_V2, JSON.stringify(t));
}

export function clearReaderTypography(): void {
    safeLocalStorageRemove(STORAGE_KEY_V2);
}

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

    const fontCss = FONT_PRESETS[t.font]?.css ?? "var(--font-serif)";

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

export function fontOptions(): Array<{ id: TypographyFont; label: string }> {
    return (Object.keys(FONT_PRESETS) as TypographyFont[]).map((k) => ({
        id: k,
        label: FONT_PRESETS[k].label,
    }));
}

export function typographyLimits() {
    return LIMITS;
}

export function updateTypography(base: ReaderTypography, patch: Partial<ReaderTypography>): ReaderTypography {
    return normalizeTypography({ ...base, ...patch });
}