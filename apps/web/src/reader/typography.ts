// apps/web/src/reader/typography.ts
export type TypographyFont = "serif" | "sans" | "book" | "human";

export type ReaderTypography = Readonly<{
    font: TypographyFont;
    sizePx: number; // 15..26
    weight: 300 | 400 | 500;
    leading: 1.55 | 1.7 | 1.85;
}>;

export const DEFAULT_TYPOGRAPHY: ReaderTypography = {
    font: "serif",
    sizePx: 18,
    weight: 400,
    leading: 1.75 as 1.55 | 1.7 | 1.85, // default CSS value; UI options are constrained below
};

const STORAGE_KEY = "bp_reader_typography_v1";

const FONT_PRESETS: Record<TypographyFont, { label: string; css: string }> = {
    serif: { label: "Serif", css: "var(--font-serif)" },
    sans: { label: "Sans", css: "var(--font-sans)" },

    // “Book-ish” system stacks (still calm, no webfont dependency)
    book: { label: "Book", css: 'ui-serif, Charter, "Iowan Old Style", Georgia, "Times New Roman", Times, serif' },
    human: { label: "Human", css: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, "Noto Sans", sans-serif' },
};

function clampInt(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, Math.round(n)));
}

function isRecord(x: unknown): x is Record<string, unknown> {
    return typeof x === "object" && x !== null;
}

export function loadReaderTypography(): ReaderTypography | null {
    if (typeof window === "undefined") return null;

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
        const parsed: unknown = JSON.parse(raw);
        if (!isRecord(parsed)) return null;

        const font = parsed.font;
        const sizePx = parsed.sizePx;
        const weight = parsed.weight;
        const leading = parsed.leading;

        if (font !== "serif" && font !== "sans" && font !== "book" && font !== "human") return null;

        const size = typeof sizePx === "number" ? clampInt(sizePx, 15, 26) : 18;

        const w: 300 | 400 | 500 =
            weight === 300 || weight === 400 || weight === 500 ? (weight as 300 | 400 | 500) : 400;

        const l: 1.55 | 1.7 | 1.85 =
            leading === 1.55 || leading === 1.7 || leading === 1.85 ? (leading as 1.55 | 1.7 | 1.85) : 1.7;

        return { font, sizePx: size, weight: w, leading: l };
    } catch {
        return null;
    }
}

export function saveReaderTypography(t: ReaderTypography): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
}

export function clearReaderTypography(): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(STORAGE_KEY);
}

export function applyReaderTypography(t: ReaderTypography | null): void {
    if (typeof document === "undefined") return;

    const root = document.documentElement;

    if (!t) {
        root.style.removeProperty("--bpScriptureFont");
        root.style.removeProperty("--bpScriptureSize");
        root.style.removeProperty("--bpScriptureLeading");
        root.style.removeProperty("--bpScriptureWeight");
        return;
    }

    const fontCss = FONT_PRESETS[t.font]?.css ?? "var(--font-serif)";

    root.style.setProperty("--bpScriptureFont", fontCss);
    root.style.setProperty("--bpScriptureSize", `${t.sizePx}px`);
    root.style.setProperty("--bpScriptureLeading", String(t.leading));
    root.style.setProperty("--bpScriptureWeight", String(t.weight));
}

export function fontOptions(): Array<{ id: TypographyFont; label: string }> {
    return (Object.keys(FONT_PRESETS) as TypographyFont[]).map((k) => ({ id: k, label: FONT_PRESETS[k].label }));
}