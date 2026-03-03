// apps/web/src/reader/typography.ts

export type TypographyFont = "serif" | "sans" | "rounded" | "book" | "human";

export type ReaderTypography = Readonly<{
    font: TypographyFont;

    // Scripture text only
    sizePx: number;      // 15..30 (clamped)
    weight: number;      // 250..650 (clamped, integer)
    leading: number;     // 1.45..2.10 (clamped)

    // Reader layout (also affects controls + headers alignment)
    measurePx: number;   // 560..980 (clamped)
}>;

export const DEFAULT_TYPOGRAPHY: ReaderTypography = {
    font: "serif",
    sizePx: 18,
    weight: 400,
    leading: 1.75,
    measurePx: 840,
};

// v2 adds measure + continuous sliders; we still read v1 and migrate.
const STORAGE_KEY_V2 = "bp_reader_typography_v2";
const STORAGE_KEY_V1 = "bp_reader_typography_v1";

const FONT_PRESETS: Record<TypographyFont, { label: string; css: string }> = {
    // These resolve to stacks defined in base.css.
    serif: { label: "Literata", css: "var(--font-serif)" },
    sans: { label: "Inter", css: "var(--font-sans)" },
    rounded: { label: "Quicksand", css: "var(--font-rounded)" },

    // “Book-ish” system stacks (no webfont dependency)
    book: { label: "Book", css: 'ui-serif, Charter, "Iowan Old Style", Georgia, "Times New Roman", Times, serif' },
    human: { label: "Human", css: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, "Noto Sans", sans-serif' },
};

function clamp(n: number, lo: number, hi: number): number {
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
}

function clampInt(n: number, lo: number, hi: number): number {
    return Math.round(clamp(n, lo, hi));
}

function clampFloat(n: number, lo: number, hi: number, digits = 2): number {
    const v = clamp(n, lo, hi);
    const f = Number(v.toFixed(digits));
    return Number.isFinite(f) ? f : lo;
}

function isRecord(x: unknown): x is Record<string, unknown> {
    return typeof x === "object" && x !== null;
}

function parseAny(jsonText: string): unknown | null {
    try {
        return JSON.parse(jsonText) as unknown;
    } catch {
        return null;
    }
}

function readStorage(key: string): unknown | null {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return parseAny(raw);
}

function parseV2(parsed: unknown): ReaderTypography | null {
    if (!isRecord(parsed)) return null;

    const font = parsed.font;
    if (font !== "serif" && font !== "sans" && font !== "rounded" && font !== "book" && font !== "human") return null;

    const sizePx = clampInt(typeof parsed.sizePx === "number" ? parsed.sizePx : DEFAULT_TYPOGRAPHY.sizePx, 15, 30);
    const weight = clampInt(typeof parsed.weight === "number" ? parsed.weight : DEFAULT_TYPOGRAPHY.weight, 250, 650);
    const leading = clampFloat(typeof parsed.leading === "number" ? parsed.leading : DEFAULT_TYPOGRAPHY.leading, 1.45, 2.1, 2);
    const measurePx = clampInt(typeof parsed.measurePx === "number" ? parsed.measurePx : DEFAULT_TYPOGRAPHY.measurePx, 560, 980);

    return { font, sizePx, weight, leading, measurePx };
}

function parseV1(parsed: unknown): ReaderTypography | null {
    if (!isRecord(parsed)) return null;

    // v1 font ids:
    //   "serif" | "sans" | "book" | "human"
    // v1 weight:
    //   300 | 400 | 500
    // v1 leading:
    //   1.55 | 1.7 | 1.85
    const font = parsed.font;
    if (font !== "serif" && font !== "sans" && font !== "book" && font !== "human") return null;

    const sizePx = clampInt(typeof parsed.sizePx === "number" ? parsed.sizePx : 18, 15, 26);
    const weight = clampInt(typeof parsed.weight === "number" ? parsed.weight : 400, 250, 650);
    const leading = clampFloat(typeof parsed.leading === "number" ? parsed.leading : 1.7, 1.45, 2.1, 2);

    return { font, sizePx, weight, leading, measurePx: DEFAULT_TYPOGRAPHY.measurePx };
}

export function loadReaderTypography(): ReaderTypography | null {
    const v2 = readStorage(STORAGE_KEY_V2);
    const parsed2 = v2 ? parseV2(v2) : null;
    if (parsed2) return parsed2;

    const v1 = readStorage(STORAGE_KEY_V1);
    const parsed1 = v1 ? parseV1(v1) : null;
    if (!parsed1) return null;

    // Migrate forward (best-effort)
    saveReaderTypography(parsed1);
    try {
        window.localStorage.removeItem(STORAGE_KEY_V1);
    } catch {
        // ignore
    }
    return parsed1;
}

export function saveReaderTypography(t: ReaderTypography): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(t));
}

export function clearReaderTypography(): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(STORAGE_KEY_V2);
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
    root.style.setProperty("--bpScriptureSize", `${clampInt(t.sizePx, 15, 30)}px`);
    root.style.setProperty("--bpScriptureLeading", String(clampFloat(t.leading, 1.45, 2.1, 2)));
    root.style.setProperty("--bpScriptureWeight", String(clampInt(t.weight, 250, 650)));
    root.style.setProperty("--bpReaderMeasure", `${clampInt(t.measurePx, 560, 980)}px`);
}

export function fontOptions(): Array<{ id: TypographyFont; label: string }> {
    return (Object.keys(FONT_PRESETS) as TypographyFont[]).map((k) => ({ id: k, label: FONT_PRESETS[k].label }));
}