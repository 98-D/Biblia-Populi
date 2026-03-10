// cspell:words Literata literata Segoe Noto sfmono
// apps/web/src/reader/typography.ts
//
// Biblia.to — reader typography + layout tuning
//
// Goals:
// - persist stable font IDs, never raw CSS strings
// - normalize + clamp deterministically
// - migrate older saves cleanly
// - one authoritative apply() to <html>
// - explicit modern font presets with richer metadata
// - stable helpers for virtualizer / measurement calm
// - hardened storage / migration / SSR safety

export type TypographyFont =
    | "inter"
    | "literata"
    | "quicksand"
    | "book"
    | "human"
    | "mono"
    | "custom_1"
    | "custom_2";

export type TypographyCategory =
    | "sans"
    | "serif"
    | "rounded"
    | "mono"
    | "custom";

export type ReaderTypography = Readonly<{
    font: TypographyFont;
    sizePx: number; // 12..30
    weight: number; // 200..700
    leading: number; // 0.95..2.1
    measurePx: number; // 535..980
}>;

export type TypographyLimits = Readonly<{
    sizePx: Readonly<{ lo: number; hi: number; step: number }>;
    weight: Readonly<{ lo: number; hi: number; step: number }>;
    leading: Readonly<{ lo: number; hi: number; digits: number }>;
    measurePx: Readonly<{ lo: number; hi: number; step: number }>;
}>;

export type FontPreset = Readonly<{
    label: string;
    css: string;
    category: TypographyCategory;
    previewText: string;
    uiFamily?: string;
    aliases?: readonly string[];
}>;

export type FontOption = Readonly<{
    id: TypographyFont;
    label: string;
    cssFamily: string;
    previewFamily: string;
    category: TypographyCategory;
    previewText: string;
}>;

type MutableTypographyPatch = {
    font?: TypographyFont;
    sizePx?: number;
    weight?: number;
    leading?: number;
    measurePx?: number;
};

type TypographyEnvelopeV1 = Readonly<{
    v: 1;
    t: ReaderTypography;
}>;

type StoredTypographyEnvelope = TypographyEnvelopeV1;

type FontFaceSetLike = {
    ready: Promise<unknown>;
};

type DocumentWithFonts = Document & {
    fonts?: FontFaceSetLike;
};

const STORAGE_KEY_V2 = "bp_reader_typography_v2";
const STORAGE_KEY_V1 = "bp_reader_typography_v1";
const LEGACY_KEYS = Object.freeze([
    "bp_reader_typography",
    "bp_typography",
] as const);

const CSS_VAR_FONT = "--bpScriptureFont";
const CSS_VAR_SIZE = "--bpScriptureSize";
const CSS_VAR_LEADING = "--bpScriptureLeading";
const CSS_VAR_WEIGHT = "--bpScriptureWeight";
const CSS_VAR_MEASURE = "--bpReaderMeasure";

const LIMITS: TypographyLimits = Object.freeze({
    sizePx: Object.freeze({ lo: 12, hi: 30, step: 1 }),
    weight: Object.freeze({ lo: 200, hi: 700, step: 1 }),
    leading: Object.freeze({ lo: 0.95, hi: 2.1, digits: 2 }),
    measurePx: Object.freeze({ lo: 535, hi: 980, step: 1 }),
});

const FONT_ORDER = Object.freeze([
    "inter",
    "literata",
    "quicksand",
    "book",
    "human",
    "mono",
    "custom_1",
    "custom_2",
] satisfies readonly TypographyFont[]);

export const DEFAULT_TYPOGRAPHY: ReaderTypography = Object.freeze({
    font: "inter",
    sizePx: 18,
    weight: 400,
    leading: 1.72,
    measurePx: 820,
});

/**
 * Keep IDs stable forever.
 * CSS family strings may evolve, IDs must not.
 */
export const FONT_PRESETS: Readonly<Record<TypographyFont, FontPreset>> = Object.freeze({
    inter: Object.freeze({
        label: "Inter",
        css: "var(--font-sans)",
        category: "sans",
        previewText: "Blessed are the pure in heart.",
        uiFamily: "var(--font-sans)",
        aliases: Object.freeze([
            "sans",
            "ui sans",
            "ui-sans",
            "modern sans",
            "inter variable",
            "--font-sans",
        ]),
    }),

    literata: Object.freeze({
        label: "Literata",
        css: "var(--font-serif)",
        category: "serif",
        previewText: "In the beginning God created the heaven and the earth.",
        uiFamily: "var(--font-serif)",
        aliases: Object.freeze([
            "serif",
            "book serif",
            "literata variable",
            "--font-serif",
        ]),
    }),

    quicksand: Object.freeze({
        label: "Quicksand",
        css: "var(--font-rounded)",
        category: "rounded",
        previewText: "Let there be light.",
        uiFamily: "var(--font-rounded)",
        aliases: Object.freeze([
            "rounded",
            "soft sans",
            "friendly",
            "--font-rounded",
        ]),
    }),

    book: Object.freeze({
        label: "Book Serif",
        css: 'ui-serif, Charter, "Iowan Old Style", Georgia, "Times New Roman", Times, serif',
        category: "serif",
        previewText: "The Lord is my shepherd; I shall not want.",
        uiFamily: 'ui-serif, Charter, "Iowan Old Style", Georgia, serif',
        aliases: Object.freeze([
            "charter",
            "iowan",
            "georgia",
            "times",
            "traditional serif",
            "book serif",
        ]),
    }),

    human: Object.freeze({
        label: "Human Sans",
        css: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, "Noto Sans", sans-serif',
        category: "sans",
        previewText: "The earth was without form, and void.",
        uiFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
        aliases: Object.freeze([
            "system",
            "system ui",
            "system-ui",
            "ui sans serif",
            "ui-sans-serif",
            "ui-sans",
            "human sans",
            "humanist sans",
            "roboto",
            "segoe",
            "noto sans",
        ]),
    }),

    mono: Object.freeze({
        label: "Reader Mono",
        css: 'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        category: "mono",
        previewText: "GEN 1:1  In the beginning God created...",
        uiFamily: 'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace',
        aliases: Object.freeze([
            "mono",
            "monospace",
            "reader mono",
            "menlo",
            "monaco",
            "consolas",
            "sfmono",
            "sfmono-regular",
        ]),
    }),

    custom_1: Object.freeze({
        label: "Custom 1",
        css: "var(--font-custom-1, var(--font-sans))",
        category: "custom",
        previewText: "Custom family preview one.",
        uiFamily: "var(--font-custom-1, var(--font-sans))",
        aliases: Object.freeze([
            "custom 1",
            "custom_1",
            "--font-custom-1",
        ]),
    }),

    custom_2: Object.freeze({
        label: "Custom 2",
        css: "var(--font-custom-2, var(--font-serif))",
        category: "custom",
        previewText: "Custom family preview two.",
        uiFamily: "var(--font-custom-2, var(--font-serif))",
        aliases: Object.freeze([
            "custom 2",
            "custom_2",
            "--font-custom-2",
        ]),
    }),
});

const FONT_OPTIONS: ReadonlyArray<FontOption> = Object.freeze(
    FONT_ORDER.map((id) =>
        Object.freeze({
            id,
            label: FONT_PRESETS[id].label,
            cssFamily: FONT_PRESETS[id].css,
            previewFamily: FONT_PRESETS[id].uiFamily ?? FONT_PRESETS[id].css,
            category: FONT_PRESETS[id].category,
            previewText: FONT_PRESETS[id].previewText,
        }),
    ),
);

let lastAppliedSignature: string | null = null;
let lastAppliedEnabled = false;

function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof document !== "undefined";
}

function isDocumentAvailable(): boolean {
    return typeof document !== "undefined";
}

function currentRoot(): HTMLElement | null {
    if (!isDocumentAvailable()) return null;
    return document.documentElement;
}

function clamp(n: number, lo: number, hi: number): number {
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
}

function snapInt(n: number, lo: number, hi: number, step: number): number {
    const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
    const v = clamp(n, lo, hi);
    const snapped = lo + Math.round((v - lo) / safeStep) * safeStep;
    return Math.round(clamp(snapped, lo, hi));
}

function clampFloat(n: number, lo: number, hi: number, digits: number): number {
    const v = clamp(n, lo, hi);
    const out = Number(v.toFixed(digits));
    return Number.isFinite(out) ? out : lo;
}

function toNumber(x: unknown): number | null {
    if (typeof x === "number" && Number.isFinite(x)) return x;

    if (typeof x === "string") {
        const trimmed = x.trim();
        if (!trimmed) return null;
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : null;
    }

    return null;
}

function toString(x: unknown): string | null {
    return typeof x === "string" ? x : null;
}

function normalizeLooseString(x: unknown): string {
    return (toString(x) ?? "").trim().toLowerCase().replace(/\s+/g, " ");
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
        // ignore storage failures
    }
}

function safeLocalStorageRemove(key: string): void {
    if (!isBrowser()) return;

    try {
        window.localStorage.removeItem(key);
    } catch {
        // ignore storage failures
    }
}

function isTypographyFont(x: string): x is TypographyFont {
    switch (x) {
        case "inter":
        case "literata":
        case "quicksand":
        case "book":
        case "human":
        case "mono":
        case "custom_1":
        case "custom_2":
            return true;
        default:
            return false;
    }
}

function includesAlias(haystack: string, aliases: readonly string[] | undefined): boolean {
    if (!aliases || aliases.length === 0) return false;

    for (const alias of aliases) {
        const a = normalizeLooseString(alias);
        if (a && haystack.includes(a)) return true;
    }

    return false;
}

function normalizeFont(raw: unknown): TypographyFont {
    const s = normalizeLooseString(raw);
    if (!s) return DEFAULT_TYPOGRAPHY.font;
    if (isTypographyFont(s)) return s;

    for (const id of FONT_ORDER) {
        const preset = FONT_PRESETS[id];
        const normalizedLabel = normalizeLooseString(preset.label);
        const normalizedCss = normalizeLooseString(preset.css);

        if (s === normalizedLabel) return id;
        if (s === normalizedCss) return id;
        if (s === id.replace(/_/g, " ")) return id;
        if (includesAlias(s, preset.aliases)) return id;
    }

    if (s === "sans") return "inter";
    if (s === "serif") return "literata";
    if (s === "rounded") return "quicksand";
    if (s === "mono" || s === "monospace") return "mono";
    if (s === "system") return "human";

    return DEFAULT_TYPOGRAPHY.font;
}

function normalizeTypography(
    t: Partial<ReaderTypography> | null | undefined,
): ReaderTypography {
    return Object.freeze({
        font: normalizeFont(t?.font),
        sizePx: snapInt(
            toNumber(t?.sizePx) ?? DEFAULT_TYPOGRAPHY.sizePx,
            LIMITS.sizePx.lo,
            LIMITS.sizePx.hi,
            LIMITS.sizePx.step,
        ),
        weight: snapInt(
            toNumber(t?.weight) ?? DEFAULT_TYPOGRAPHY.weight,
            LIMITS.weight.lo,
            LIMITS.weight.hi,
            LIMITS.weight.step,
        ),
        leading: clampFloat(
            toNumber(t?.leading) ?? DEFAULT_TYPOGRAPHY.leading,
            LIMITS.leading.lo,
            LIMITS.leading.hi,
            LIMITS.leading.digits,
        ),
        measurePx: snapInt(
            toNumber(t?.measurePx) ?? DEFAULT_TYPOGRAPHY.measurePx,
            LIMITS.measurePx.lo,
            LIMITS.measurePx.hi,
            LIMITS.measurePx.step,
        ),
    });
}

function isEnvelopeV1(parsed: unknown): parsed is TypographyEnvelopeV1 {
    return (
        isRecord(parsed) &&
        parsed.v === 1 &&
        isRecord(parsed.t)
    );
}

function unwrapTypographyPayload(parsed: unknown): ReaderTypography | null {
    if (!parsed) return null;

    if (isEnvelopeV1(parsed)) {
        return normalizeTypography(parsed.t);
    }

    if (isRecord(parsed)) {
        return normalizeTypography(parsed as Partial<ReaderTypography>);
    }

    return null;
}

function buildTypographyEnvelope(t: ReaderTypography): StoredTypographyEnvelope {
    return Object.freeze({
        v: 1,
        t: normalizeTypography(t),
    });
}

function removeTypographyVars(root: HTMLElement): void {
    root.style.removeProperty(CSS_VAR_FONT);
    root.style.removeProperty(CSS_VAR_SIZE);
    root.style.removeProperty(CSS_VAR_LEADING);
    root.style.removeProperty(CSS_VAR_WEIGHT);
    root.style.removeProperty(CSS_VAR_MEASURE);
}

function resetAppliedState(): void {
    lastAppliedEnabled = false;
    lastAppliedSignature = null;
}

function purgeLegacyKeys(): void {
    safeLocalStorageRemove(STORAGE_KEY_V1);

    for (const key of LEGACY_KEYS) {
        safeLocalStorageRemove(key);
    }
}

function tryLoadFromKey(key: string): ReaderTypography | null {
    const raw = safeLocalStorageGet(key);
    if (!raw) return null;
    return unwrapTypographyPayload(safeJsonParse(raw));
}

export function typographyLimits(): TypographyLimits {
    return LIMITS;
}

export function typographySignature(t: ReaderTypography): string {
    const normalized = normalizeTypography(t);

    return [
        `f=${normalized.font}`,
        `s=${normalized.sizePx}`,
        `w=${normalized.weight}`,
        `l=${normalized.leading.toFixed(LIMITS.leading.digits)}`,
        `m=${normalized.measurePx}`,
    ].join("|");
}

export function getFontCssFamily(font: TypographyFont): string {
    return FONT_PRESETS[font]?.css ?? FONT_PRESETS.inter.css;
}

export function getFontPreset(font: TypographyFont): FontPreset {
    return FONT_PRESETS[font] ?? FONT_PRESETS.inter;
}

export function getFontLabel(font: TypographyFont): string {
    return getFontPreset(font).label;
}

export function normalizeReaderTypography(
    t: Partial<ReaderTypography> | ReaderTypography | null | undefined,
): ReaderTypography {
    return normalizeTypography(t ?? undefined);
}

export function coerceTypographyPatch(
    patch: Partial<ReaderTypography> | null | undefined,
): Partial<ReaderTypography> {
    if (!patch) return {};

    const out: MutableTypographyPatch = {};

    if (patch.font != null) {
        out.font = normalizeFont(patch.font);
    }

    if (patch.sizePx != null) {
        out.sizePx = snapInt(
            toNumber(patch.sizePx) ?? DEFAULT_TYPOGRAPHY.sizePx,
            LIMITS.sizePx.lo,
            LIMITS.sizePx.hi,
            LIMITS.sizePx.step,
        );
    }

    if (patch.weight != null) {
        out.weight = snapInt(
            toNumber(patch.weight) ?? DEFAULT_TYPOGRAPHY.weight,
            LIMITS.weight.lo,
            LIMITS.weight.hi,
            LIMITS.weight.step,
        );
    }

    if (patch.leading != null) {
        out.leading = clampFloat(
            toNumber(patch.leading) ?? DEFAULT_TYPOGRAPHY.leading,
            LIMITS.leading.lo,
            LIMITS.leading.hi,
            LIMITS.leading.digits,
        );
    }

    if (patch.measurePx != null) {
        out.measurePx = snapInt(
            toNumber(patch.measurePx) ?? DEFAULT_TYPOGRAPHY.measurePx,
            LIMITS.measurePx.lo,
            LIMITS.measurePx.hi,
            LIMITS.measurePx.step,
        );
    }

    return out;
}

export function updateTypography(
    base: ReaderTypography,
    patch: Partial<ReaderTypography>,
): ReaderTypography {
    return normalizeTypography({
        ...normalizeTypography(base),
        ...coerceTypographyPatch(patch),
    });
}

export function fontOptions(): FontOption[] {
    return [...FONT_OPTIONS];
}

/**
 * Try v2 -> v1 -> legacy keys.
 * Any successful non-v2 read is migrated forward immediately.
 */
export function loadReaderTypography(): ReaderTypography | null {
    const v2 = tryLoadFromKey(STORAGE_KEY_V2);
    if (v2) return v2;

    const v1 = tryLoadFromKey(STORAGE_KEY_V1);
    if (v1) {
        saveReaderTypographyEnvelope(v1);
        purgeLegacyKeys();
        return v1;
    }

    for (const key of LEGACY_KEYS) {
        const migrated = tryLoadFromKey(key);
        if (migrated) {
            saveReaderTypographyEnvelope(migrated);
            purgeLegacyKeys();
            return migrated;
        }
    }

    return null;
}

export function saveReaderTypography(t: ReaderTypography): void {
    saveReaderTypographyEnvelope(t);
}

export function saveReaderTypographyEnvelope(t: ReaderTypography): void {
    const env = buildTypographyEnvelope(t);
    safeLocalStorageSet(STORAGE_KEY_V2, JSON.stringify(env));
}

export function clearReaderTypography(): void {
    safeLocalStorageRemove(STORAGE_KEY_V2);
    purgeLegacyKeys();
    resetAppliedState();
}

export function clearAppliedReaderTypography(): void {
    const root = currentRoot();
    if (root) {
        removeTypographyVars(root);
    }
    resetAppliedState();
}

export function applyReaderTypography(t: ReaderTypography | null): void {
    const root = currentRoot();
    if (!root) return;

    if (!t) {
        if (!lastAppliedEnabled) return;
        removeTypographyVars(root);
        resetAppliedState();
        return;
    }

    const normalized = normalizeTypography(t);
    const sig = typographySignature(normalized);

    if (lastAppliedEnabled && lastAppliedSignature === sig) {
        return;
    }

    root.style.setProperty(CSS_VAR_FONT, getFontCssFamily(normalized.font));
    root.style.setProperty(CSS_VAR_SIZE, `${normalized.sizePx}px`);
    root.style.setProperty(CSS_VAR_LEADING, String(normalized.leading));
    root.style.setProperty(CSS_VAR_WEIGHT, String(normalized.weight));
    root.style.setProperty(CSS_VAR_MEASURE, `${normalized.measurePx}px`);

    lastAppliedEnabled = true;
    lastAppliedSignature = sig;
}

export function applyReaderTypographyFromStorage(): ReaderTypography | null {
    const t = loadReaderTypography();
    applyReaderTypography(t);
    return t;
}

/**
 * Best-effort wait for document fonts readiness.
 * Safe in SSR / restricted browser contexts.
 */
export async function waitForFontsIfSupported(timeoutMs = 700): Promise<void> {
    if (!isBrowser()) return;

    const doc = document as DocumentWithFonts;
    const fonts = doc.fonts;
    if (!fonts || typeof fonts.ready?.then !== "function") return;

    let timeoutId: number | null = null;

    try {
        await Promise.race([
            fonts.ready.then(() => undefined).catch(() => undefined),
            new Promise<void>((resolve) => {
                timeoutId = window.setTimeout(resolve, Math.max(0, timeoutMs));
            }),
        ]);
    } finally {
        if (timeoutId != null) {
            window.clearTimeout(timeoutId);
        }
    }
}