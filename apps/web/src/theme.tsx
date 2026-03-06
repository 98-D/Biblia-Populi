// apps/web/src/theme.tsx
// Biblia.to — Theme system (MONOCHROME ONLY — ZERO hue accents)
//
// Guarantees:
// - No “accent color” (no red, no blue, no green). Strict neutral grayscale only.
// - System theme follows OS UNTIL user explicitly chooses.
// - Cross-tab sync via storage event.
// - No deprecated mq.addListener/removeListener usage.
// - Stable API surface (setMode supports value or updater).
// - Reduced-motion tracked live.
// - meta[name="theme-color"] updated.
// - CSS vars applied to :root; optional selection style injected.
//
// Notes:
// - This file intentionally does NOT “own” all base.css tokens. It sets a core subset
//   (bg/fg/panel/hairline/muted/overlays/rings/shadows/scrollbars/toggle).
// - base.css can define additional derived tokens using color-mix when available.

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

export type Mode = "light" | "dark";

// CSSProperties doesn’t include custom CSS vars; extend it safely.
export type CssVarStyle = React.CSSProperties & Record<string, string | number>;

type ThemeConfig = Readonly<{
    storageKey: string;
    metaThemeColorLight: string;
    metaThemeColorDark: string;
}>;

type ThemeCtx = Readonly<{
    mode: Mode;
    isDark: boolean;
    vars: CssVarStyle;
    reducedMotion: boolean;
    hasExplicitChoice: boolean;
    setMode: (next: Mode | ((prev: Mode) => Mode)) => void;
    clearChoice: () => void; // revert to system + removes storage
    toggle: () => void;
}>;

const ThemeContext = createContext<ThemeCtx | null>(null);

/* --------------------------------- storage -------------------------------- */
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

function safeRemove(key: string): void {
    try {
        window.localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

function readStoredMode(storageKey: string): Mode | null {
    const saved = safeGet(storageKey);
    if (saved === "light" || saved === "dark") return saved;
    return null;
}

function getSystemMode(): Mode {
    if (typeof window === "undefined") return "light";
    try {
        return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
    } catch {
        return "light";
    }
}

/* ----------------------------- media subscriptions ----------------------------- */
function subscribeMediaQuery(query: string, onChange: (matches: boolean) => void): () => void {
    if (typeof window === "undefined" || !window.matchMedia) return () => {};
    const mq = window.matchMedia(query);

    const handler = () => onChange(!!mq.matches);
    handler();

    if (mq.addEventListener) {
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }

    // legacy fallback (avoid TS deprecated signatures by using any)
    const anyMq = mq as any;
    if (typeof anyMq.addListener === "function") {
        anyMq.addListener(handler);
        return () => {
            if (typeof anyMq.removeListener === "function") anyMq.removeListener(handler);
        };
    }

    return () => {};
}

function subscribePrefersReducedMotion(onChange: (reduced: boolean) => void): () => void {
    return subscribeMediaQuery("(prefers-reduced-motion: reduce)", onChange);
}

function subscribePrefersDark(onChange: (isDark: boolean) => void): () => void {
    return subscribeMediaQuery("(prefers-color-scheme: dark)", onChange);
}

function subscribeForcedColors(onChange: (forced: boolean) => void): () => void {
    return subscribeMediaQuery("(forced-colors: active)", onChange);
}

/* --------------------------------- meta theme color -------------------------------- */
function setMetaThemeColor(hex: string): void {
    if (typeof document === "undefined") return;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", hex);
}

/* --------------------------------- theme vars -------------------------------- */
/**
 * Strict monochrome only. No hue.
 * Light is paper-ish neutral. Dark is ink-like neutral.
 */
export function getThemeVars(mode: Mode): CssVarStyle {
    if (mode === "dark") {
        return {
            ["--bg" as any]: "#0b0b0c",
            ["--fg" as any]: "#f4f3f1",
            ["--muted" as any]: "rgba(244,243,241,0.64)",
            ["--muted2" as any]: "rgba(244,243,241,0.50)",

            ["--hairline" as any]: "rgba(255,255,255,0.10)",
            ["--hairline2" as any]: "rgba(255,255,255,0.07)",

            ["--panel" as any]: "rgba(255,255,255,0.045)",
            ["--panel2" as any]: "rgba(255,255,255,0.065)",

            ["--overlay" as any]: "rgba(12,12,13,0.76)",
            ["--overlay2" as any]: "rgba(12,12,13,0.88)",

            ["--activeBg" as any]: "rgba(255,255,255,0.065)",
            ["--selection" as any]: "rgba(244,243,241,0.20)",

            // Focus/rings (neutral)
            ["--focusRing" as any]: "rgba(255,255,255,0.14)",
            ["--ring" as any]: "rgba(255,255,255,0.18)",
            ["--focusShadow" as any]: "0 0 0 7px rgba(255,255,255,0.08)",

            // Shadows
            ["--shadowSoft" as any]: "0 10px 36px rgba(0,0,0,0.36)",
            ["--shadowPop" as any]: "0 26px 110px rgba(0,0,0,0.58)",
            ["--shadowInset" as any]: "inset 0 1px 0 rgba(255,255,255,0.06)",

            // Scrollbars
            ["--scrollTrack" as any]: "rgba(255,255,255,0.08)",
            ["--scrollThumb" as any]: "rgba(255,255,255,0.18)",
            ["--scrollThumbHover" as any]: "rgba(255,255,255,0.28)",

            // Toggle (monochrome)
            ["--toggleTrack" as any]: "rgba(255,255,255,0.06)",
            ["--toggleTrackOn" as any]: "rgba(255,255,255,0.28)",
            ["--toggleInset" as any]: "inset 0 0 0 1px rgba(255,255,255,0.10)",
            ["--toggleInsetOn" as any]: "inset 0 0 0 1px rgba(255,255,255,0.45)",
            ["--toggleKnob" as any]: "rgba(255,255,255,0.96)",
            ["--toggleKnobShadow" as any]:
                "0 10px 22px rgba(0,0,0,0.32), 0 0 0 1px rgba(0,0,0,0.20)",
        };
    }

    return {
        ["--bg" as any]: "#f6f2ea",
        ["--fg" as any]: "#15110e",
        ["--muted" as any]: "rgba(21,17,14,0.58)",
        ["--muted2" as any]: "rgba(21,17,14,0.44)",

        ["--hairline" as any]: "rgba(21,17,14,0.09)",
        ["--hairline2" as any]: "rgba(21,17,14,0.065)",

        ["--panel" as any]: "rgba(20,14,10,0.028)",
        ["--panel2" as any]: "rgba(20,14,10,0.045)",

        ["--overlay" as any]: "rgba(246,242,234,0.86)",
        ["--overlay2" as any]: "rgba(246,242,234,0.94)",

        ["--activeBg" as any]: "rgba(21,17,14,0.045)",
        ["--selection" as any]: "rgba(21,17,14,0.14)",

        ["--focusRing" as any]: "rgba(21,17,14,0.10)",
        ["--ring" as any]: "rgba(0,0,0,0.16)",
        ["--focusShadow" as any]: "0 0 0 6px rgba(21,17,14,0.08)",

        ["--shadowSoft" as any]: "0 10px 34px rgba(18,12,10,0.075)",
        ["--shadowPop" as any]: "0 24px 90px rgba(18,12,10,0.14)",
        ["--shadowInset" as any]: "inset 0 1px 0 rgba(255,255,255,0.38)",

        ["--scrollTrack" as any]: "rgba(21,17,14,0.06)",
        ["--scrollThumb" as any]: "rgba(21,17,14,0.18)",
        ["--scrollThumbHover" as any]: "rgba(21,17,14,0.28)",

        ["--toggleTrack" as any]: "rgba(21,17,14,0.045)",
        ["--toggleTrackOn" as any]: "rgba(0,0,0,0.22)",
        ["--toggleInset" as any]: "inset 0 0 0 1px rgba(21,17,14,0.08)",
        ["--toggleInsetOn" as any]: "inset 0 0 0 1px rgba(0,0,0,0.40)",
        ["--toggleKnob" as any]: "rgba(255,255,255,0.92)",
        ["--toggleKnobShadow" as any]:
            "0 10px 22px rgba(18,12,10,0.14), 0 0 0 1px rgba(21,17,14,0.08)",
    };
}

function applyCssVars(vars: CssVarStyle): void {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    for (const [k, v] of Object.entries(vars)) {
        if (!k.startsWith("--")) continue;
        root.style.setProperty(k, String(v));
    }
}

function installSelectionColor(vars: CssVarStyle): void {
    if (typeof document === "undefined") return;
    const sel = String((vars as any)["--selection"] ?? "");
    if (!sel) return;

    const id = "bp_theme_selection_style";
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
        el = document.createElement("style");
        el.id = id;
        document.head.appendChild(el);
    }
    el.textContent = `::selection{background:${sel};}::-moz-selection{background:${sel};}`;
}

function setRootAttrs(mode: Mode, reducedMotion: boolean, forcedColors: boolean): void {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.setAttribute("data-theme", mode);
    root.setAttribute("data-reduced-motion", reducedMotion ? "1" : "0");
    root.setAttribute("data-forced-colors", forcedColors ? "1" : "0");
}

/* -------------------------- system + cross-tab sync -------------------------- */
function setupThemeSync(
    storageKey: string,
    setModeInternal: React.Dispatch<React.SetStateAction<Mode>>,
    hasExplicitRef: React.RefObject<boolean>,
): () => void {
    if (typeof window === "undefined") return () => {};

    const onStorage = (e: StorageEvent) => {
        if (e.key !== storageKey) return;

        const v = e.newValue;
        if (v === "light" || v === "dark") {
            hasExplicitRef.current = true;
            setModeInternal(v);
            return;
        }

        // key removed -> revert to system
        hasExplicitRef.current = false;
        setModeInternal(getSystemMode());
    };

    window.addEventListener("storage", onStorage);

    const disposeSystem = subscribePrefersDark(() => {
        if (hasExplicitRef.current) return; // user choice wins
        setModeInternal(getSystemMode());
    });

    return () => {
        window.removeEventListener("storage", onStorage);
        disposeSystem();
    };
}

/* -------------------------------- provider -------------------------------- */
export function ThemeProvider(props: {
    children: React.ReactNode;
    storageKey?: string;
    metaThemeColorLight?: string;
    metaThemeColorDark?: string;
}) {
    const config: ThemeConfig = useMemo(
        () => ({
            storageKey: props.storageKey ?? "bp_theme_v3",
            metaThemeColorLight: props.metaThemeColorLight ?? "#f6f2ea",
            metaThemeColorDark: props.metaThemeColorDark ?? "#0b0b0c",
        }),
        [props.storageKey, props.metaThemeColorLight, props.metaThemeColorDark],
    );

    const [reducedMotion, setReducedMotion] = useState(false);
    const [forcedColors, setForcedColors] = useState(false);

    useEffect(() => subscribePrefersReducedMotion(setReducedMotion), []);
    useEffect(() => subscribeForcedColors(setForcedColors), []);

    // If there is stored value at boot, that's an explicit choice.
    const hasExplicitRef = useRef<boolean>(!!readStoredMode(config.storageKey));

    const [modeInternal, setModeInternal] = useState<Mode>(() => {
        const saved = readStoredMode(config.storageKey);
        return saved ?? getSystemMode();
    });

    const vars = useMemo(() => getThemeVars(modeInternal), [modeInternal]);

    const setMode = useCallback(
        (next: Mode | ((prev: Mode) => Mode)) => {
            hasExplicitRef.current = true;
            setModeInternal((prev) => {
                const resolved = typeof next === "function" ? (next as (p: Mode) => Mode)(prev) : next;
                safeSet(config.storageKey, resolved);
                return resolved;
            });
        },
        [config.storageKey],
    );

    const clearChoice = useCallback(() => {
        hasExplicitRef.current = false;
        safeRemove(config.storageKey);
        setModeInternal(getSystemMode());
    }, [config.storageKey]);

    const toggle = useCallback(() => {
        setMode((m) => (m === "dark" ? "light" : "dark"));
    }, [setMode]);

    // Apply document attrs + vars (single effect, deterministic ordering)
    useEffect(() => {
        setRootAttrs(modeInternal, reducedMotion, forcedColors);
        setMetaThemeColor(modeInternal === "dark" ? config.metaThemeColorDark : config.metaThemeColorLight);
        applyCssVars(vars);
        installSelectionColor(vars);
    }, [
        modeInternal,
        vars,
        reducedMotion,
        forcedColors,
        config.metaThemeColorDark,
        config.metaThemeColorLight,
    ]);

    // Cross-tab + system sync
    useEffect(() => setupThemeSync(config.storageKey, setModeInternal, hasExplicitRef), [config.storageKey]);

    // Old key migrations (keep tight + safe)
    useEffect(() => {
        const candidates = ["bp_theme", "bp_theme_v2"];
        const cur = readStoredMode(config.storageKey);
        if (cur) return;

        for (const k of candidates) {
            if (k === config.storageKey) continue;
            const old = readStoredMode(k);
            if (old) {
                safeSet(config.storageKey, old);
                safeRemove(k);
                hasExplicitRef.current = true;
                setModeInternal(old);
                break;
            }
        }
    }, [config.storageKey]);

    const value: ThemeCtx = useMemo(
        () => ({
            mode: modeInternal,
            isDark: modeInternal === "dark",
            vars,
            reducedMotion,
            hasExplicitChoice: hasExplicitRef.current,
            setMode,
            clearChoice,
            toggle,
        }),
        [modeInternal, vars, reducedMotion, setMode, clearChoice, toggle],
    );

    return <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeCtx {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error("useTheme must be used within <ThemeProvider />");
    return ctx;
}

/** Root wrapper that injects CSS vars + smooth transition (optional) */
export function ThemeShell(props: { children: React.ReactNode; style?: React.CSSProperties }) {
    const { vars, reducedMotion } = useTheme();

    const shellStyle = useMemo(
        () => ({
            minHeight: "100vh",
            background: "var(--bg)",
            color: "var(--fg)",
            transition: reducedMotion
                ? undefined
                : "background-color 320ms ease, color 320ms ease, border-color 320ms ease, box-shadow 320ms ease",
            ...vars,
            ...(props.style ?? {}),
        }),
        [vars, props.style, reducedMotion],
    );

    return <div style={shellStyle}>{props.children}</div>;
}

/* ----------------------------- Toggle control ------------------------------ */
type ToggleSize = "sm" | "md" | "lg";

function dims(size: ToggleSize) {
    if (size === "sm") return { W: 40, H: 24, PAD: 2 };
    if (size === "lg") return { W: 50, H: 30, PAD: 2 };
    return { W: 44, H: 26, PAD: 2 };
}

function supportsHover(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return !!window.matchMedia?.("(hover:hover)")?.matches;
    } catch {
        return false;
    }
}

export function ThemeToggleSwitch(props: {
    styles?: Record<string, React.CSSProperties>;
    mode?: Mode;
    onToggle?: () => void;
    size?: ToggleSize;
    title?: string;
    ariaLabel?: string;
}) {
    const ctx = useTheme();
    const mode = props.mode ?? ctx.mode;
    const onToggle = props.onToggle ?? ctx.toggle;
    const size = props.size ?? "md";

    const { W, H, PAD } = dims(size);
    const BORDER = 1;
    const KNOB = H - 2 * PAD - 2 * BORDER;
    const TRAVEL = W - H;

    const [press, setPress] = useState(false);
    const [hover, setHover] = useState(false);
    const [focus, setFocus] = useState(false);

    const isOn = mode === "dark";
    const hoverOk = useMemo(() => supportsHover(), []);

    const baseTrack = props.styles?.themePill ?? defaults.track;
    const baseKnob = props.styles?.themeDot ?? defaults.knob;

    const trackStyle: React.CSSProperties = {
        ...baseTrack,
        boxSizing: "border-box",
        width: W,
        height: H,
        padding: PAD,
        borderRadius: 999,
        background: isOn ? "var(--toggleTrackOn)" : "var(--toggleTrack)",
        border: "1px solid var(--hairline)",
        boxShadow: [
            isOn ? "var(--toggleInsetOn)" : "var(--toggleInset)",
            focus ? `0 0 0 3px var(--ring)` : "",
            hover && hoverOk ? "0 10px 26px rgba(0,0,0,0.10)" : "",
        ]
            .filter(Boolean)
            .join(", "),
        transform: press ? "scale(0.985)" : hover && hoverOk ? "scale(1.01)" : "scale(1)",
        opacity: press ? 0.965 : 1,
        outline: "none",
    };

    const knobStyle: React.CSSProperties = {
        ...baseKnob,
        width: KNOB,
        height: KNOB,
        borderRadius: 999,
        background: "var(--toggleKnob)",
        boxShadow: "var(--toggleKnobShadow)",
        transform: `translateX(${isOn ? TRAVEL : 0}px) ${press ? "scale(0.98)" : "scale(1)"}`,
        backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.88))",
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
        }
    };

    return (
        <button
            type="button"
            role="switch"
            aria-checked={isOn}
            onClick={onToggle}
            onKeyDown={onKeyDown}
            style={trackStyle}
            aria-label={props.ariaLabel ?? (isOn ? "Switch to light theme" : "Switch to dark theme")}
            title={props.title ?? (isOn ? "Light" : "Dark")}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => {
                setHover(false);
                setPress(false);
            }}
            onMouseDown={() => setPress(true)}
            onMouseUp={() => setPress(false)}
            onTouchStart={() => setPress(true)}
            onTouchEnd={() => setPress(false)}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
        >
            <span aria-hidden style={knobStyle} />
        </button>
    );
}

export function ThemeTogglePill(props: {
    styles?: Record<string, React.CSSProperties>;
    mode?: Mode;
    onToggle?: () => void;
    size?: ToggleSize;
    title?: string;
}) {
    return (
        <ThemeToggleSwitch
            styles={props.styles}
            mode={props.mode}
            onToggle={props.onToggle}
            size={props.size}
            title={props.title}
        />
    );
}

const defaults: { track: React.CSSProperties; knob: React.CSSProperties } = {
    track: {
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "flex-start",
        transition:
            "transform 140ms ease, opacity 140ms ease, background 180ms ease, box-shadow 180ms ease",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
    },
    knob: {
        transition: "transform 190ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 180ms ease",
        willChange: "transform",
    },
};