// apps/web/src/reader/typography.ts
//
// Biblia.to — reader typography + layout tuning
//
// Goals:
// - Persist stable font IDs, never raw CSS strings
// - Normalize + clamp deterministically
// - Migrate older saves cleanly
// - One authoritative apply() to <html>
// - Explicit modern font presets (Inter, Literata, Quicksand)
// - Stable helpers for virtualizer / measurement calm

export type TypographyFont =
     | "inter"
     | "literata"
     | "quicksand"
     | "book"
     | "human"
     | "mono"
     | "custom_1"
     | "custom_2";

export type ReaderTypography = Readonly<{
    font: TypographyFont;
    sizePx: number;   // 12..30
    weight: number;   // 200..700
    leading: number;  // 0.95..2.1
    measurePx: number; // 535..980
}>;

/**
 * New default:
 * - Inter is the default modern reading-first sans
 * - slightly calmer measure than before
 */
export const DEFAULT_TYPOGRAPHY: ReaderTypography = Object.freeze({
    font: "inter",
    sizePx: 18,
    weight: 400,
    leading: 1.72,
    measurePx: 820,
});

const STORAGE_KEY_V2 = "bp_reader_typography_v2";
const STORAGE_KEY_V1 = "bp_reader_typography_v1";
const LEGACY_KEYS = Object.freeze(["bp_reader_typography", "bp_typography"]);

type TypographyEnvelopeV1 = Readonly<{
    v: 1;
    t: ReaderTypography;
}>;

const LIMITS = Object.freeze({
    sizePx: { lo: 12, hi: 30, step: 1 },
    weight: { lo: 200, hi: 700, step: 1 },
    leading: { lo: 0.95, hi: 2.1, digits: 2 },
    measurePx: { lo: 535, hi: 980, step: 1 },
});

export const FONT_PRESETS: Readonly<
     Record<
          TypographyFont,
          Readonly<{
              label: string;
              css: string;
              category: "sans" | "serif" | "rounded" | "mono" | "custom";
          }>
     >
> = Object.freeze({
    inter: {
        label: "Inter",
        css: "var(--font-sans)",
        category: "sans",
    },

    literata: {
        label: "Literata",
        css: "var(--font-serif)",
        category: "serif",
    },

    quicksand: {
        label: "Quicksand",
        css: "var(--font-rounded)",
        category: "rounded",
    },

    book: {
        label: "Book Serif",
        css: 'ui-serif, Charter, "Iowan Old Style", Georgia, "Times New Roman", Times, serif',
        category: "serif",
    },

    human: {
        label: "Human Sans",
        css: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, "Noto Sans", sans-serif',
        category: "sans",
    },

    mono: {
        label: "Reader Mono",
        css: 'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        category: "mono",
    },

    custom_1: {
        label: "Custom 1",
        css: "var(--font-custom-1, var(--font-sans))",
        category: "custom",
    },

    custom_2: {
        label: "Custom 2",
        css: "var(--font-custom-2, var(--font-serif))",
        category: "custom",
    },
});

type FontOption = Readonly<{
    id: TypographyFont;
    label: string;
    cssFamily: string;
    category: "sans" | "serif" | "rounded" | "mono" | "custom";
}>;

/* ──────────────────────────────────────────────────────────────
   Internal helpers
────────────────────────────────────────────────────────────── */

let lastAppliedSignature: string | null = null;
let lastAppliedEnabled = false;

function isBrowser(): boolean {
    return typeof window !== "undefined";
}

function isDocumentAvailable(): boolean {
    return typeof document !== "undefined";
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
    const out = Number(v.toFixed(digits));
    return Number.isFinite(out) ? out : lo;
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

function isRecord(x: unknown): x is Record<string, unknown> {
    return typeof x === "object" && x !== null && !Array.isArray(x);
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
    if (!isBrowser()) return null;
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeLocalStorageSet(key: string, value: string): void {
    if (!isBrowser()) return;
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // ignore
    }
}

function safeLocalStorageRemove(key: string): void {
    if (!isBrowser()) return;
    try {
        window.localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

function isTypographyFont(x: string): x is TypographyFont {
    return (
         x === "inter" ||
         x === "literata" ||
         x === "quicksand" ||
         x === "book" ||
         x === "human" ||
         x === "mono" ||
         x === "custom_1" ||
         x === "custom_2"
    );
}

function normalizeFont(raw: unknown): TypographyFont {
    const s = (toString(raw) ?? "").trim().toLowerCase();
    if (!s) return DEFAULT_TYPOGRAPHY.font;

    if (isTypographyFont(s)) return s;

    // Migrate older ids / synonyms
    if (s === "sans") return "inter";
    if (s === "serif") return "literata";
    if (s === "rounded") return "quicksand";

    // Human names / css fragments
    if (s.includes("inter")) return "inter";
    if (s.includes("literata")) return "literata";
    if (s.includes("quicksand")) return "quicksand";

    if (s.includes("charter") || s.includes("iowan") || s.includes("times") || s.includes("georgia")) {
        return "book";
    }

    if (
         s.includes("ui-sans") ||
         s.includes("system-ui") ||
         s.includes("segoe") ||
         s.includes("roboto") ||
         s.includes("noto sans")
    ) {
        return "human";
    }

    if (
         s.includes("mono") ||
         s.includes("menlo") ||
         s.includes("monaco") ||
         s.includes("consolas") ||
         s.includes("sfmono")
    ) {
        return "mono";
    }

    if (s.includes("custom 1") || s.includes("custom_1")) return "custom_1";
    if (s.includes("custom 2") || s.includes("custom_2")) return "custom_2";

    return DEFAULT_TYPOGRAPHY.font;
}

function normalizeTypography(t: Partial<ReaderTypography> | null | undefined): ReaderTypography {
    return Object.freeze({
        font: normalizeFont(t?.font),
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
    if (!isRecord(parsed)) return null;

    if (parsed.v === 1 && isRecord(parsed.t)) {
        return normalizeTypography(parsed.t as Partial<ReaderTypography>);
    }

    return normalizeTypography(parsed as Partial<ReaderTypography>);
}

function currentRoot(): HTMLElement | null {
    if (!isDocumentAvailable()) return null;
    return document.documentElement;
}

function removeTypographyVars(root: HTMLElement): void {
    root.style.removeProperty("--bpScriptureFont");
    root.style.removeProperty("--bpScriptureSize");
    root.style.removeProperty("--bpScriptureLeading");
    root.style.removeProperty("--bpScriptureWeight");
    root.style.removeProperty("--bpReaderMeasure");
}

function fontLoadProbe(t: ReaderTypography): string {
    const family = getFontCssFamily(t.font);

    if (t.font === "inter" || t.font === "human" || t.font === "custom_1") {
        return `${t.weight} ${t.sizePx}px ${family}`;
    }

    if (t.font === "mono") {
        return `${t.weight} ${t.sizePx}px ${family}`;
    }

    return `${t.weight} ${t.sizePx}px ${family}`;
}

/* ──────────────────────────────────────────────────────────────
   Public helpers
────────────────────────────────────────────────────────────── */

export function typographyLimits() {
    return LIMITS;
}

export function typographySignature(t: ReaderTypography): string {
    return `f=${t.font}|s=${t.sizePx}|w=${t.weight}|l=${t.leading}|m=${t.measurePx}`;
}

export function getFontLabel(font: TypographyFont): string {
    return FONT_PRESETS[font]?.label ?? font;
}

export function getFontCssFamily(font: TypographyFont): string {
    return FONT_PRESETS[font]?.css ?? "var(--font-sans)";
}

export function getFontCategory(font: TypographyFont): FontOption["category"] {
    return FONT_PRESETS[font]?.category ?? "sans";
}

export function normalizeReaderTypography(
     t: Partial<ReaderTypography> | ReaderTypography | null | undefined,
): ReaderTypography {
    return normalizeTypography(t ?? undefined);
}

export function isDefaultTypography(t: ReaderTypography): boolean {
    return typographySignature(normalizeTypography(t)) === typographySignature(DEFAULT_TYPOGRAPHY);
}

/**
 * Try v2 → v1 → legacy keys, normalize, and migrate to v2.
 */
export function loadReaderTypography(): ReaderTypography | null {
    const tryKey = (key: string): ReaderTypography | null => {
        const raw = safeLocalStorageGet(key);
        if (!raw) return null;
        return unwrapTypographyPayload(safeJsonParse(raw));
    };

    const v2 = tryKey(STORAGE_KEY_V2);
    if (v2) return v2;

    const v1 = tryKey(STORAGE_KEY_V1);
    if (v1) {
        saveReaderTypography(v1);
        safeLocalStorageRemove(STORAGE_KEY_V1);
        return v1;
    }

    for (const key of LEGACY_KEYS) {
        const migrated = tryKey(key);
        if (migrated) {
            saveReaderTypography(migrated);
            safeLocalStorageRemove(key);
            return migrated;
        }
    }

    return null;
}

export function saveReaderTypography(t: ReaderTypography): void {
    const normalized = normalizeTypography(t);
    safeLocalStorageSet(STORAGE_KEY_V2, JSON.stringify(normalized));
}

export function saveReaderTypographyEnvelope(t: ReaderTypography): void {
    const normalized = normalizeTypography(t);
    const env: TypographyEnvelopeV1 = { v: 1, t: normalized };
    safeLocalStorageSet(STORAGE_KEY_V2, JSON.stringify(env));
}

export function clearReaderTypography(): void {
    safeLocalStorageRemove(STORAGE_KEY_V2);
}

export function applyReaderTypography(t: ReaderTypography | null): void {
    const root = currentRoot();
    if (!root) return;

    if (!t) {
        if (!lastAppliedEnabled) return;
        removeTypographyVars(root);
        lastAppliedEnabled = false;
        lastAppliedSignature = null;
        return;
    }

    const normalized = normalizeTypography(t);
    const sig = typographySignature(normalized);

    if (lastAppliedEnabled && lastAppliedSignature === sig) {
        return;
    }

    root.style.setProperty("--bpScriptureFont", getFontCssFamily(normalized.font));
    root.style.setProperty("--bpScriptureSize", `${normalized.sizePx}px`);
    root.style.setProperty("--bpScriptureLeading", String(normalized.leading));
    root.style.setProperty("--bpScriptureWeight", String(normalized.weight));
    root.style.setProperty("--bpReaderMeasure", `${normalized.measurePx}px`);

    lastAppliedEnabled = true;
    lastAppliedSignature = sig;
}

export function applyReaderTypographyFromStorage(): ReaderTypography | null {
    const t = loadReaderTypography();
    applyReaderTypography(t);
    return t;
}

export function updateTypography(base: ReaderTypography, patch: Partial<ReaderTypography>): ReaderTypography {
    return normalizeTypography({ ...normalizeTypography(base), ...patch });
}

export function fontOptions(): FontOption[] {
    return (Object.keys(FONT_PRESETS) as TypographyFont[]).map((id) => ({
        id,
        label: FONT_PRESETS[id].label,
        cssFamily: FONT_PRESETS[id].css,
        category: FONT_PRESETS[id].category,
    }));
}

export function fontOptionsByCategory() {
    const out: Record<FontOption["category"], FontOption[]> = {
        sans: [],
        serif: [],
        rounded: [],
        mono: [],
        custom: [],
    };

    for (const option of fontOptions()) {
        out[option.category].push(option);
    }

    return out;
}

/**
 * Best-effort font readiness wait.
 * Useful after a font switch before measuring text / virtual rows / overlays.
 */
export async function waitForFontsIfSupported(timeoutMs = 700): Promise<void> {
    if (!isDocumentAvailable()) return;

    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts || typeof fonts.ready?.then !== "function") return;

    let timeoutId: number | null = null;

    await Promise.race([
        fonts.ready.then(() => undefined).catch(() => undefined),
        new Promise<void>((resolve) => {
            timeoutId = window.setTimeout(() => resolve(), timeoutMs);
        }),
    ]);

    if (timeoutId != null) {
        window.clearTimeout(timeoutId);
    }
}

/**
 * Stronger helper: apply, then wait for fonts.
 * Useful when changing font from a picker and wanting calmer layout.
 */
export async function applyReaderTypographyAndWait(
     t: ReaderTypography | null,
     timeoutMs = 700,
): Promise<void> {
    applyReaderTypography(t);

    if (!t || !isDocumentAvailable()) return;

    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts) {
        await waitForFontsIfSupported(timeoutMs);
        return;
    }

    try {
        const normalized = normalizeTypography(t);
        const probe = fontLoadProbe(normalized);

        const loadPromise =
             typeof fonts.load === "function"
                  ? Promise.allSettled([
                      fonts.load(probe, "The quick brown fox jumps over the lazy dog 0123456789"),
                      fonts.ready,
                  ]).then(() => undefined)
                  : fonts.ready.then(() => undefined);

        let timeoutId: number | null = null;

        await Promise.race([
            loadPromise,
            new Promise<void>((resolve) => {
                timeoutId = window.setTimeout(() => resolve(), timeoutMs);
            }),
        ]);

        if (timeoutId != null) {
            window.clearTimeout(timeoutId);
        }
    } catch {
        await waitForFontsIfSupported(timeoutMs);
    }
}

/**
 * Useful for devtools / reset buttons / external normalization.
 */
export function coerceTypographyPatch(
     patch: Partial<ReaderTypography> | null | undefined,
): Partial<ReaderTypography> {
    if (!patch) return {};

    return {
        ...(patch.font != null ? { font: normalizeFont(patch.font) } : null),
        ...(patch.sizePx != null
             ? {
                 sizePx: clampInt(
                      toNumber(patch.sizePx) ?? DEFAULT_TYPOGRAPHY.sizePx,
                      LIMITS.sizePx.lo,
                      LIMITS.sizePx.hi,
                 ),
             }
             : null),
        ...(patch.weight != null
             ? {
                 weight: clampInt(
                      toNumber(patch.weight) ?? DEFAULT_TYPOGRAPHY.weight,
                      LIMITS.weight.lo,
                      LIMITS.weight.hi,
                 ),
             }
             : null),
        ...(patch.leading != null
             ? {
                 leading: clampFloat(
                      toNumber(patch.leading) ?? DEFAULT_TYPOGRAPHY.leading,
                      LIMITS.leading.lo,
                      LIMITS.leading.hi,
                      LIMITS.leading.digits,
                 ),
             }
             : null),
        ...(patch.measurePx != null
             ? {
                 measurePx: clampInt(
                      toNumber(patch.measurePx) ?? DEFAULT_TYPOGRAPHY.measurePx,
                      LIMITS.measurePx.lo,
                      LIMITS.measurePx.hi,
                 ),
             }
             : null),
    };
}