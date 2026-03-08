// apps/web/src/theme.tsx
// Biblia.to — Theme system (MONOCHROME ONLY — ZERO hue accents)
//
// Guarantees:
// - No hue accents. Strict neutral grayscale only.
// - System theme follows OS until user explicitly chooses.
// - Cross-tab sync via storage event.
// - No deprecated MediaQueryList addListener/removeListener usage.
// - Stable API surface (setMode supports value or updater).
// - Reduced-motion tracked live.
// - meta[name="theme-color"] updated.
// - CSS vars applied to :root; selection style injected.
// - Deterministic, SSR-safe, hardened document sync.

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
    clearChoice: () => void;
    toggle: () => void;
}>;

type ToggleSize = "sm" | "md" | "lg";

const ThemeContext = createContext<ThemeCtx | null>(null);

const DEFAULT_STORAGE_KEY = "bp_theme_v3";
const LEGACY_STORAGE_KEYS = ["bp_theme", "bp_theme_v2"] as const;

const STYLE_ID_SELECTION = "bp-theme-selection-style";

/* -------------------------------- utilities -------------------------------- */

function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof document !== "undefined";
}

function isMode(value: unknown): value is Mode {
    return value === "light" || value === "dark";
}

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
    return isMode(saved) ? saved : null;
}

function getSystemMode(): Mode {
    if (typeof window === "undefined" || !window.matchMedia) return "light";
    try {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
        return "light";
    }
}

function subscribeMediaQuery(
     query: string,
     onChange: (matches: boolean) => void,
): () => void {
    if (typeof window === "undefined" || !window.matchMedia) return () => {};

    const mq = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => onChange(event.matches);

    onChange(mq.matches);
    mq.addEventListener("change", handler);

    return () => {
        mq.removeEventListener("change", handler);
    };
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

function setMetaThemeColor(hex: string): void {
    if (typeof document === "undefined") return;

    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
        meta = document.createElement("meta");
        meta.name = "theme-color";
        document.head.appendChild(meta);
    }
    meta.content = hex;
}

function applyCssVars(vars: CssVarStyle): void {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    for (const [key, value] of Object.entries(vars)) {
        if (!key.startsWith("--")) continue;
        root.style.setProperty(key, String(value));
    }
}

function installSelectionColor(vars: CssVarStyle): void {
    if (typeof document === "undefined") return;

    const selection = String(vars["--selection"] ?? "").trim();
    if (!selection) return;

    let el = document.getElementById(STYLE_ID_SELECTION) as HTMLStyleElement | null;
    if (!el) {
        el = document.createElement("style");
        el.id = STYLE_ID_SELECTION;
        document.head.appendChild(el);
    }

    el.textContent = `::selection{background:${selection};}::-moz-selection{background:${selection};}`;
}

function setRootAttrs(mode: Mode, reducedMotion: boolean, forcedColors: boolean): void {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    root.setAttribute("data-theme", mode);
    root.setAttribute("data-reduced-motion", reducedMotion ? "1" : "0");
    root.setAttribute("data-forced-colors", forcedColors ? "1" : "0");
    root.style.colorScheme = mode;
}

function syncDocumentTheme(args: {
    mode: Mode;
    vars: CssVarStyle;
    reducedMotion: boolean;
    forcedColors: boolean;
    metaThemeColorLight: string;
    metaThemeColorDark: string;
}): void {
    const {
        mode,
        vars,
        reducedMotion,
        forcedColors,
        metaThemeColorLight,
        metaThemeColorDark,
    } = args;

    setRootAttrs(mode, reducedMotion, forcedColors);
    setMetaThemeColor(mode === "dark" ? metaThemeColorDark : metaThemeColorLight);
    applyCssVars(vars);
    installSelectionColor(vars);
}

function migrateLegacyThemeKeys(storageKey: string): Mode | null {
    const current = readStoredMode(storageKey);
    if (current) return current;

    for (const legacyKey of LEGACY_STORAGE_KEYS) {
        if (legacyKey === storageKey) continue;
        const old = readStoredMode(legacyKey);
        if (!old) continue;

        safeSet(storageKey, old);
        safeRemove(legacyKey);
        return old;
    }

    return null;
}

function dims(size: ToggleSize) {
    if (size === "sm") return { W: 40, H: 24, PAD: 2 };
    if (size === "lg") return { W: 50, H: 30, PAD: 2 };
    return { W: 44, H: 26, PAD: 2 };
}

/* -------------------------------- theme vars -------------------------------- */

/**
 * Strict monochrome only. No hue.
 * Light is paper-ish neutral. Dark is ink-like neutral.
 */
export function getThemeVars(mode: Mode): CssVarStyle {
    if (mode === "dark") {
        return {
            "--bg": "#0b0b0c",
            "--fg": "#f4f3f1",
            "--muted": "rgba(244,243,241,0.64)",
            "--muted2": "rgba(244,243,241,0.50)",

            "--hairline": "rgba(255,255,255,0.10)",
            "--hairline2": "rgba(255,255,255,0.07)",

            "--panel": "rgba(255,255,255,0.045)",
            "--panel2": "rgba(255,255,255,0.065)",

            "--overlay": "rgba(12,12,13,0.76)",
            "--overlay2": "rgba(12,12,13,0.88)",

            "--activeBg": "rgba(255,255,255,0.065)",
            "--selection": "rgba(244,243,241,0.20)",

            "--focusRing": "rgba(255,255,255,0.14)",
            "--ring": "rgba(255,255,255,0.18)",
            "--focusShadow": "0 0 0 7px rgba(255,255,255,0.08)",

            "--shadowSoft": "0 10px 36px rgba(0,0,0,0.36)",
            "--shadowPop": "0 26px 110px rgba(0,0,0,0.58)",
            "--shadowInset": "inset 0 1px 0 rgba(255,255,255,0.06)",

            "--scrollTrack": "rgba(255,255,255,0.08)",
            "--scrollThumb": "rgba(255,255,255,0.18)",
            "--scrollThumbHover": "rgba(255,255,255,0.28)",

            "--toggleTrack": "rgba(255,255,255,0.06)",
            "--toggleTrackOn": "rgba(255,255,255,0.28)",
            "--toggleInset": "inset 0 0 0 1px rgba(255,255,255,0.10)",
            "--toggleInsetOn": "inset 0 0 0 1px rgba(255,255,255,0.45)",
            "--toggleKnob": "rgba(255,255,255,0.96)",
            "--toggleKnobShadow":
                 "0 10px 22px rgba(0,0,0,0.32), 0 0 0 1px rgba(0,0,0,0.20)",
        };
    }

    return {
        "--bg": "#f6f2ea",
        "--fg": "#15110e",
        "--muted": "rgba(21,17,14,0.58)",
        "--muted2": "rgba(21,17,14,0.44)",

        "--hairline": "rgba(21,17,14,0.09)",
        "--hairline2": "rgba(21,17,14,0.065)",

        "--panel": "rgba(20,14,10,0.028)",
        "--panel2": "rgba(20,14,10,0.045)",

        "--overlay": "rgba(246,242,234,0.86)",
        "--overlay2": "rgba(246,242,234,0.94)",

        "--activeBg": "rgba(21,17,14,0.045)",
        "--selection": "rgba(21,17,14,0.14)",

        "--focusRing": "rgba(21,17,14,0.10)",
        "--ring": "rgba(0,0,0,0.16)",
        "--focusShadow": "0 0 0 6px rgba(21,17,14,0.08)",

        "--shadowSoft": "0 10px 34px rgba(18,12,10,0.075)",
        "--shadowPop": "0 24px 90px rgba(18,12,10,0.14)",
        "--shadowInset": "inset 0 1px 0 rgba(255,255,255,0.38)",

        "--scrollTrack": "rgba(21,17,14,0.06)",
        "--scrollThumb": "rgba(21,17,14,0.18)",
        "--scrollThumbHover": "rgba(21,17,14,0.28)",

        "--toggleTrack": "rgba(21,17,14,0.045)",
        "--toggleTrackOn": "rgba(0,0,0,0.22)",
        "--toggleInset": "inset 0 0 0 1px rgba(21,17,14,0.08)",
        "--toggleInsetOn": "inset 0 0 0 1px rgba(0,0,0,0.40)",
        "--toggleKnob": "rgba(255,255,255,0.92)",
        "--toggleKnobShadow":
             "0 10px 22px rgba(18,12,10,0.14), 0 0 0 1px rgba(21,17,14,0.08)",
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
             storageKey: props.storageKey ?? DEFAULT_STORAGE_KEY,
             metaThemeColorLight: props.metaThemeColorLight ?? "#f6f2ea",
             metaThemeColorDark: props.metaThemeColorDark ?? "#0b0b0c",
         }),
         [props.storageKey, props.metaThemeColorLight, props.metaThemeColorDark],
    );

    const initialStored = useMemo(() => {
        const migrated = migrateLegacyThemeKeys(config.storageKey);
        return migrated ?? readStoredMode(config.storageKey);
    }, [config.storageKey]);

    const [reducedMotion, setReducedMotion] = useState(false);
    const [forcedColors, setForcedColors] = useState(false);

    const hasExplicitRef = useRef<boolean>(!!initialStored);

    const [modeInternal, setModeInternal] = useState<Mode>(() => {
        return initialStored ?? getSystemMode();
    });

    const vars = useMemo(() => getThemeVars(modeInternal), [modeInternal]);

    useEffect(() => subscribePrefersReducedMotion(setReducedMotion), []);
    useEffect(() => subscribeForcedColors(setForcedColors), []);

    const setMode = useCallback(
         (next: Mode | ((prev: Mode) => Mode)) => {
             hasExplicitRef.current = true;

             setModeInternal((prev) => {
                 const resolved = typeof next === "function" ? next(prev) : next;
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

    useEffect(() => {
        syncDocumentTheme({
            mode: modeInternal,
            vars,
            reducedMotion,
            forcedColors,
            metaThemeColorLight: config.metaThemeColorLight,
            metaThemeColorDark: config.metaThemeColorDark,
        });
    }, [
        modeInternal,
        vars,
        reducedMotion,
        forcedColors,
        config.metaThemeColorLight,
        config.metaThemeColorDark,
    ]);

    useEffect(() => {
        if (!isBrowser()) return;

        const onStorage = (e: StorageEvent) => {
            if (e.key !== config.storageKey) return;

            const v = e.newValue;
            if (isMode(v)) {
                hasExplicitRef.current = true;
                setModeInternal(v);
                return;
            }

            hasExplicitRef.current = false;
            setModeInternal(getSystemMode());
        };

        const disposeSystem = subscribePrefersDark(() => {
            if (hasExplicitRef.current) return;
            setModeInternal(getSystemMode());
        });

        window.addEventListener("storage", onStorage);

        return () => {
            window.removeEventListener("storage", onStorage);
            disposeSystem();
        };
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

/* -------------------------------- shell -------------------------------- */

export function ThemeShell(props: { children: React.ReactNode; style?: React.CSSProperties }) {
    const { vars, reducedMotion } = useTheme();

    const shellStyle = useMemo<React.CSSProperties>(
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

/* ----------------------------- hover support ----------------------------- */

function useSupportsHover(): boolean {
    const [hover, setHover] = useState(false);

    useEffect(() => {
        return subscribeMediaQuery("(hover: hover)", setHover);
    }, []);

    return hover;
}

/* ----------------------------- Toggle control ------------------------------ */

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
    const hoverOk = useSupportsHover();

    const baseTrack = props.styles?.themePill ?? defaults.track;
    const baseKnob = props.styles?.themeDot ?? defaults.knob;

    const trackStyle: React.CSSProperties = useMemo(
         () => ({
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
                 focus ? "0 0 0 3px var(--ring)" : "",
                 hover && hoverOk ? "0 10px 26px rgba(0,0,0,0.10)" : "",
             ]
                  .filter(Boolean)
                  .join(", "),
             transform: press ? "scale(0.985)" : hover && hoverOk ? "scale(1.01)" : "scale(1)",
             opacity: press ? 0.965 : 1,
             outline: "none",
         }),
         [baseTrack, W, H, PAD, isOn, focus, hover, hoverOk, press],
    );

    const knobStyle: React.CSSProperties = useMemo(
         () => ({
             ...baseKnob,
             width: KNOB,
             height: KNOB,
             borderRadius: 999,
             background: "var(--toggleKnob)",
             boxShadow: "var(--toggleKnobShadow)",
             transform: `translateX(${isOn ? TRAVEL : 0}px) ${press ? "scale(0.98)" : "scale(1)"}`,
             backgroundImage:
                  "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.88))",
         }),
         [baseKnob, KNOB, isOn, TRAVEL, press],
    );

    const onKeyDown = useCallback(
         (e: React.KeyboardEvent<HTMLButtonElement>) => {
             if (e.key === "Enter" || e.key === " ") {
                 e.preventDefault();
                 onToggle();
             }
         },
         [onToggle],
    );

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
              onTouchCancel={() => setPress(false)}
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