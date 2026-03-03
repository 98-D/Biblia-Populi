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
    } catch {}
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

/**
 * Theme vars are intentionally "paper-soft" in light mode:
 * - Warm, low-contrast background (no harsh pure-white)
 * - Ink is a deep warm black (less stark than #000/#0b0b0b)
 * - Hairlines + panels are warm/neutral and extremely subtle
 * - Focus ring is calm + slightly warm
 */
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

            // optional overlays for your Search panel (safe defaults)
            ["--overlay" as any]: "rgba(20,20,22,0.78)",
            ["--overlay2" as any]: "rgba(20,20,22,0.62)",
            ["--activeBg" as any]: "rgba(255,255,255,0.06)",
        };
    }

    // Light mode — paper-soft (warmer, lower contrast)
    return {
        // background: warm paper
        ["--bg" as any]: "#f6f2ea",

        // subtle surface: warm/neutral (avoid cold gray)
        ["--panel" as any]: "rgba(20, 14, 10, 0.028)",

        // text: warm ink (less harsh than pure black)
        ["--fg" as any]: "#15110e",

        // secondary text: gentle
        ["--muted" as any]: "rgba(21, 17, 14, 0.56)",

        // hairline: warm + very light
        ["--hairline" as any]: "rgba(21, 17, 14, 0.09)",

        // shadows: softer + warmer
        ["--shadow" as any]: "0 18px 60px rgba(18, 12, 10, 0.10)",
        ["--shadowSoft" as any]: "0 10px 34px rgba(18, 12, 10, 0.075)",

        // focus: calm, warm
        ["--focus" as any]: "rgba(21, 17, 14, 0.14)",
        ["--focusRing" as any]: "rgba(21, 17, 14, 0.08)",

        // overlays for Search panel (paper-glass, not blue/gray)
        ["--overlay" as any]: "rgba(246, 242, 234, 0.86)",
        ["--overlay2" as any]: "rgba(246, 242, 234, 0.72)",
        ["--activeBg" as any]: "rgba(21, 17, 14, 0.045)",
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
        // keep these in sync with getThemeVars() base colors
        metaThemeColorLight: props.metaThemeColorLight ?? "#f6f2ea",
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

/** Root wrapper that injects CSS vars + smooth transition */
export function ThemeShell(props: { children: React.ReactNode; style?: React.CSSProperties }) {
    const { vars } = useTheme();

    const shellStyle = useMemo(
        () => ({
            transition: `
            background-color 320ms ease,
            color 320ms ease,
            border-color 320ms ease,
            box-shadow 320ms ease
        `,
            // NOTE: inline styles can't express @media; reduced-motion should be handled in CSS
            ...vars,
            ...(props.style ?? {}),
        }),
        [vars, props.style],
    );

    return <div style={shellStyle}>{props.children}</div>;
}

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

    // knob: slightly warmer in light mode (so it doesn't look "plastic-white")
    const knobStyle: React.CSSProperties = {
        ...baseKnob,
        width: KNOB,
        height: KNOB,
        borderRadius: 999,
        background: isOn ? "#ffffff" : "rgba(255,255,255,0.92)",
        boxShadow: isOn
            ? "0 6px 16px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)"
            : "0 6px 16px rgba(18, 12, 10, 0.12), 0 0 0 1px rgba(21, 17, 14, 0.06)",
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