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

type TabSpec = {
    id: "font" | "sizePx" | "weight" | "leading" | "measurePx";
    label: string;
    icon: string;
};

type SliderSpec = {
    id: "sizePx" | "weight" | "leading" | "measurePx";
    min: number;
    max: number;
    step: number;
    fmt: (t: ReaderTypography) => string;
};

function clampNum(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

export function ReaderTypographyControl() {
    const stored = useMemo(() => loadReaderTypography(), []);
    const [enabled, setEnabled] = useState<boolean>(!!stored);
    const [t, setT] = useState<ReaderTypography>(stored ?? DEFAULT_TYPOGRAPHY);
    const [open, setOpen] = useState(false);
    const [activeId, setActiveId] = useState<"font" | "sizePx" | "weight" | "leading" | "measurePx">("sizePx");
    const rootRef = useRef<HTMLDivElement | null>(null);
    const wheelRef = useRef<HTMLDivElement>(null);

    const limits = useMemo(() => typographyLimits(), []);
    const fonts = useMemo(() => fontOptions(), []);

    const tabs: TabSpec[] = useMemo(() => [
        { id: "font", label: "Font", icon: "𝑓" },
        { id: "sizePx", label: "Size", icon: "Aa" },
        { id: "weight", label: "Weight", icon: "B" },
        { id: "leading", label: "Leading", icon: "↕" },
        { id: "measurePx", label: "Width", icon: "↔" },
    ], []);

    const sliders: SliderSpec[] = useMemo(() => [
        { id: "sizePx", min: 12, max: limits.sizePx.hi, step: limits.sizePx.step, fmt: (tt) => `${Math.round(tt.sizePx)}px` },
        { id: "weight", min: 200, max: limits.weight.hi, step: limits.weight.step, fmt: (tt) => `${Math.round(tt.weight)}` },
        { id: "leading", min: 0.95, max: limits.leading.hi, step: limits.leading.digits !== undefined ? Math.pow(10, -limits.leading.digits) : 0.01, fmt: (tt) => tt.leading.toFixed(2) },
        { id: "measurePx", min: 240, max: limits.measurePx.hi, step: limits.measurePx.step, fmt: (tt) => `${Math.round(tt.measurePx)}px` },
    ], [limits]);

    const activeSlider = useMemo(() => sliders.find((s) => s.id === activeId), [sliders, activeId]);

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

    // Click-outside + Escape
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler, { capture: true });
        return () => document.removeEventListener("mousedown", handler, { capture: true });
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
        window.addEventListener("keydown", onKey, { capture: true });
        return () => window.removeEventListener("keydown", onKey, { capture: true } as any);
    }, [open]);

    const ensureEnabled = useCallback(() => {
        if (!enabled) setEnabled(true);
    }, [enabled]);

    const setPatch = useCallback((patch: Partial<ReaderTypography>) => {
        ensureEnabled();
        setT((prev) => updateTypography(prev, patch));
    }, [ensureEnabled]);

    const resetToDefaults = useCallback(() => {
        setEnabled(false);
        setT(DEFAULT_TYPOGRAPHY);
        setOpen(false);
        setActiveId("sizePx");
    }, []);

    const closePanel = useCallback(() => setOpen(false), []);

    // Smoother arrow scrolling
    const scrollWheel = useCallback((direction: "left" | "right") => {
        if (!wheelRef.current) return;
        const amount = 68;
        wheelRef.current.scrollBy({
            left: direction === "left" ? -amount : amount,
            behavior: "smooth",
        });
    }, []);

    return (
        <div ref={rootRef} style={sx.root}>
            <button
                type="button"
                style={{ ...sx.trigger, ...(open ? sx.triggerOpen : {}) }}
                onClick={() => setOpen((v) => !v)}
                aria-label="Typography settings"
                title={`Typography (${t.font} • ${Math.round(t.sizePx)}px)`}
            >
                <span style={sx.triggerAa}>Aa</span>
            </button>

            {open && (
                <div style={sx.panel} role="dialog" aria-label="Typography settings">
                    <div style={sx.header}>
                        <div style={sx.title}>Typography</div>
                        <button type="button" onClick={closePanel} style={sx.closeBtn} aria-label="Close">✕</button>
                    </div>

                    <div style={sx.segmented}>
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                style={{ ...sx.tab, ...(activeId === tab.id ? sx.tabActive : {}) }}
                                onClick={() => setActiveId(tab.id)}
                                title={tab.label}
                                aria-label={tab.label}
                            >
                                {tab.icon}
                            </button>
                        ))}
                    </div>

                    {/* Shorter, tighter content area */}
                    <div style={sx.activeBlock}>
                        {activeId === "font" ? (
                            <div style={sx.fontWheelContainer}>
                                <button
                                    type="button"
                                    style={sx.wheelArrow}
                                    onClick={() => scrollWheel("left")}
                                    aria-label="Scroll fonts left"
                                >
                                    ‹
                                </button>

                                <div ref={wheelRef} style={sx.fontWheel}>
                                    {fonts.map((f) => (
                                        <button
                                            key={f.id}
                                            style={{ ...sx.fontPill, ...(t.font === f.id ? sx.fontPillActive : {}) }}
                                            onClick={() => setPatch({ font: f.id })}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>

                                <button
                                    type="button"
                                    style={sx.wheelArrow}
                                    onClick={() => scrollWheel("right")}
                                    aria-label="Scroll fonts right"
                                >
                                    ›
                                </button>

                                {/* Fade gradients to show scrollability */}
                                <div style={sx.fadeLeft} />
                                <div style={sx.fadeRight} />
                            </div>
                        ) : activeSlider ? (
                            <>
                                <div style={sx.sliderTop}>
                                    <div style={sx.sliderLabelGroup}>
                                        <span style={sx.sliderIcon}>{tabs.find((t) => t.id === activeId)?.icon}</span>
                                        <span style={sx.sliderLabel}>
                                            {activeSlider.id === "sizePx" ? "Size" : activeSlider.id === "weight" ? "Weight" : activeSlider.id === "leading" ? "Leading" : "Width"}
                                        </span>
                                    </div>
                                    <span style={sx.sliderValue}>{activeSlider.fmt(t)}</span>
                                </div>
                                <input
                                    type="range"
                                    min={activeSlider.min}
                                    max={activeSlider.max}
                                    step={activeSlider.step}
                                    value={activeSlider.id === "sizePx" ? t.sizePx : activeSlider.id === "weight" ? t.weight : activeSlider.id === "leading" ? t.leading : t.measurePx}
                                    onChange={(e) => {
                                        const raw = Number(e.target.value);
                                        const v = clampNum(raw, activeSlider.min, activeSlider.max);
                                        if (activeSlider.id === "sizePx") setPatch({ sizePx: Math.round(v) });
                                        else if (activeSlider.id === "weight") setPatch({ weight: Math.round(v) });
                                        else if (activeSlider.id === "leading") setPatch({ leading: Number(v.toFixed(2)) });
                                        else setPatch({ measurePx: Math.round(v) });
                                    }}
                                    style={sx.range}
                                />
                            </>
                        ) : null}
                    </div>

                    <div style={sx.footer}>
                        <button type="button" style={sx.footerBtnCancel} onClick={closePanel}>Cancel</button>
                        <div style={{ flex: 1 }} />
                        <button type="button" style={sx.footerBtnReset} onClick={resetToDefaults}>Reset</button>
                    </div>
                </div>
            )}
        </div>
    );
}

const sx: Record<string, React.CSSProperties> = {
    root: { position: "relative", display: "inline-flex", alignItems: "center" },

    trigger: {
        width: 34,
        height: 34,
        borderRadius: 11,
        border: "1px solid var(--hairline)",
        background: "color-mix(in oklab, var(--panel) 96%, transparent)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        userSelect: "none",
        boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
        transition: "all 240ms cubic-bezier(0.23, 1, 0.32, 1)",
    },
    triggerOpen: {
        transform: "translateY(-2px) scale(1.04)",
        borderColor: "var(--focus)",
        boxShadow: "0 20px 64px rgba(0,0,0,0.18)",
    },
    triggerAa: { fontSize: 14.8, fontWeight: 760, letterSpacing: "-0.04em" },

    panel: {
        position: "absolute",
        right: 0,
        top: 44,
        width: 242,
        borderRadius: 15,
        border: "1px solid var(--hairline)",
        background: "var(--bg)",
        boxShadow: "0 26px 82px rgba(0,0,0,0.19)",
        overflow: "hidden",
        zIndex: 9999,
        padding: 6,
        display: "flex",
        flexDirection: "column",
        gap: 5,
        animation: "panelPop 180ms cubic-bezier(0.23, 1, 0.32, 1) both", // entrance animation
    },

    header: { display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 2 },
    title: { fontSize: 12.8, fontWeight: 710, letterSpacing: "-0.02em" },
    closeBtn: {
        width: 22,
        height: 22,
        borderRadius: 999,
        border: "none",
        background: "transparent",
        color: "var(--muted)",
        fontSize: 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "color 180ms ease",
    },

    segmented: {
        display: "flex",
        background: "var(--panel)",
        border: "1px solid var(--hairline)",
        borderRadius: 10,
        padding: 2,
        gap: 2,
    },
    tab: {
        flex: 1,
        height: 29,
        borderRadius: 7,
        border: "none",
        background: "transparent",
        color: "var(--muted)",
        fontSize: 15.5,
        fontWeight: 630,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 220ms cubic-bezier(0.23, 1, 0.32, 1)",
        userSelect: "none",
    },
    tabActive: {
        background: "var(--focus)",
        color: "#fff",
        boxShadow: "0 5px 14px color-mix(in oklab, var(--focus) 38%, transparent)",
        transform: "scale(1.03)",
    },

    /* Even shorter content block */
    activeBlock: {
        background: "var(--panel)",
        borderRadius: 11,
        border: "1px solid var(--hairline)",
        padding: "6px 9px 5px",
        minHeight: 68,
        display: "flex",
        flexDirection: "column",
    },

    fontWheelContainer: {
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 4,
    },
    fontWheel: {
        flex: 1,
        display: "flex",
        overflowX: "auto",
        flexWrap: "nowrap",
        gap: 7,
        padding: "2px 0",
        scrollSnapType: "x mandatory",
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
        msOverflowStyle: "none",
    },
    wheelArrow: {
        width: 22,
        height: 22,
        borderRadius: 999,
        border: "none",
        background: "color-mix(in oklab, var(--panel) 80%, transparent)",
        color: "var(--muted)",
        fontSize: 18,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 160ms cubic-bezier(0.23, 1, 0.32, 1)",
        flexShrink: 0,
    },

    /* Fade gradients – the magic touch */
    fadeLeft: {
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: 18,
        background: "linear-gradient(to right, var(--bg) 30%, transparent)",
        pointerEvents: "none",
        zIndex: 1,
    },
    fadeRight: {
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: 18,
        background: "linear-gradient(to left, var(--bg) 30%, transparent)",
        pointerEvents: "none",
        zIndex: 1,
    },

    fontPill: {
        flex: "0 0 auto",
        minWidth: 68,
        padding: "8px 13px",
        borderRadius: 9,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        fontSize: 12.6,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "all 180ms cubic-bezier(0.23, 1, 0.32, 1)",
        scrollSnapAlign: "center",
        textAlign: "center",
        boxShadow: "0 2px 5px rgba(0,0,0,0.03)",
    },
    fontPillActive: {
        borderColor: "var(--focus)",
        background: "var(--focus)",
        color: "#fff",
        fontWeight: 660,
        transform: "scale(1.06)",
        boxShadow: "0 6px 16px color-mix(in oklab, var(--focus) 35%, transparent)",
    },

    sliderTop: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 3,
    },
    sliderLabelGroup: { display: "flex", alignItems: "center", gap: 5 },
    sliderIcon: { fontSize: 17.5, width: 19, textAlign: "center", opacity: 0.92 },
    sliderLabel: { fontSize: 12.3, fontWeight: 670, letterSpacing: "-0.01em" },
    sliderValue: { fontSize: 12.8, color: "var(--focus)", fontVariantNumeric: "tabular-nums", fontWeight: 720 },
    range: {
        width: "100%",
        accentColor: "var(--focus)",
        cursor: "pointer",
        height: 3.5,
        borderRadius: 999,
        background: "color-mix(in oklab, var(--hairline) 45%, transparent)",
        transition: "accent-color 140ms ease",
    },

    footer: { display: "flex", alignItems: "center", gap: 5, paddingTop: 1 },
    footerBtnCancel: {
        height: 31,
        borderRadius: 9,
        border: "1px solid var(--hairline)",
        background: "transparent",
        color: "var(--muted)",
        fontSize: 12.2,
        fontWeight: 520,
        padding: "0 13px",
        cursor: "pointer",
        transition: "all 160ms ease",
    },
    footerBtnReset: {
        height: 31,
        borderRadius: 9,
        border: "1px solid var(--hairline)",
        background: "transparent",
        color: "var(--muted)",
        fontSize: 12.2,
        fontWeight: 520,
        padding: "0 13px",
        cursor: "pointer",
        transition: "all 160ms ease",
    },
};