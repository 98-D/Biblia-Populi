// apps/web/src/reader/ReaderTypographyControl.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    applyReaderTypography,
    clearReaderTypography,
    DEFAULT_TYPOGRAPHY,
    fontOptions,
    loadReaderTypography,
    saveReaderTypography,
    typographyLimits,
    updateTypography,
    type ReaderTypography,
    type TypographyFont,
} from "./typography";

/**
 * Less-is-more Typography Control (compact popover)
 * - No tabs, no big preview cards, no clunky width
 * - Always shows the 5 essentials: Enable + Font + Size + Weight + Leading + Width
 * - Native sliders (arrow keys work automatically when focused)
 * - Left/Right anywhere in panel cycles font (unless a slider is focused)
 */

type FontOpt = ReturnType<typeof fontOptions>[number] & {
    cssFamily?: string;
    family?: string;
};

function clampNum(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const onChange = () => setReduced(mq.matches);
        onChange();
        mq.addEventListener?.("change", onChange);
        return () => mq.removeEventListener?.("change", onChange);
    }, []);
    return reduced;
}

function nextOf<T>(arr: readonly T[], current: T, dir: 1 | -1): T {
    const i = Math.max(0, arr.indexOf(current));
    const n = (i + dir + arr.length) % arr.length;
    return arr[n]!;
}

function fontFamilyForOpt(f: FontOpt): string {
    const fam = (f.cssFamily ?? f.family ?? String(f.id)).trim();
    if (fam.includes(",") || fam.startsWith("var(") || fam.startsWith("ui-") || fam.includes("system-ui")) return fam;
    return `"${fam}", ui-serif, Georgia, Cambria, "Times New Roman", serif`;
}

function useInjectOnceStyle(cssText: string, attr: string): void {
    useEffect(() => {
        if (typeof document === "undefined") return;

        const existing = document.querySelector(`style[${attr}]`);
        if (existing) return;

        const el = document.createElement("style");
        el.setAttribute(attr, "1");
        el.textContent = cssText;
        document.head.appendChild(el);

        return () => el.remove();
    }, [cssText, attr]);
}

function IconAa() {
    return <span style={{ fontWeight: 820, letterSpacing: "-0.06em" }}>Aa</span>;
}
function IconX() {
    return <span style={{ fontSize: 14, lineHeight: 1 }}>✕</span>;
}

export function ReaderTypographyControl() {
    const stored = useMemo(() => loadReaderTypography(), []);
    const [enabled, setEnabled] = useState<boolean>(!!stored);
    const [t, setT] = useState<ReaderTypography>(stored ?? DEFAULT_TYPOGRAPHY);
    const [open, setOpen] = useState(false);

    const reducedMotion = usePrefersReducedMotion();

    const rootRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);

    const limits = useMemo(() => typographyLimits(), []);
    const fonts = useMemo(() => fontOptions() as FontOpt[], []);

    useInjectOnceStyle(
        `
@keyframes bpTypoPop {
  from { opacity: 0; transform: translateY(6px) scale(0.985); }
  to   { opacity: 1; transform: translateY(0px) scale(1); }
}
`,
        "data-bp-typo-pop",
    );

    const ensureEnabled = useCallback(() => {
        if (!enabled) setEnabled(true);
    }, [enabled]);

    const setPatch = useCallback(
        (patch: Partial<ReaderTypography>) => {
            ensureEnabled();
            setT((prev) => updateTypography(prev, patch));
        },
        [ensureEnabled],
    );

    const closePanel = useCallback(() => {
        setOpen(false);
        queueMicrotask(() => triggerRef.current?.focus());
    }, []);

    const resetToDefaults = useCallback(() => {
        setEnabled(false);
        setT(DEFAULT_TYPOGRAPHY);
        setOpen(false);
        queueMicrotask(() => triggerRef.current?.focus());
    }, []);

    // Live apply + save
    useEffect(() => {
        if (!enabled) {
            applyReaderTypography(null);
            clearReaderTypography();
            return;
        }
        applyReaderTypography(t);
        saveReaderTypography(t);
    }, [enabled, t]);

    // Click-outside
    useEffect(() => {
        if (!open) return;

        const onPointerDown = (e: PointerEvent) => {
            const root = rootRef.current;
            if (!root) return;
            if (!root.contains(e.target as Node)) closePanel();
        };

        document.addEventListener("pointerdown", onPointerDown, { capture: true });
        return () => document.removeEventListener("pointerdown", onPointerDown, { capture: true } as any);
    }, [open, closePanel]);

    // Keyboard: Escape closes; Left/Right cycles font unless a slider is focused.
    useEffect(() => {
        if (!open) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                closePanel();
                return;
            }
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (fonts.length === 0) return;

            const ae = document.activeElement as HTMLElement | null;
            const isRange = ae?.tagName === "INPUT" && (ae as HTMLInputElement).type === "range";
            if (isRange) return;

            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                if (!enabled) return;
                const ids = fonts.map((f) => f.id) as TypographyFont[];
                const dir: 1 | -1 = e.key === "ArrowRight" ? 1 : -1;
                setPatch({ font: nextOf(ids, t.font, dir) });
                e.preventDefault();
            }
        };

        window.addEventListener("keydown", onKey, { capture: true });
        return () => window.removeEventListener("keydown", onKey, { capture: true } as any);
    }, [open, closePanel, enabled, fonts, setPatch, t.font]);

    // When opening, focus panel
    useEffect(() => {
        if (!open) return;
        queueMicrotask(() => panelRef.current?.focus());
    }, [open]);

    const onToggleOpen = useCallback(() => setOpen((v) => !v), []);

    const ids = useMemo(() => (fonts.length ? (fonts.map((f) => f.id) as TypographyFont[]) : ([] as TypographyFont[])), [fonts]);

    const fontIndex = useMemo(() => {
        if (fonts.length === 0) return 0;
        const idx = fonts.findIndex((f) => f.id === t.font);
        return idx >= 0 ? idx : 0;
    }, [fonts, t.font]);

    const curFont = useMemo(() => (fonts.length ? fonts[fontIndex]! : null), [fonts, fontIndex]);

    const hopFont = useCallback(
        (dir: -1 | 1) => {
            if (!enabled || ids.length === 0) return;
            setPatch({ font: nextOf(ids, t.font, dir) });
        },
        [enabled, ids, setPatch, t.font],
    );

    const summary = useMemo(() => {
        const size = `${Math.round(t.sizePx)}px`;
        const weight = `${Math.round(t.weight)}`;
        const leading = t.leading.toFixed(2);
        const width = `${Math.round(t.measurePx)}px`;
        return `${t.font} · ${size} · ${weight} · ${leading} · ${width}`;
    }, [t]);

    // Slider specs (inline)
    const leadingStep = useMemo(() => (limits.leading.digits !== undefined ? Math.pow(10, -limits.leading.digits) : 0.01), [limits]);
    const sliderStyle = enabled ? sx.range : { ...sx.range, ...sx.rangeDisabled };

    return (
        <div ref={rootRef} style={sx.root}>
            <button
                ref={triggerRef}
                type="button"
                style={{
                    ...sx.trigger,
                    ...(open ? sx.triggerOpen : {}),
                    ...(enabled ? null : sx.triggerDisabled),
                }}
                onClick={onToggleOpen}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label="Typography settings"
                title={`Typography (${summary})`}
            >
                <span style={sx.triggerGlyph}>
                    <IconAa />
                </span>
                <span style={{ ...sx.dot, ...(enabled ? sx.dotOn : sx.dotOff) }} aria-hidden />
            </button>

            {open && (
                <div
                    ref={panelRef}
                    style={{
                        ...sx.panel,
                        ...(reducedMotion ? sx.panelNoMotion : {}),
                    }}
                    role="dialog"
                    aria-label="Typography settings"
                    tabIndex={-1}
                >
                    {/* Header */}
                    <div style={sx.header}>
                        <div style={sx.hTitle}>Typography</div>

                        <div style={sx.hRight}>
                            <label style={sx.switchLabel} title={enabled ? "Overrides on" : "Overrides off"}>
                                <input
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={() => setEnabled((v) => !v)}
                                    style={sx.switchInput}
                                    aria-label={enabled ? "Turn typography overrides off" : "Turn typography overrides on"}
                                />
                                <span
                                    style={{
                                        ...sx.switchTrack,
                                        background: enabled
                                            ? "color-mix(in oklab, var(--focus) 86%, transparent)"
                                            : "color-mix(in oklab, var(--panel) 92%, transparent)",
                                    }}
                                    aria-hidden
                                />
                                <span
                                    style={{
                                        ...sx.switchThumb,
                                        transform: enabled ? "translateX(12px)" : "translateX(0px)",
                                    }}
                                    aria-hidden
                                />
                            </label>

                            <button type="button" onClick={closePanel} style={sx.iconBtn} aria-label="Close">
                                <IconX />
                            </button>
                        </div>
                    </div>

                    {/* Tiny one-line summary (optional, but tight) */}
                    <div style={sx.sub} title={summary}>
                        {summary}
                    </div>

                    {/* Body */}
                    <div style={sx.body}>
                        {!enabled && (
                            <div style={sx.offRow}>
                                <span style={sx.offPill}>Off</span>
                                <span style={sx.offText}>Enable to apply changes.</span>
                            </div>
                        )}

                        {/* Font row */}
                        <div style={sx.row}>
                            <div style={sx.rowLabel}>Font</div>
                            <div style={sx.rowRight}>
                                <button
                                    type="button"
                                    style={{ ...sx.chevBtn, ...(enabled ? null : sx.chevBtnDisabled) }}
                                    onClick={() => hopFont(-1)}
                                    disabled={!enabled || fonts.length === 0}
                                    aria-label="Previous font"
                                    title="Previous font"
                                >
                                    ‹
                                </button>

                                <button
                                    type="button"
                                    style={{
                                        ...sx.fontPill,
                                        ...(enabled ? null : sx.fontPillDisabled),
                                        ...(curFont ? { fontFamily: fontFamilyForOpt(curFont) } : null),
                                    }}
                                    onClick={() => hopFont(1)}
                                    disabled={!enabled || fonts.length === 0}
                                    aria-label={curFont ? `Font: ${curFont.label}` : "Font"}
                                    title={curFont ? `${curFont.label} (${fontIndex + 1}/${fonts.length})` : "Font"}
                                >
                                    <span style={sx.fontName}>{curFont?.label ?? "—"}</span>
                                    <span style={sx.fontCount}>
                                        {fonts.length ? `${fontIndex + 1}/${fonts.length}` : ""}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    style={{ ...sx.chevBtn, ...(enabled ? null : sx.chevBtnDisabled) }}
                                    onClick={() => hopFont(1)}
                                    disabled={!enabled || fonts.length === 0}
                                    aria-label="Next font"
                                    title="Next font"
                                >
                                    ›
                                </button>
                            </div>
                        </div>

                        {/* Size */}
                        <div style={sx.block}>
                            <div style={sx.blockTop}>
                                <span style={sx.blockLabel}>Size</span>
                                <span style={sx.blockValue}>{Math.round(t.sizePx)}px</span>
                            </div>
                            <input
                                type="range"
                                min={12}
                                max={limits.sizePx.hi}
                                step={limits.sizePx.step}
                                value={t.sizePx}
                                onChange={(e) => setPatch({ sizePx: Math.round(clampNum(Number(e.target.value), 12, limits.sizePx.hi)) })}
                                style={sliderStyle}
                                disabled={!enabled}
                            />
                        </div>

                        {/* Weight */}
                        <div style={sx.block}>
                            <div style={sx.blockTop}>
                                <span style={sx.blockLabel}>Weight</span>
                                <span style={sx.blockValue}>{Math.round(t.weight)}</span>
                            </div>
                            <input
                                type="range"
                                min={200}
                                max={limits.weight.hi}
                                step={limits.weight.step}
                                value={t.weight}
                                onChange={(e) => setPatch({ weight: Math.round(clampNum(Number(e.target.value), 200, limits.weight.hi)) })}
                                style={sliderStyle}
                                disabled={!enabled}
                            />
                        </div>

                        {/* Leading */}
                        <div style={sx.block}>
                            <div style={sx.blockTop}>
                                <span style={sx.blockLabel}>Leading</span>
                                <span style={sx.blockValue}>{t.leading.toFixed(2)}</span>
                            </div>
                            <input
                                type="range"
                                min={0.95}
                                max={limits.leading.hi}
                                step={leadingStep}
                                value={t.leading}
                                onChange={(e) => setPatch({ leading: Number(clampNum(Number(e.target.value), 0.95, limits.leading.hi).toFixed(2)) })}
                                style={sliderStyle}
                                disabled={!enabled}
                            />
                        </div>

                        {/* Width */}
                        <div style={sx.block}>
                            <div style={sx.blockTop}>
                                <span style={sx.blockLabel}>Width</span>
                                <span style={sx.blockValue}>{Math.round(t.measurePx)}px</span>
                            </div>
                            <input
                                type="range"
                                min={240}
                                max={limits.measurePx.hi}
                                step={limits.measurePx.step}
                                value={t.measurePx}
                                onChange={(e) =>
                                    setPatch({ measurePx: Math.round(clampNum(Number(e.target.value), 240, limits.measurePx.hi)) })
                                }
                                style={sliderStyle}
                                disabled={!enabled}
                            />
                        </div>
                    </div>

                    {/* Footer */}
                    <div style={sx.footer}>
                        <button type="button" style={sx.doneBtn} onClick={closePanel}>
                            Done
                        </button>
                        <button type="button" style={sx.resetBtn} onClick={resetToDefaults} title="Reset and turn off overrides">
                            Reset
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

const PANEL_W = 286;

const sx: Record<string, React.CSSProperties> = {
    root: { position: "relative", display: "inline-flex", alignItems: "center" },

    trigger: {
        width: 32,
        height: 32,
        borderRadius: 12,
        border: "1px solid var(--hairline)",
        background: "color-mix(in oklab, var(--panel) 92%, transparent)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        userSelect: "none",
        boxShadow: "0 10px 26px rgba(0,0,0,0.075)",
        transition:
            "transform 200ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 200ms cubic-bezier(0.23, 1, 0.32, 1), border-color 160ms ease, background 160ms ease",
        position: "relative",
        outline: "none",
        WebkitTapHighlightColor: "transparent",
    },
    triggerOpen: {
        transform: "translateY(-2px) scale(1.03)",
        borderColor: "color-mix(in oklab, var(--focus) 70%, var(--hairline))",
        boxShadow: "0 22px 62px rgba(0,0,0,0.18)",
        background: "color-mix(in oklab, var(--panel) 86%, transparent)",
    },
    triggerDisabled: { opacity: 0.92 },
    triggerGlyph: { fontSize: 13.5, fontWeight: 820, letterSpacing: "-0.05em" },

    dot: {
        position: "absolute",
        right: 6,
        bottom: 6,
        width: 7,
        height: 7,
        borderRadius: 999,
        border: "1px solid color-mix(in oklab, var(--hairline) 75%, transparent)",
    },
    dotOn: {
        background: "var(--focus)",
        boxShadow: "0 0 0 4px color-mix(in oklab, var(--focus) 14%, transparent)",
    },
    dotOff: { background: "color-mix(in oklab, var(--muted) 40%, transparent)" },

    panel: {
        position: "absolute",
        right: 0,
        top: 42,
        width: PANEL_W,
        maxWidth: "min(340px, calc(100vw - 18px))",
        borderRadius: 16,
        border: "1px solid color-mix(in oklab, var(--hairline) 92%, transparent)",
        background: "var(--bg)",
        boxShadow: "0 26px 78px rgba(0,0,0,0.20)",
        overflow: "hidden",
        zIndex: 9999,
        padding: 8,
        display: "flex",
        flexDirection: "column",
        gap: 7,
        transformOrigin: "top right",
        animation: "bpTypoPop 170ms cubic-bezier(0.23, 1, 0.32, 1) both",
    },
    panelNoMotion: { animation: "none" },

    header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "1px 1px 0" },
    hTitle: { fontSize: 12.6, fontWeight: 860, letterSpacing: "-0.02em" },
    hRight: { display: "flex", alignItems: "center", gap: 6, flexShrink: 0 },

    sub: {
        fontSize: 10.7,
        color: "var(--muted)",
        letterSpacing: "-0.01em",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        padding: "0 1px",
    },

    iconBtn: {
        width: 28,
        height: 28,
        borderRadius: 999,
        border: "1px solid var(--hairline)",
        background: "color-mix(in oklab, var(--panel) 86%, transparent)",
        color: "var(--muted)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "transform 140ms cubic-bezier(0.23, 1, 0.32, 1), background 140ms ease, border-color 140ms ease",
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
    },

    switchLabel: {
        position: "relative",
        width: 38,
        height: 24,
        borderRadius: 999,
        border: "1px solid var(--hairline)",
        background: "transparent",
        cursor: "pointer",
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
    },
    switchInput: { position: "absolute", inset: 0, opacity: 0, cursor: "pointer" },
    switchTrack: { position: "absolute", inset: 0, borderRadius: 999, transition: "background 180ms ease" },
    switchThumb: {
        position: "absolute",
        top: 3,
        left: 3,
        width: 18,
        height: 18,
        borderRadius: 999,
        background: "var(--bg)",
        border: "1px solid color-mix(in oklab, var(--hairline) 70%, transparent)",
        boxShadow: "0 6px 14px rgba(0,0,0,0.16)",
        transition: "transform 180ms cubic-bezier(0.23, 1, 0.32, 1)",
    },

    body: {
        background: "color-mix(in oklab, var(--bg) 86%, var(--panel))",
        borderRadius: 12,
        border: "1px solid var(--hairline)",
        padding: 8,
        display: "flex",
        flexDirection: "column",
        gap: 8,
    },

    offRow: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        borderRadius: 10,
        border: "1px dashed color-mix(in oklab, var(--hairline) 92%, transparent)",
        background: "color-mix(in oklab, var(--bg) 65%, transparent)",
    },
    offPill: {
        fontSize: 10.2,
        fontWeight: 820,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--muted)",
        padding: "4px 8px",
        borderRadius: 999,
        border: "1px solid var(--hairline)",
        background: "color-mix(in oklab, var(--panel) 90%, transparent)",
    },
    offText: { fontSize: 11.2, color: "var(--muted)" },

    row: { display: "grid", gridTemplateColumns: "56px 1fr", alignItems: "center", gap: 8 },
    rowLabel: { fontSize: 11.6, fontWeight: 820, color: "var(--muted)", letterSpacing: "-0.01em" },
    rowRight: { display: "flex", alignItems: "center", gap: 6 },

    chevBtn: {
        width: 28,
        height: 30,
        borderRadius: 10,
        border: "1px solid var(--hairline)",
        background: "color-mix(in oklab, var(--bg) 72%, var(--panel))",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
        color: "var(--muted)",
        fontSize: 18,
        fontWeight: 760,
    },
    chevBtnDisabled: { cursor: "not-allowed", opacity: 0.55 },

    fontPill: {
        flex: 1,
        height: 30,
        borderRadius: 10,
        border: "1px solid var(--hairline)",
        background: "color-mix(in oklab, var(--panel) 92%, transparent)",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "0 10px",
        minWidth: 0,
        textAlign: "left",
        WebkitTapHighlightColor: "transparent",
    },
    fontPillDisabled: { cursor: "not-allowed", opacity: 0.65 },
    fontName: { fontSize: 11.4, fontWeight: 820, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    fontCount: { fontSize: 10.6, color: "var(--muted)", fontVariantNumeric: "tabular-nums", flexShrink: 0 },

    block: { display: "flex", flexDirection: "column", gap: 6 },
    blockTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
    blockLabel: { fontSize: 11.6, fontWeight: 820, letterSpacing: "-0.01em" },
    blockValue: { fontSize: 11.6, color: "var(--focus)", fontVariantNumeric: "tabular-nums", fontWeight: 860 },

    range: {
        width: "100%",
        accentColor: "var(--focus)",
        cursor: "pointer",
        height: 4,
        borderRadius: 999,
        background: "color-mix(in oklab, var(--hairline) 44%, transparent)",
    },
    rangeDisabled: { cursor: "not-allowed", opacity: 0.55 },

    footer: { display: "flex", alignItems: "center", gap: 6, paddingTop: 1 },
    doneBtn: {
        flex: 1,
        height: 34,
        borderRadius: 11,
        border: "1px solid color-mix(in oklab, var(--focus) 70%, var(--hairline))",
        background: "var(--focus)",
        color: "#fff",
        fontSize: 12.1,
        fontWeight: 860,
        padding: "0 12px",
        cursor: "pointer",
        boxShadow: "0 10px 22px color-mix(in oklab, var(--focus) 22%, transparent)",
        WebkitTapHighlightColor: "transparent",
    },
    resetBtn: {
        height: 34,
        borderRadius: 11,
        border: "1px solid var(--hairline)",
        background: "transparent",
        color: "var(--muted)",
        fontSize: 12.0,
        fontWeight: 740,
        padding: "0 12px",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
    },
};