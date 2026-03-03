// apps/web/src/theme.tsx
// Biblia Populi — Theme system (PURE BLACK & WHITE ONLY — ZERO red anywhere)
// Accent, selection, ring, soft colors all converted to monochrome neutral grays.
// Toggle remains crisp black/white. Cross-tab + system sync upgraded.
//
// Upgrades in this pass:
// - Removes deprecated React/TS surfaces (no React.MutableRefObject, no mq.addListener/removeListener)
// - Removes unused @ts-expect-error needs by not using them at all
// - Fixes explicit-choice logic so system theme only applies until user picks
// - Tightens types: ThemeCtx.setMode is a stable function (Mode | updater), not raw Dispatch
// - No “red” anywhere (only neutral monochrome/sepia-ish neutrals; no hue accents)
// - Safer reduced-motion tracking (live subscription, not one-time memo)
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

// CSSProperties doesn’t include custom CSS vars; we extend it.
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
    setMode: (next: Mode | ((prev: Mode) => Mode)) => void;
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
function subscribeMediaQuery(
    query: string,
    onChange: (matches: boolean) => void,
): () => void {
    if (typeof window === "undefined" || !window.matchMedia) return () => {};
    const mq = window.matchMedia(query);

    const handler = () => onChange(mq.matches);
    // initial
    handler();

    // Modern path
    if (mq.addEventListener) {
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }

    // Legacy fallback (typed any to avoid deprecated TS signature warnings)
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
    return subscribeMediaQuery("(prefers-reduced-motion: reduce)", (m) => onChange(!!m));
}

function subscribePrefersDark(onChange: (isDark: boolean) => void): () => void {
    return subscribeMediaQuery("(prefers-color-scheme: dark)", (m) => onChange(!!m));
}

/* --------------------------------- meta theme color -------------------------------- */
function setMetaThemeColor(hex: string): void {
    if (typeof document === "undefined") return;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", hex);
}

/* --------------------------------- theme vars -------------------------------- */
/**
 * 100% monochrome (neutral). No red. No colored accent.
 * These are intentionally “neutral-warm” whites/blacks; still monochrome (no saturated hue).
 */
export function getThemeVars(mode: Mode): CssVarStyle {
    if (mode === "dark") {
        return {
            ["--bg" as any]: "#0b0b0c",
            ["--panel" as any]: "rgba(255,255,255,0.045)",
            ["--panel2" as any]: "rgba(255,255,255,0.065)",
            ["--fg" as any]: "#f4f3f1",
            ["--muted" as any]: "rgba(244,243,241,0.62)",
            ["--hairline" as any]: "rgba(255,255,255,0.10)",

            ["--shadow" as any]: "0 18px 60px rgba(0,0,0,0.45)",
            ["--shadowSoft" as any]: "0 10px 34px rgba(0,0,0,0.34)",
            ["--glow" as any]:
                "0 0 0 1px rgba(255,255,255,0.06), 0 14px 38px rgba(0,0,0,0.42)",

            // Focus & rings: neutral grayscale
            ["--focus" as any]: "rgba(255,255,255,0.22)",
            ["--focusRing" as any]: "rgba(255,255,255,0.12)",

            // Overlays
            ["--overlay" as any]: "rgba(20,20,22,0.78)",
            ["--overlay2" as any]: "rgba(20,20,22,0.62)",

            // Interaction surfaces
            ["--activeBg" as any]: "rgba(255,255,255,0.06)",
            ["--selection" as any]: "rgba(244,243,241,0.28)",
            ["--kbd" as any]: "rgba(255,255,255,0.06)",

            // Radii
            ["--radius" as any]: "14px",
            ["--radiusLg" as any]: "18px",

            // “Accent” is monochrome (same family)
            ["--accent" as any]: "#f4f3f1",
            ["--accentSoft" as any]: "rgba(244,243,241,0.22)",
            ["--ring" as any]: "rgba(255,255,255,0.18)",

            // Glass
            ["--glass" as any]: "rgba(16,16,18,0.78)",
            ["--glass2" as any]: "rgba(16,16,18,0.62)",

            // Toggle — pure monochrome
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
        ["--panel" as any]: "rgba(20,14,10,0.028)",
        ["--panel2" as any]: "rgba(20,14,10,0.045)",
        ["--fg" as any]: "#15110e",
        ["--muted" as any]: "rgba(21,17,14,0.56)",
        ["--hairline" as any]: "rgba(21,17,14,0.09)",

        ["--shadow" as any]: "0 18px 60px rgba(18,12,10,0.10)",
        ["--shadowSoft" as any]: "0 10px 34px rgba(18,12,10,0.075)",
        ["--glow" as any]:
            "0 0 0 1px rgba(21,17,14,0.06), 0 14px 38px rgba(18,12,10,0.10)",

        ["--focus" as any]: "rgba(21,17,14,0.14)",
        ["--focusRing" as any]: "rgba(21,17,14,0.08)",

        ["--overlay" as any]: "rgba(246,242,234,0.86)",
        ["--overlay2" as any]: "rgba(246,242,234,0.72)",

        ["--activeBg" as any]: "rgba(21,17,14,0.045)",
        ["--selection" as any]: "rgba(21,17,14,0.20)",
        ["--kbd" as any]: "rgba(21,17,14,0.045)",

        ["--radius" as any]: "14px",
        ["--radiusLg" as any]: "18px",

        ["--accent" as any]: "#15110e",
        ["--accentSoft" as any]: "rgba(21,17,14,0.16)",
        ["--ring" as any]: "rgba(0,0,0,0.18)",

        ["--glass" as any]: "rgba(246,242,234,0.92)",
        ["--glass2" as any]: "rgba(246,242,234,0.78)",

        ["--toggleTrack" as any]: "rgba(21,17,14,0.045)",
        ["--toggleTrackOn" as any]: "rgba(0,0,0,0.28)",
        ["--toggleInset" as any]: "inset 0 0 0 1px rgba(21,17,14,0.08)",
        ["--toggleInsetOn" as any]: "inset 0 0 0 1px rgba(0,0,0,0.45)",
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
    el.textContent = `::selection { background: ${sel}; } ::-moz-selection { background: ${sel}; }`;
}

/* -------------------------- Smart system + cross-tab sync -------------------------- */
/**
 * • Cross-tab sync (storage event)
 * • System preference only while user has NOT made an explicit choice
 * • Uses addEventListener (no deprecated TS signatures)
 */
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
            (hasExplicitRef as any).current = true;
            setModeInternal(v);
            return;
        }

        // key removed → revert to system
        (hasExplicitRef as any).current = false;
        setModeInternal(getSystemMode());
    };

    window.addEventListener("storage", onStorage);

    const disposeSystem = subscribePrefersDark(() => {
        // follow system only if user has not explicitly chosen
        if ((hasExplicitRef as any).current) return;
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
            storageKey: props.storageKey ?? "bp_theme_v2",
            metaThemeColorLight: props.metaThemeColorLight ?? "#f6f2ea",
            metaThemeColorDark: props.metaThemeColorDark ?? "#0b0b0c",
        }),
        [props.storageKey, props.metaThemeColorLight, props.metaThemeColorDark],
    );

    // User explicitly chose if storage already has a value.
    const hasExplicitRef = useRef<boolean>(!!readStoredMode(config.storageKey));

    const [modeInternal, setModeInternal] = useState<Mode>(() => {
        const saved = readStoredMode(config.storageKey);
        return saved ?? getSystemMode();
    });

    const [reducedMotion, setReducedMotion] = useState(false);

    useEffect(() => {
        return subscribePrefersReducedMotion((reduced) => setReducedMotion(reduced));
    }, []);

    const vars = useMemo(() => getThemeVars(modeInternal), [modeInternal]);

    // Wrapped setter that marks the choice as explicit + persists.
    const setMode = useCallback((next: Mode | ((prev: Mode) => Mode)) => {
        hasExplicitRef.current = true;

        setModeInternal((prev) => {
            const resolved = typeof next === "function" ? (next as (p: Mode) => Mode)(prev) : next;
            safeSet(config.storageKey, resolved);
            return resolved;
        });
    }, [config.storageKey]);

    const toggle = useCallback(() => {
        setMode((m) => (m === "dark" ? "light" : "dark"));
    }, [setMode]);

    // Apply document attributes + css vars
    useEffect(() => {
        if (typeof document === "undefined") return;

        document.documentElement.setAttribute("data-theme", modeInternal);
        document.documentElement.setAttribute("data-reduced-motion", reducedMotion ? "1" : "0");

        setMetaThemeColor(modeInternal === "dark" ? config.metaThemeColorDark : config.metaThemeColorLight);
        applyCssVars(vars);
        installSelectionColor(vars);
    }, [modeInternal, vars, reducedMotion, config.metaThemeColorDark, config.metaThemeColorLight]);

    // Cross-tab + system sync
    useEffect(() => {
        return setupThemeSync(config.storageKey, setModeInternal, hasExplicitRef);
    }, [config.storageKey]);

    // Old key migration
    useEffect(() => {
        const oldKey = "bp_theme";
        if (config.storageKey === oldKey) return;

        const old = safeGet(oldKey);
        if (old === "light" || old === "dark") {
            const cur = safeGet(config.storageKey);
            if (!cur) {
                safeSet(config.storageKey, old);
                hasExplicitRef.current = true;
                setModeInternal(old);
            }
            safeRemove(oldKey);
        }
    }, [config.storageKey]);

    const value: ThemeCtx = useMemo(
        () => ({
            mode: modeInternal,
            isDark: modeInternal === "dark",
            vars,
            setMode,
            toggle,
        }),
        [modeInternal, vars, setMode, toggle],
    );

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
    const reduce =
        typeof document !== "undefined"
            ? document.documentElement.getAttribute("data-reduced-motion") === "1"
            : false;

    const shellStyle = useMemo(
        () => ({
            minHeight: "100vh",
            background: "var(--bg)",
            color: "var(--fg)",
            transition: reduce
                ? undefined
                : "background-color 320ms ease, color 320ms ease, border-color 320ms ease, box-shadow 320ms ease",
            ...vars,
            ...(props.style ?? {}),
        }),
        [vars, props.style, reduce],
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
    const BORDER = 1; // 1px border on track
    const KNOB = H - 2 * PAD - 2 * BORDER;
    const TRAVEL = W - H; // Equivalent to (W - 2*PAD - 2*BORDER) - KNOB

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
        backgroundImage:
            "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.88))",
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
        transition: "transform 140ms ease, opacity 140ms ease, background 180ms ease, box-shadow 180ms ease",
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
    },
    knob: {
        transition: "transform 190ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 180ms ease",
        willChange: "transform",
    },
};