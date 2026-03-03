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

type ActiveId = "font" | "sizePx" | "weight" | "leading" | "measurePx";

type TabSpec = {
    id: ActiveId;
    label: string;
    icon: React.ReactNode;
};

type SliderSpec = {
    id: Exclude<ActiveId, "font">;
    min: number;
    max: number;
    step: number;
    fmt: (t: ReaderTypography) => string;
    get: (t: ReaderTypography) => number;
    set: (v: number) => Partial<ReaderTypography>;
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

function IconAa() {
    return <span style={{ fontWeight: 820, letterSpacing: "-0.06em" }}>Aa</span>;
}
function IconFont() {
    return (
        <span style={{ fontFamily: "ui-serif, Georgia, serif", fontStyle: "italic", fontWeight: 650 }}>
            f
        </span>
    );
}
function IconWeight() {
    return <span style={{ fontWeight: 920 }}>B</span>;
}
function IconLeading() {
    return <span style={{ display: "inline-block", transform: "translateY(-0.5px)" }}>↕</span>;
}
function IconMeasure() {
    return <span style={{ display: "inline-block", transform: "translateY(-0.5px)" }}>↔</span>;
}
function IconX() {
    return <span style={{ fontSize: 14, lineHeight: 1 }}>✕</span>;
}

function nextOf<T>(arr: readonly T[], current: T, dir: 1 | -1): T {
    const i = Math.max(0, arr.indexOf(current));
    const n = (i + dir + arr.length) % arr.length;
    return arr[n]!;
}

/**
 * We support BOTH:
 * - updated typography.ts: fontOptions() returns { id, label, cssFamily }
 * - older typography.ts: fontOptions() returns { id, label } only
 */
type FontOpt = ReturnType<typeof fontOptions>[number] & {
    cssFamily?: string; // preferred (maps to FONT_PRESETS[k].css)
    family?: string; // tolerated legacy
};

function fontFamilyForOpt(f: FontOpt): string {
    const fam = (f.cssFamily ?? f.family ?? String(f.id)).trim();
    if (fam.includes(",") || fam.startsWith("var(") || fam.startsWith("ui-") || fam.includes("system-ui")) return fam;
    return `"${fam}", ui-serif, Georgia, Cambria, "Times New Roman", serif`;
}

function previewBlurb(): string {
    // Slightly longer so you can judge rhythm; we clamp to 3 lines now.
    return "In the beginning God created the heaven and the earth. And the earth was without form, and void; and darkness was upon the face of the deep.";
}

/** Single-card “carousel” font picker */
function clampIndex(i: number, len: number): number {
    if (len <= 0) return 0;
    return ((i % len) + len) % len;
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

/** helps avoid floating drift when step is 0.01 etc */
function dirStep(step: number): number {
    if (Number.isInteger(step)) return step;
    return Number(step.toFixed(2));
}

export function ReaderTypographyControl() {
    const stored = useMemo(() => loadReaderTypography(), []);
    const [enabled, setEnabled] = useState<boolean>(!!stored);
    const [t, setT] = useState<ReaderTypography>(stored ?? DEFAULT_TYPOGRAPHY);
    const [open, setOpen] = useState(false);
    const [activeId, setActiveId] = useState<ActiveId>("sizePx");

    const reducedMotion = usePrefersReducedMotion();

    const rootRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);

    const limits = useMemo(() => typographyLimits(), []);
    const fonts = useMemo(() => fontOptions() as FontOpt[], []);

    // Keyframes + small helpers for multi-line clamp (once)
    useInjectOnceStyle(
        `
@keyframes bpTypographyPop {
  from { opacity: 0; transform: translateY(6px) scale(0.985); }
  to   { opacity: 1; transform: translateY(0px) scale(1); }
}
/* 2/3-line clamp utilities */
[data-bp-lines="2"]{
  display:-webkit-box;
  -webkit-box-orient:vertical;
  -webkit-line-clamp:2;
  overflow:hidden;
}
[data-bp-lines="3"]{
  display:-webkit-box;
  -webkit-box-orient:vertical;
  -webkit-line-clamp:3;
  overflow:hidden;
}
`,
        "data-bp-typography-keyframes",
    );

    const tabs: TabSpec[] = useMemo(
        () => [
            { id: "font", label: "Font", icon: <IconFont /> },
            { id: "sizePx", label: "Size", icon: <IconAa /> },
            { id: "weight", label: "Weight", icon: <IconWeight /> },
            { id: "leading", label: "Leading", icon: <IconLeading /> },
            { id: "measurePx", label: "Width", icon: <IconMeasure /> },
        ],
        [],
    );

    const sliders: SliderSpec[] = useMemo(() => {
        const leadingStep = limits.leading.digits !== undefined ? Math.pow(10, -limits.leading.digits) : 0.01;

        return [
            {
                id: "sizePx",
                min: 12,
                max: limits.sizePx.hi,
                step: limits.sizePx.step,
                fmt: (tt) => `${Math.round(tt.sizePx)}px`,
                get: (tt) => tt.sizePx,
                set: (v) => ({ sizePx: Math.round(v) }),
            },
            {
                id: "weight",
                min: 200,
                max: limits.weight.hi,
                step: limits.weight.step,
                fmt: (tt) => `${Math.round(tt.weight)}`,
                get: (tt) => tt.weight,
                set: (v) => ({ weight: Math.round(v) }),
            },
            {
                id: "leading",
                min: 0.95,
                max: limits.leading.hi,
                step: leadingStep,
                fmt: (tt) => tt.leading.toFixed(2),
                get: (tt) => tt.leading,
                set: (v) => ({ leading: Number(v.toFixed(2)) }),
            },
            {
                id: "measurePx",
                min: 240,
                max: limits.measurePx.hi,
                step: limits.measurePx.step,
                fmt: (tt) => `${Math.round(tt.measurePx)}px`,
                get: (tt) => tt.measurePx,
                set: (v) => ({ measurePx: Math.round(v) }),
            },
        ];
    }, [limits]);

    const activeSlider = useMemo(() => sliders.find((s) => s.id === activeId), [sliders, activeId]);

    const summary = useMemo(() => {
        const size = `${Math.round(t.sizePx)}px`;
        const weight = `${Math.round(t.weight)}`;
        const leading = t.leading.toFixed(2);
        const width = `${Math.round(t.measurePx)}px`;
        return `${t.font} · ${size} · ${weight} · ${leading} · ${width}`;
    }, [t]);

    const isActuallyEnabled = enabled;

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
        setActiveId("sizePx");
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

    // Keyboard: Escape + arrows
    useEffect(() => {
        if (!open) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                closePanel();
                return;
            }
            if (e.metaKey || e.ctrlKey || e.altKey) return;

            // Font tab: left/right hop fonts.
            if (activeId === "font" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
                if (!isActuallyEnabled || fonts.length === 0) return;
                const ids = fonts.map((f) => f.id) as TypographyFont[];
                const dir: 1 | -1 = e.key === "ArrowRight" ? 1 : -1;
                setPatch({ font: nextOf(ids, t.font, dir) });
                e.preventDefault();
                return;
            }

            // Left/right: switch tabs.
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                const ids = tabs.map((x) => x.id);
                const dir: 1 | -1 = e.key === "ArrowRight" ? 1 : -1;
                setActiveId((prev) => nextOf(ids, prev, dir));
                e.preventDefault();
                return;
            }

            // Up/down: nudge slider.
            if (activeSlider && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                if (!isActuallyEnabled) return;
                const dir = e.key === "ArrowUp" ? 1 : -1;
                const cur = activeSlider.get(t);
                const next = clampNum(cur + dir * activeSlider.step, activeSlider.min, activeSlider.max);
                setPatch(activeSlider.set(next));
                e.preventDefault();
                return;
            }
        };

        window.addEventListener("keydown", onKey, { capture: true });
        return () => window.removeEventListener("keydown", onKey, { capture: true } as any);
    }, [open, activeId, tabs, activeSlider, t, isActuallyEnabled, setPatch, closePanel, fonts]);

    // When opening, focus panel.
    useEffect(() => {
        if (!open) return;
        queueMicrotask(() => panelRef.current?.focus());
    }, [open]);

    const onToggle = useCallback(() => setOpen((v) => !v), []);
    const toggleEnabled = useCallback(() => setEnabled((v) => !v), []);
    const onReset = useCallback(() => resetToDefaults(), [resetToDefaults]);

    const activeTab = useMemo(() => tabs.find((x) => x.id === activeId), [tabs, activeId]);
    const activeLabel = activeTab?.label ?? "Typography";

    // --- Font carousel derived from current selection ---
    const fontIndex = useMemo(() => {
        if (fonts.length === 0) return 0;
        const idx = fonts.findIndex((f) => f.id === t.font);
        return idx >= 0 ? idx : 0;
    }, [fonts, t.font]);

    const prevFont = useMemo(
        () => (fonts.length ? fonts[clampIndex(fontIndex - 1, fonts.length)]! : null),
        [fonts, fontIndex],
    );
    const curFont = useMemo(() => (fonts.length ? fonts[clampIndex(fontIndex, fonts.length)]! : null), [fonts, fontIndex]);
    const nextFont = useMemo(
        () => (fonts.length ? fonts[clampIndex(fontIndex + 1, fonts.length)]! : null),
        [fonts, fontIndex],
    );

    const hopFont = useCallback(
        (dir: -1 | 1) => {
            if (!isActuallyEnabled || fonts.length === 0) return;
            const ids = fonts.map((f) => f.id) as TypographyFont[];
            setPatch({ font: nextOf(ids, t.font, dir) });
        },
        [fonts, isActuallyEnabled, setPatch, t.font],
    );

    // Preview style (smaller text + more lines + less “waste”)
    const previewStyleFor = useCallback(
        (fontOpt: FontOpt, role: "prev" | "cur" | "next"): React.CSSProperties => {
            const isCur = role === "cur";
            return {
                fontFamily: fontFamilyForOpt(fontOpt),

                // ↓ Key change: smaller preview text so you can see more
                fontSize: isCur ? 12.2 : 11.4,
                fontWeight: isCur ? 740 : 640,

                letterSpacing: "-0.01em",
                lineHeight: isCur ? 1.24 : 1.2,

                textRendering: "optimizeLegibility",
                WebkitFontSmoothing: "antialiased",
                MozOsxFontSmoothing: "grayscale",

                opacity: isCur ? 1 : 0.62,
                filter: isCur ? "none" : "blur(0.5px)",
                transform: isCur ? "translateY(0px) scale(1.0)" : "translateY(0px) scale(0.94)",
                transition: reducedMotion
                    ? "none"
                    : "transform 220ms cubic-bezier(0.23, 1, 0.32, 1), opacity 220ms ease, filter 220ms ease",
            };
        },
        [reducedMotion],
    );

    const switchTrackBg = isActuallyEnabled
        ? "color-mix(in oklab, var(--focus) 86%, transparent)"
        : "color-mix(in oklab, var(--panel) 92%, transparent)";

    const switchThumbTransform = isActuallyEnabled ? "translateX(12px)" : "translateX(0px)";

    return (
        <div ref={rootRef} style={sx.root}>
            <button
                ref={triggerRef}
                type="button"
                style={{
                    ...sx.trigger,
                    ...(open ? sx.triggerOpen : {}),
                    ...(isActuallyEnabled ? sx.triggerEnabled : sx.triggerDisabled),
                }}
                onClick={onToggle}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label="Typography settings"
                title={`Typography (${summary})`}
            >
                <span style={sx.triggerGlyph}>
                    <IconAa />
                </span>
                <span style={{ ...sx.dot, ...(isActuallyEnabled ? sx.dotOn : sx.dotOff) }} aria-hidden />
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
                    <div style={sx.header}>
                        <div style={sx.titleBlock}>
                            <div style={sx.titleRow}>
                                <div style={sx.title}>Typography</div>
                                <span style={sx.badge}>{activeLabel}</span>
                            </div>
                            <div style={sx.subtitle}>{summary}</div>
                        </div>

                        <div style={sx.headerRight}>
                            <label style={sx.switchLabel} title={isActuallyEnabled ? "Overrides on" : "Overrides off"}>
                                <input
                                    type="checkbox"
                                    checked={isActuallyEnabled}
                                    onChange={toggleEnabled}
                                    style={sx.switchInput}
                                    aria-label={isActuallyEnabled ? "Turn typography overrides off" : "Turn typography overrides on"}
                                />
                                <span style={{ ...sx.switchTrack, background: switchTrackBg }} aria-hidden />
                                <span style={{ ...sx.switchThumb, transform: switchThumbTransform }} aria-hidden />
                            </label>

                            <button type="button" onClick={closePanel} style={sx.closeBtn} aria-label="Close">
                                <IconX />
                            </button>
                        </div>
                    </div>

                    <div style={sx.segmented} role="tablist" aria-label="Typography sections">
                        {tabs.map((tab) => {
                            const active = activeId === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    style={{ ...sx.tab, ...(active ? sx.tabActive : {}) }}
                                    onClick={() => setActiveId(tab.id)}
                                    title={tab.label}
                                    aria-label={tab.label}
                                    role="tab"
                                    aria-selected={active}
                                >
                                    <span style={sx.tabIcon}>{tab.icon}</span>
                                </button>
                            );
                        })}
                    </div>

                    <div style={sx.activeBlock}>
                        {!isActuallyEnabled && (
                            <div style={sx.disabledHint}>
                                <span style={sx.disabledPill}>Off</span>
                                <span style={sx.disabledText}>Enable to customize reading typography.</span>
                            </div>
                        )}

                        {activeId === "font" ? (
                            <div style={sx.fontCarousel} aria-label="Font picker">
                                <button
                                    type="button"
                                    style={sx.chevBtn}
                                    onClick={() => hopFont(-1)}
                                    aria-label="Previous font"
                                    title="Previous font"
                                    disabled={!isActuallyEnabled || fonts.length === 0}
                                >
                                    <span style={sx.chevGlyph} aria-hidden>
                                        ‹
                                    </span>
                                </button>

                                <div style={sx.fontStage} aria-label="Font previews">
                                    {prevFont && (
                                        <div style={{ ...sx.fontCard, ...sx.fontCardGhost }} aria-hidden>
                                            <div style={sx.fontPillInner}>
                                                <div style={sx.fontMetaRow}>
                                                    <span style={sx.fontName}>{prevFont.label}</span>
                                                </div>
                                                <div style={{ ...sx.fontPreview, ...previewStyleFor(prevFont, "prev") }} data-bp-lines="3">
                                                    {previewBlurb()}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {curFont && (
                                        <button
                                            type="button"
                                            style={{
                                                ...sx.fontCard,
                                                ...sx.fontCardActive,
                                                ...(isActuallyEnabled ? null : sx.fontCardDisabled),
                                            }}
                                            onClick={() => {
                                                if (!isActuallyEnabled) return;
                                                setPatch({ font: curFont.id });
                                            }}
                                            aria-label={`Selected font: ${curFont.label}`}
                                            aria-pressed
                                            disabled={!isActuallyEnabled}
                                            title={curFont.label}
                                        >
                                            <div style={sx.fontPillInner}>
                                                <div style={sx.fontMetaRowActive}>
                                                    <span style={{ ...sx.fontName, ...sx.fontNameActive }}>{curFont.label}</span>
                                                    <span style={sx.fontActiveDot} aria-hidden />
                                                </div>
                                                <div
                                                    style={{ ...sx.fontPreviewActive, ...previewStyleFor(curFont, "cur") }}
                                                    data-bp-lines="3"
                                                >
                                                    {previewBlurb()}
                                                </div>
                                            </div>
                                        </button>
                                    )}

                                    {nextFont && (
                                        <div style={{ ...sx.fontCard, ...sx.fontCardGhost }} aria-hidden>
                                            <div style={sx.fontPillInner}>
                                                <div style={sx.fontMetaRow}>
                                                    <span style={sx.fontName}>{nextFont.label}</span>
                                                </div>
                                                <div style={{ ...sx.fontPreview, ...previewStyleFor(nextFont, "next") }} data-bp-lines="3">
                                                    {previewBlurb()}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div style={sx.stageMaskLeft} aria-hidden />
                                    <div style={sx.stageMaskRight} aria-hidden />
                                </div>

                                <button
                                    type="button"
                                    style={sx.chevBtn}
                                    onClick={() => hopFont(1)}
                                    aria-label="Next font"
                                    title="Next font"
                                    disabled={!isActuallyEnabled || fonts.length === 0}
                                >
                                    <span style={sx.chevGlyph} aria-hidden>
                                        ›
                                    </span>
                                </button>
                            </div>
                        ) : activeSlider ? (
                            <>
                                <div style={sx.sliderTop}>
                                    <div style={sx.sliderLabelGroup}>
                                        <span style={sx.sliderIcon} aria-hidden>
                                            {tabs.find((x) => x.id === activeId)?.icon}
                                        </span>
                                        <span style={sx.sliderLabel}>{activeLabel}</span>
                                    </div>

                                    <span style={sx.sliderValue}>{activeSlider.fmt(t)}</span>
                                </div>

                                <input
                                    type="range"
                                    min={activeSlider.min}
                                    max={activeSlider.max}
                                    step={activeSlider.step}
                                    value={activeSlider.get(t)}
                                    onChange={(e) => {
                                        const raw = Number(e.target.value);
                                        const v = clampNum(raw, activeSlider.min, activeSlider.max);
                                        setPatch(activeSlider.set(v));
                                    }}
                                    style={{ ...sx.range, ...(isActuallyEnabled ? null : sx.rangeDisabled) }}
                                    disabled={!isActuallyEnabled}
                                />

                                <div style={sx.nudgeRow} aria-label="Fine controls">
                                    <button
                                        type="button"
                                        style={{ ...sx.nudgeBtn, ...(isActuallyEnabled ? null : sx.nudgeBtnDisabled) }}
                                        onClick={() => {
                                            if (!isActuallyEnabled) return;
                                            const cur = activeSlider.get(t);
                                            const next = clampNum(cur - dirStep(activeSlider.step), activeSlider.min, activeSlider.max);
                                            setPatch(activeSlider.set(next));
                                        }}
                                        disabled={!isActuallyEnabled}
                                        aria-label="Decrease"
                                        title="Decrease"
                                    >
                                        −
                                    </button>

                                    <div style={sx.nudgeHint}>
                                        <span style={sx.nudgeKbd}>↑</span>
                                        <span style={sx.nudgeKbd}>↓</span>
                                        <span style={sx.nudgeText}>to fine-tune</span>
                                    </div>

                                    <button
                                        type="button"
                                        style={{ ...sx.nudgeBtn, ...(isActuallyEnabled ? null : sx.nudgeBtnDisabled) }}
                                        onClick={() => {
                                            if (!isActuallyEnabled) return;
                                            const cur = activeSlider.get(t);
                                            const next = clampNum(cur + dirStep(activeSlider.step), activeSlider.min, activeSlider.max);
                                            setPatch(activeSlider.set(next));
                                        }}
                                        disabled={!isActuallyEnabled}
                                        aria-label="Increase"
                                        title="Increase"
                                    >
                                        +
                                    </button>
                                </div>
                            </>
                        ) : null}
                    </div>

                    <div style={sx.footer}>
                        <button type="button" style={sx.footerBtn} onClick={closePanel}>
                            Done
                        </button>

                        <div style={{ flex: 1 }} />

                        <button type="button" style={sx.footerBtnGhost} onClick={onReset} title="Reset and turn off overrides">
                            Reset
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ---- sizing tweaks: wider panel + bigger cards (more horizontal space) ----
const PANEL_W = 380; // was 300

const sx: Record<string, React.CSSProperties> = {
    root: { position: "relative", display: "inline-flex", alignItems: "center" },

    trigger: {
        width: 36,
        height: 36,
        borderRadius: 12,
        border: "1px solid var(--hairline)",
        background: "color-mix(in oklab, var(--panel) 92%, transparent)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        userSelect: "none",
        boxShadow: "0 10px 28px rgba(0,0,0,0.08)",
        transition:
            "transform 220ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 220ms cubic-bezier(0.23, 1, 0.32, 1), border-color 180ms ease, background 180ms ease",
        position: "relative",
        outline: "none",
        WebkitTapHighlightColor: "transparent",
    },
    triggerOpen: {
        transform: "translateY(-2px) scale(1.03)",
        borderColor: "color-mix(in oklab, var(--focus) 70%, var(--hairline))",
        boxShadow: "0 24px 72px rgba(0,0,0,0.20)",
        background: "color-mix(in oklab, var(--panel) 86%, transparent)",
    },
    triggerEnabled: {},
    triggerDisabled: { opacity: 0.92 },
    triggerGlyph: { fontSize: 14.5, fontWeight: 820, letterSpacing: "-0.05em" },

    dot: {
        position: "absolute",
        right: 7,
        bottom: 7,
        width: 7,
        height: 7,
        borderRadius: 999,
        border: "1px solid color-mix(in oklab, var(--hairline) 75%, transparent)",
    },
    dotOn: {
        background: "var(--focus)",
        boxShadow: "0 0 0 4px color-mix(in oklab, var(--focus) 16%, transparent)",
    },
    dotOff: { background: "color-mix(in oklab, var(--muted) 40%, transparent)" },

    panel: {
        position: "absolute",
        right: 0,
        top: 46,
        width: PANEL_W,
        maxWidth: "min(420px, calc(100vw - 24px))", // safe on small screens
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
        animation: "bpTypographyPop 170ms cubic-bezier(0.23, 1, 0.32, 1) both",
    },
    panelNoMotion: { animation: "none" },

    header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 2px 0" },
    titleBlock: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
    titleRow: { display: "flex", alignItems: "center", gap: 8 },
    title: { fontSize: 13.2, fontWeight: 840, letterSpacing: "-0.02em" },
    badge: {
        fontSize: 10.6,
        fontWeight: 820,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "4px 8px",
        borderRadius: 999,
        border: "1px solid var(--hairline)",
        background: "color-mix(in oklab, var(--panel) 92%, transparent)",
        color: "var(--muted)",
        transform: "translateY(0.5px)",
    },
    subtitle: {
        fontSize: 11.2,
        color: "var(--muted)",
        letterSpacing: "-0.01em",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        maxWidth: 270, // was 204 (wider panel)
    },
    headerRight: { display: "flex", alignItems: "center", gap: 6 },

    closeBtn: {
        width: 28,
        height: 28,
        borderRadius: 999,
        border: "1px solid transparent",
        background: "transparent",
        color: "var(--muted)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 160ms ease",
        WebkitTapHighlightColor: "transparent",
    },

    switchLabel: {
        position: "relative",
        width: 40,
        height: 26,
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
    switchInput: {
        position: "absolute",
        inset: 0,
        opacity: 0,
        cursor: "pointer",
    },
    switchTrack: {
        position: "absolute",
        inset: 0,
        borderRadius: 999,
        transition: "background 180ms ease",
        background: "color-mix(in oklab, var(--panel) 92%, transparent)",
    },
    switchThumb: {
        position: "absolute",
        top: 3,
        left: 3,
        width: 20,
        height: 20,
        borderRadius: 999,
        background: "var(--bg)",
        border: "1px solid color-mix(in oklab, var(--hairline) 70%, transparent)",
        boxShadow: "0 6px 14px rgba(0,0,0,0.16)",
        transition: "transform 180ms cubic-bezier(0.23, 1, 0.32, 1)",
    },

    segmented: {
        display: "flex",
        background: "color-mix(in oklab, var(--panel) 92%, transparent)",
        border: "1px solid var(--hairline)",
        borderRadius: 12,
        padding: 3,
        gap: 3,
    },
    tab: {
        flex: 1,
        height: 32,
        borderRadius: 9,
        border: "1px solid transparent",
        background: "transparent",
        color: "var(--muted)",
        fontSize: 14.5,
        fontWeight: 720,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 200ms cubic-bezier(0.23, 1, 0.32, 1)",
        userSelect: "none",
        outline: "none",
        WebkitTapHighlightColor: "transparent",
    },
    tabIcon: { opacity: 0.92, transform: "translateY(-0.25px)" },
    tabActive: {
        background: "var(--focus)",
        color: "#fff",
        boxShadow: "0 8px 18px color-mix(in oklab, var(--focus) 30%, transparent)",
        transform: "translateY(-0.5px)",
    },

    activeBlock: {
        position: "relative",
        background: "color-mix(in oklab, var(--bg) 86%, var(--panel))",
        borderRadius: 12,
        border: "1px solid var(--hairline)",
        padding: "10px 10px 9px",
        minHeight: 118,
        display: "flex",
        flexDirection: "column",
        gap: 8,
    },

    disabledHint: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        borderRadius: 10,
        border: "1px dashed color-mix(in oklab, var(--hairline) 92%, transparent)",
        background: "color-mix(in oklab, var(--bg) 65%, transparent)",
    },
    disabledPill: {
        fontSize: 10.5,
        fontWeight: 820,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--muted)",
        padding: "5px 8px",
        borderRadius: 999,
        border: "1px solid var(--hairline)",
        background: "color-mix(in oklab, var(--panel) 90%, transparent)",
    },
    disabledText: { fontSize: 11.7, color: "var(--muted)" },

    fontCarousel: { display: "flex", alignItems: "center", gap: 8 },
    fontStage: {
        position: "relative",
        flex: 1,
        height: 100, // slightly taller so 3 lines doesn't feel cramped
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        overflow: "hidden",
        borderRadius: 12,
        paddingInline: 2,
    },

    chevBtn: {
        width: 28,
        height: 28,
        borderRadius: 999,
        border: "1px solid var(--hairline)",
        background: "color-mix(in oklab, var(--bg) 70%, var(--panel))",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "transform 150ms cubic-bezier(0.23, 1, 0.32, 1), background 150ms ease, border-color 150ms ease, opacity 150ms ease",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
    },
    chevGlyph: {
        fontSize: 18,
        fontWeight: 760,
        color: "var(--muted)",
        transform: "translateY(-0.5px)",
    },

    fontCard: {
        width: 200, // was 164 (more width = more preview text)
        borderRadius: 12,
        border: "1px solid color-mix(in oklab, var(--hairline) 92%, transparent)",
        background: "color-mix(in oklab, var(--bg) 72%, var(--panel))",
        boxShadow: "none",
        padding: "9px 12px",
    },
    fontCardGhost: { opacity: 0.72 },
    fontCardActive: {
        borderColor: "color-mix(in oklab, var(--focus) 82%, var(--hairline))",
        background: "var(--focus)",
        boxShadow: "0 12px 28px color-mix(in oklab, var(--focus) 20%, transparent)",
        cursor: "pointer",
    },
    fontCardDisabled: { opacity: 0.65, cursor: "not-allowed" },

    fontPillInner: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 },
    fontMetaRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
    fontMetaRowActive: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },

    fontName: { fontSize: 11.1, fontWeight: 800, letterSpacing: "0.02em", color: "var(--muted)" },
    fontNameActive: { color: "#fff" },

    fontActiveDot: {
        width: 7,
        height: 7,
        borderRadius: 999,
        background: "#fff",
        boxShadow: "0 0 0 4px rgba(255, 255, 255, 0.14)",
        flexShrink: 0,
    },

    fontPreview: {
        color: "var(--fg)",
        overflow: "hidden",
        wordBreak: "break-word",
    },
    fontPreviewActive: {
        color: "#fff",
        overflow: "hidden",
        wordBreak: "break-word",
    },

    stageMaskLeft: {
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: 18,
        pointerEvents: "none",
        background: "linear-gradient(to right, color-mix(in oklab, var(--bg) 86%, var(--panel)) 28%, transparent)",
    },
    stageMaskRight: {
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: 18,
        pointerEvents: "none",
        background: "linear-gradient(to left, color-mix(in oklab, var(--bg) 86%, var(--panel)) 28%, transparent)",
    },

    sliderTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
    sliderLabelGroup: { display: "flex", alignItems: "center", gap: 7 },
    sliderIcon: { fontSize: 16, width: 18, textAlign: "center", opacity: 0.95 },
    sliderLabel: { fontSize: 12.4, fontWeight: 820, letterSpacing: "-0.01em" },
    sliderValue: { fontSize: 12.8, color: "var(--focus)", fontVariantNumeric: "tabular-nums", fontWeight: 860 },

    range: {
        width: "100%",
        accentColor: "var(--focus)",
        cursor: "pointer",
        height: 4,
        borderRadius: 999,
        background: "color-mix(in oklab, var(--hairline) 44%, transparent)",
    },
    rangeDisabled: { cursor: "not-allowed", opacity: 0.55 },

    nudgeRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 2 },
    nudgeBtn: {
        width: 34,
        height: 30,
        borderRadius: 10,
        border: "1px solid var(--hairline)",
        background: "color-mix(in oklab, var(--bg) 72%, var(--panel))",
        cursor: "pointer",
        fontSize: 18,
        fontWeight: 720,
        color: "var(--muted)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 160ms cubic-bezier(0.23, 1, 0.32, 1)",
        WebkitTapHighlightColor: "transparent",
    },
    nudgeBtnDisabled: { cursor: "not-allowed", opacity: 0.55 },
    nudgeHint: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        color: "var(--muted)",
        fontSize: 11.4,
    },
    nudgeKbd: {
        fontSize: 11,
        padding: "3px 6px",
        borderRadius: 7,
        border: "1px solid var(--hairline)",
        background: "color-mix(in oklab, var(--panel) 92%, transparent)",
        fontVariantNumeric: "tabular-nums",
    },
    nudgeText: { opacity: 0.9 },

    footer: { display: "flex", alignItems: "center", gap: 6, paddingTop: 2 },
    footerBtn: {
        height: 34,
        borderRadius: 11,
        border: "1px solid color-mix(in oklab, var(--focus) 70%, var(--hairline))",
        background: "var(--focus)",
        color: "#fff",
        fontSize: 12.4,
        fontWeight: 820,
        padding: "0 14px",
        cursor: "pointer",
        boxShadow: "0 10px 22px color-mix(in oklab, var(--focus) 22%, transparent)",
        transition: "all 160ms cubic-bezier(0.23, 1, 0.32, 1)",
        WebkitTapHighlightColor: "transparent",
    },
    footerBtnGhost: {
        height: 34,
        borderRadius: 11,
        border: "1px solid var(--hairline)",
        background: "transparent",
        color: "var(--muted)",
        fontSize: 12.4,
        fontWeight: 680,
        padding: "0 14px",
        cursor: "pointer",
        transition: "all 160ms ease",
        WebkitTapHighlightColor: "transparent",
    },
};