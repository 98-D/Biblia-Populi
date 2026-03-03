// apps/web/src/theme.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Mode = "light" | "dark";

type CssVarStyle = React.CSSProperties & Record<string, string | number>;

type ThemeConfig = Readonly<{
    storageKey: string;
    metaThemeColorLight: string;
    metaThemeColorDark: string;
}>;

type ThemeCtx = Readonly<{
    mode: Mode;
    setMode: React.Dispatch<React.SetStateAction<Mode>>;
    toggle: () => void;
    vars: CssVarStyle;
}>;

const ThemeContext = createContext<ThemeCtx | null>(null);

function safeGet(key: string): string | null {
    try {
        return typeof window === "undefined" ? null : window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeSet(key: string, value: string): void {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // ignore
    }
}

function getInitialMode(storageKey: string): Mode {
    const saved = safeGet(storageKey);
    if (saved === "light" || saved === "dark") return saved;
    if (typeof window === "undefined") return "light";
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

function setMetaThemeColor(hex: string): void {
    if (typeof document === "undefined") return;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", hex);
}

export function getThemeVars(mode: Mode): CssVarStyle {
    if (mode === "dark") {
        return {
            ["--bg" as any]: "#0b0b0c",
            ["--panel" as any]: "rgba(255,255,255,0.045)",
            ["--fg" as any]: "#f4f3f1",
            ["--muted" as any]: "rgba(244,243,241,0.62)",
            ["--hairline" as any]: "rgba(255,255,255,0.10)",
            ["--shadow" as any]: "0 18px 60px rgba(0,0,0,0.45)",
            ["--shadowSoft" as any]: "0 10px 34px rgba(0,0,0,0.34)",
            ["--focus" as any]: "rgba(255,255,255,0.22)",
            ["--focusRing" as any]: "rgba(255,255,255,0.12)",
        };
    }

    // softened (less intense white)
    return {
        ["--bg" as any]: "#f6f4f0",
        ["--panel" as any]: "rgba(0,0,0,0.026)",
        ["--fg" as any]: "#0b0b0c",
        ["--muted" as any]: "rgba(11,11,12,0.58)",
        ["--hairline" as any]: "rgba(0,0,0,0.11)",
        ["--shadow" as any]: "0 18px 60px rgba(0,0,0,0.12)",
        ["--shadowSoft" as any]: "0 10px 34px rgba(0,0,0,0.10)",
        ["--focus" as any]: "rgba(0,0,0,0.14)",
        ["--focusRing" as any]: "rgba(0,0,0,0.08)",
    };
}

export function ThemeProvider(props: {
    children: React.ReactNode;
    storageKey?: string;
    metaThemeColorLight?: string;
    metaThemeColorDark?: string;
}) {
    const config: ThemeConfig = {
        storageKey: props.storageKey ?? "bp_theme",
        metaThemeColorLight: props.metaThemeColorLight ?? "#f6f4f0",
        metaThemeColorDark: props.metaThemeColorDark ?? "#0b0b0c",
    };

    const [mode, setMode] = useState<Mode>(() => getInitialMode(config.storageKey));
    const vars = useMemo(() => getThemeVars(mode), [mode]);

    useEffect(() => {
        if (typeof document === "undefined") return;

        document.documentElement.setAttribute("data-theme", mode);
        safeSet(config.storageKey, mode);
        setMetaThemeColor(mode === "dark" ? config.metaThemeColorDark : config.metaThemeColorLight);
    }, [mode, config.storageKey, config.metaThemeColorDark, config.metaThemeColorLight]);

    const toggle = useCallback(() => {
        setMode((m) => (m === "dark" ? "light" : "dark"));
    }, []);

    const value: ThemeCtx = useMemo(() => ({ mode, setMode, toggle, vars }), [mode, toggle, vars]);

    return <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeCtx {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error("useTheme must be used within <ThemeProvider />");
    return ctx;
}

/** Root wrapper that injects CSS vars into your layout */
export function ThemeShell(props: { children: React.ReactNode; style?: React.CSSProperties }) {
    const { vars } = useTheme();
    return <div style={{ ...(props.style ?? null), ...vars }}>{props.children}</div>;
}

/**
 * iOS-style slider switch (monochrome, calm).
 * - "On" == dark mode (knob to the right).
 * - Uses existing tokens: --panel / --focus / --hairline / --bg.
 * - If you pass styles.themePill/themeDot, they’re treated as base styles.
 */
export function ThemeToggleSwitch(props: {
    styles?: Record<string, React.CSSProperties>;
    mode?: Mode;
    onToggle?: () => void;
    size?: "sm" | "md";
}) {
    const ctx = useTheme();
    const mode = props.mode ?? ctx.mode;
    const onToggle = props.onToggle ?? ctx.toggle;

    const size = props.size ?? "md";
    const W = size === "sm" ? 40 : 44;
    const H = size === "sm" ? 24 : 26;
    const PAD = 2;
    const KNOB = H - PAD * 2;
    const TRAVEL = W - PAD * 2 - KNOB;

    const [press, setPress] = useState(false);
    const isOn = mode === "dark";

    const baseTrack = props.styles?.themePill ?? defaults.track;
    const baseKnob = props.styles?.themeDot ?? defaults.knob;

    const trackStyle: React.CSSProperties = {
        ...baseTrack,
        width: W,
        height: H,
        padding: PAD,
        borderRadius: 999,
        background: isOn ? "var(--focus)" : "var(--panel)",
        border: "1px solid var(--hairline)",
        boxShadow: isOn ? "inset 0 0 0 1px var(--focusRing)" : "inset 0 0 0 1px transparent",
        transform: press ? "scale(0.99)" : "scale(1)",
        opacity: press ? 0.96 : 1,
    };

    const knobStyle: React.CSSProperties = {
        ...baseKnob,
        width: KNOB,
        height: KNOB,
        borderRadius: 999,
        background: "#ffffff",
        boxShadow: "0 6px 16px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)",
        transform: `translateX(${isOn ? TRAVEL : 0}px)`,
    };

    return (
        <button
            type="button"
            role="switch"
            aria-checked={isOn}
            onClick={onToggle}
            style={trackStyle}
            aria-label={isOn ? "Switch to light theme" : "Switch to dark theme"}
            title={isOn ? "Light" : "Dark"}
            onMouseDown={() => setPress(true)}
            onMouseUp={() => setPress(false)}
            onMouseLeave={() => setPress(false)}
            onTouchStart={() => setPress(true)}
            onTouchEnd={() => setPress(false)}
        >
            <span aria-hidden style={knobStyle} />
        </button>
    );
}

/** Backwards-compatible name if you’re already using it everywhere. */
export function ThemeTogglePill(props: { styles?: Record<string, React.CSSProperties>; mode?: Mode; onToggle?: () => void }) {
    return <ThemeToggleSwitch styles={props.styles} mode={props.mode} onToggle={props.onToggle} />;
}

const defaults: { track: React.CSSProperties; knob: React.CSSProperties } = {
    track: {
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "flex-start",
        transition: "transform 140ms ease, opacity 140ms ease, background 160ms ease, box-shadow 160ms ease",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
    },
    knob: {
        transition: "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        willChange: "transform",
    },
};