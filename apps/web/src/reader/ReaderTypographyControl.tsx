// apps/web/src/reader/ReaderTypographyControl.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    applyReaderTypography,
    clearReaderTypography,
    DEFAULT_TYPOGRAPHY,
    fontOptions,
    loadReaderTypography,
    saveReaderTypography,
    type ReaderTypography,
    type TypographyFont,
} from "./typography";

type Knob = "size" | "weight" | "leading" | "width";

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

function fmtWeight(w: number): string {
    if (w <= 300) return "Light";
    if (w <= 375) return "Book";
    if (w <= 450) return "Regular";
    if (w <= 525) return "Medium";
    return "Bold";
}

function fmtLeading(l: number): string {
    if (l <= 1.55) return "Tight";
    if (l <= 1.75) return "Normal";
    if (l <= 1.95) return "Loose";
    return "Airy";
}

function fmtWidth(px: number): string {
    if (px <= 680) return "Narrow";
    if (px <= 820) return "Balanced";
    if (px <= 920) return "Wide";
    return "Max";
}

const KNOBS: Array<{ id: Knob; label: string }> = [
    { id: "size", label: "Size" },
    { id: "weight", label: "Weight" },
    { id: "leading", label: "Leading" },
    { id: "width", label: "Width" },
];

function knobMeta(k: Knob): { min: number; max: number; step: number } {
    switch (k) {
        case "size":
            return { min: 15, max: 30, step: 1 };
        case "weight":
            return { min: 250, max: 650, step: 25 };
        case "leading":
            return { min: 1.45, max: 2.1, step: 0.05 };
        case "width":
            return { min: 560, max: 980, step: 20 };
        default:
            return { min: 0, max: 100, step: 1 };
    }
}

function readKnob(t: ReaderTypography, k: Knob): number {
    switch (k) {
        case "size":
            return t.sizePx;
        case "weight":
            return t.weight;
        case "leading":
            return t.leading;
        case "width":
            return t.measurePx;
    }
}

function writeKnob(t: ReaderTypography, k: Knob, raw: number): ReaderTypography {
    switch (k) {
        case "size":
            return { ...t, sizePx: clampInt(raw, 15, 30) };
        case "weight":
            return { ...t, weight: clampInt(raw, 250, 650) };
        case "leading":
            return { ...t, leading: clampFloat(raw, 1.45, 2.1, 2) };
        case "width":
            return { ...t, measurePx: clampInt(raw, 560, 980) };
    }
}

function prettyValue(t: ReaderTypography, k: Knob): string {
    const v = readKnob(t, k);
    switch (k) {
        case "size":
            return `${Math.round(v)}px`;
        case "weight":
            return `${fmtWeight(v)} (${Math.round(v)})`;
        case "leading":
            return `${fmtLeading(v)} (${v.toFixed(2)})`;
        case "width":
            return `${fmtWidth(v)} (${Math.round(v)}px)`;
    }
}

export function ReaderTypographyControl() {
    const stored = useMemo(() => loadReaderTypography(), []);
    const [enabled, setEnabled] = useState<boolean>(() => stored !== null);
    const [t, setT] = useState<ReaderTypography>(() => stored ?? DEFAULT_TYPOGRAPHY);

    const [open, setOpen] = useState(false);
    const [knob, setKnob] = useState<Knob>("size");
    const rootRef = useRef<HTMLDivElement | null>(null);

    // Apply + persist only when enabled.
    useEffect(() => {
        if (!enabled) {
            applyReaderTypography(null);
            clearReaderTypography();
            return;
        }
        applyReaderTypography(t);
        saveReaderTypography(t);
    }, [enabled, t]);

    // Click-outside to close
    useEffect(() => {
        if (!open) return;

        const onDown = (e: MouseEvent) => {
            const el = rootRef.current;
            if (!el) return;
            if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
        };

        window.addEventListener("mousedown", onDown, { capture: true });
        return () => window.removeEventListener("mousedown", onDown, { capture: true } as any);
    }, [open]);

    function ensureEnabled(): void {
        if (!enabled) setEnabled(true);
    }

    function setFont(font: TypographyFont): void {
        ensureEnabled();
        setT((prev) => ({ ...prev, font }));
    }

    function onSlider(v: number): void {
        ensureEnabled();
        setT((prev) => writeKnob(prev, knob, v));
    }

    function resetAll(): void {
        setOpen(false);
        setEnabled(false); // clears vars + storage via effect
        setT(DEFAULT_TYPOGRAPHY);
        setKnob("size");
    }

    const opts = useMemo(() => fontOptions(), []);
    const meta = knobMeta(knob);
    const sliderValue = readKnob(t, knob);

    const fontLabel = useMemo(() => {
        const found = opts.find((o) => o.id === t.font);
        return found?.label ?? "Font";
    }, [opts, t.font]);

    return (
        <div ref={rootRef} style={sx.root}>
            <button
                type="button"
                style={{ ...sx.pill, ...(open ? sx.pillOpen : null) }}
                onClick={() => setOpen((v) => !v)}
                aria-label="Reader typography"
                title="Reader typography"
            >
                <span style={sx.pillAa}>Aa</span>
                <span style={sx.pillMeta}>
                    {enabled ? `${fontLabel} • ${t.sizePx}px` : "Default"}
                </span>
            </button>

            {open ? (
                <div style={sx.panel} role="dialog" aria-label="Reader typography controls">
                    <div style={sx.header}>
                        <div style={sx.headerLeft}>
                            <div style={sx.title}>Typography</div>
                            <div style={sx.sub}>Scripture + reader width</div>
                        </div>

                        <button
                            type="button"
                            style={{ ...sx.toggle, ...(enabled ? sx.toggleOn : null) }}
                            onClick={() => setEnabled((v) => !v)}
                            aria-label={enabled ? "Disable custom typography" : "Enable custom typography"}
                            title={enabled ? "Use defaults" : "Customize"}
                        >
                            <div style={{ ...sx.toggleDot, ...(enabled ? sx.toggleDotOn : null) }} />
                        </button>
                    </div>

                    <div style={sx.row}>
                        <div style={sx.label}>Font</div>
                        <select
                            style={sx.select}
                            value={t.font}
                            onChange={(e) => setFont(e.target.value as TypographyFont)}
                        >
                            {opts.map((o) => (
                                <option key={o.id} value={o.id}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div style={sx.knobTabs}>
                        {KNOBS.map((k) => (
                            <button
                                key={k.id}
                                type="button"
                                style={{ ...sx.knobTab, ...(knob === k.id ? sx.knobTabOn : null) }}
                                onClick={() => setKnob(k.id)}
                            >
                                {k.label}
                            </button>
                        ))}
                    </div>

                    <div style={sx.sliderBlock}>
                        <div style={sx.sliderTop}>
                            <div style={sx.sliderLabel}>{KNOBS.find((k) => k.id === knob)?.label ?? ""}</div>
                            <div style={sx.sliderValue}>{enabled ? prettyValue(t, knob) : "Default"}</div>
                        </div>

                        <input
                            type="range"
                            min={meta.min}
                            max={meta.max}
                            step={meta.step}
                            value={sliderValue}
                            onChange={(e) => onSlider(Number(e.target.value))}
                            style={sx.range}
                            aria-label={knob}
                        />

                        <div style={sx.sliderHint}>
                            <span style={sx.hintChip}>Scroll + read</span>
                            <span style={sx.hintText}>One slider, switch the knob above.</span>
                        </div>
                    </div>

                    <div style={sx.preview}>
                        <div style={{ ...sx.previewText, fontFamily: "var(--bpScriptureFont)" } as any}>
                            In the beginning God created the heaven and the earth.
                        </div>
                        <div style={sx.previewMeta}>
                            {enabled ? `${fontLabel} • ${t.sizePx}px • ${fmtWeight(t.weight)} • ${t.leading.toFixed(2)}` : "Defaults"}
                        </div>
                    </div>

                    <div style={sx.footer}>
                        <button type="button" style={sx.resetBtn} onClick={resetAll}>
                            Reset
                        </button>
                        <div style={sx.footerHint}>Applies to scripture text + reader column width.</div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

const sx: Record<string, React.CSSProperties> = {
    root: { position: "relative", display: "inline-flex", alignItems: "center" },

    pill: {
        height: 34,
        padding: "0 10px",
        borderRadius: 999,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        userSelect: "none",
        boxShadow: "0 10px 28px rgba(0,0,0,0.08)",
        transition: "transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease",
        color: "inherit",
        lineHeight: 1,
        whiteSpace: "nowrap",
    },
    pillOpen: {
        transform: "translateY(-0.5px)",
        borderColor: "var(--focus)",
        boxShadow: "0 18px 56px rgba(0,0,0,0.14)",
    },
    pillAa: { fontWeight: 700, letterSpacing: "-0.01em" },
    pillMeta: { fontSize: 11, color: "var(--muted)", letterSpacing: "0.02em" },

    panel: {
        position: "absolute",
        right: 0,
        top: 42,
        width: 340,
        borderRadius: 16,
        border: "1px solid var(--hairline)",
        background: "color-mix(in oklab, var(--bg) 92%, transparent)",
        boxShadow: "0 28px 110px rgba(0,0,0,0.22)",
        overflow: "hidden",
        zIndex: 30,
        padding: 12,
        display: "grid",
        gap: 12,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
    },

    header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
    headerLeft: { display: "grid", gap: 2 },
    title: { fontSize: 12, fontWeight: 650, letterSpacing: "-0.01em" },
    sub: { fontSize: 11, color: "var(--muted)" },

    toggle: {
        width: 44,
        height: 26,
        borderRadius: 999,
        border: "1px solid var(--hairline)",
        background: "transparent",
        position: "relative",
        cursor: "pointer",
        padding: 2,
    },
    toggleOn: {
        borderColor: "var(--focus)",
        background: "var(--panel)",
    },
    toggleDot: {
        width: 22,
        height: 22,
        borderRadius: 999,
        background: "var(--hairline)",
        transform: "translateX(0px)",
        transition: "transform 160ms ease, background 160ms ease",
    },
    toggleDotOn: {
        background: "var(--fg)",
        transform: "translateX(18px)",
    },

    row: { display: "grid", gridTemplateColumns: "72px 1fr", alignItems: "center", gap: 10 },
    label: { fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--muted)" },

    select: {
        height: 34,
        borderRadius: 12,
        border: "1px solid var(--hairline)",
        background: "transparent",
        padding: "0 10px",
        outline: "none",
    },

    knobTabs: { display: "flex", gap: 8, flexWrap: "wrap" },
    knobTab: {
        height: 30,
        padding: "0 10px",
        borderRadius: 999,
        border: "1px solid var(--hairline)",
        background: "transparent",
        cursor: "pointer",
        fontSize: 12,
    },
    knobTabOn: {
        background: "var(--panel)",
        borderColor: "var(--focus)",
    },

    sliderBlock: {
        border: "1px solid var(--hairline)",
        borderRadius: 14,
        background: "var(--panel)",
        padding: 10,
        display: "grid",
        gap: 10,
    },
    sliderTop: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
    sliderLabel: { fontSize: 12, fontWeight: 600 },
    sliderValue: { fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" },
    range: { width: "100%" },

    sliderHint: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
    hintChip: {
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--muted)",
    },
    hintText: { fontSize: 11, color: "var(--muted)" },

    preview: {
        borderTop: "1px solid var(--hairline)",
        paddingTop: 10,
        display: "grid",
        gap: 6,
    },
    previewText: {
        fontSize: 14,
        lineHeight: 1.5,
        letterSpacing: "-0.005em",
    },
    previewMeta: { fontSize: 11, color: "var(--muted)" },

    footer: { borderTop: "1px solid var(--hairline)", paddingTop: 10, display: "grid", gap: 6 },
    resetBtn: {
        height: 34,
        borderRadius: 12,
        border: "1px solid var(--hairline)",
        background: "transparent",
        cursor: "pointer",
        justifySelf: "start",
        padding: "0 12px",
    },
    footerHint: { fontSize: 11, color: "var(--muted)", lineHeight: 1.5 },
};