// cspell:words oklab
// apps/web/src/reader/ReaderTypographyControl.tsx
import React, {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
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
 * Biblia.to — Reader Typography Control
 *
 * Upgraded:
 * - narrower / denser panel
 * - more premium controls
 * - press-and-hold acceleration for weight / size / font arrows
 * - stable floating portal
 * - locked typography contract (measure + leading fixed)
 */

type FontOpt = ReturnType<typeof fontOptions>[number] & {
    cssFamily?: string;
    family?: string;
    previewFamily?: string;
    previewText?: string;
};

type PanelPlacementX = "left" | "right";
type PanelPlacementY = "top" | "bottom";

type PanelLayout = Readonly<{
    left: number;
    top: number;
    width: number;
    height: number;
    placeX: PanelPlacementX;
    placeY: PanelPlacementY;
}>;

const PANEL_W = 268;
const PANEL_H = 236;
const PANEL_MIN_W = 248;
const PANEL_GAP = 8;
const VIEWPORT_PAD = 10;

const STYLE_ATTR = "data-bp-reader-typo-style";
const PORTAL_PANEL_ID = "bp-reader-typo-panel";

const HOLD_INITIAL_DELAY_MS = 260;
const HOLD_REPEAT_START_MS = 120;
const HOLD_REPEAT_FAST_MS = 52;
const HOLD_ACCEL_AFTER_MS = 560;

function clampNum(n: number, lo: number, hi: number): number {
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
}

function normalizeLockedTypography(input: ReaderTypography): ReaderTypography {
    return updateTypography(input, {
        measurePx: DEFAULT_TYPOGRAPHY.measurePx,
        leading: DEFAULT_TYPOGRAPHY.leading,
    });
}

function nextOf<T>(arr: readonly T[], current: T, dir: 1 | -1): T {
    if (arr.length === 0) return current;
    const i = Math.max(0, arr.indexOf(current));
    const n = (i + dir + arr.length) % arr.length;
    return arr[n]!;
}

function eventComposedPath(e: Event): EventTarget[] | null {
    const maybe = e as Event & { composedPath?: () => EventTarget[] };
    return typeof maybe.composedPath === "function" ? maybe.composedPath() : null;
}

function pathContainsNode(path: EventTarget[] | null, node: Node | null): boolean {
    if (!path || !node) return false;
    for (const entry of path) {
        if (entry === node) return true;
    }
    return false;
}

function getViewportSize(): { width: number; height: number } {
    if (typeof window === "undefined") return { width: 0, height: 0 };
    const vv = window.visualViewport;
    if (vv) {
        return {
            width: Math.round(vv.width),
            height: Math.round(vv.height),
        };
    }
    return {
        width: window.innerWidth,
        height: window.innerHeight,
    };
}

function computePanelLayout(trigger: DOMRect, preferredWidth: number): PanelLayout {
    const { width: viewportW, height: viewportH } = getViewportSize();

    const width = Math.round(
        clampNum(preferredWidth, PANEL_MIN_W, Math.max(PANEL_MIN_W, viewportW - VIEWPORT_PAD * 2)),
    );
    const height = Math.min(PANEL_H, Math.max(210, viewportH - VIEWPORT_PAD * 2));

    const roomRight = viewportW - trigger.right - VIEWPORT_PAD;
    const roomLeft = trigger.left - VIEWPORT_PAD;
    const roomBelow = viewportH - trigger.bottom - PANEL_GAP - VIEWPORT_PAD;
    const roomAbove = trigger.top - PANEL_GAP - VIEWPORT_PAD;

    const placeX: PanelPlacementX =
        roomRight >= width || roomRight >= roomLeft ? "right" : "left";
    const placeY: PanelPlacementY =
        roomBelow >= height || roomBelow >= roomAbove ? "bottom" : "top";

    let left = placeX === "right" ? trigger.right - width : trigger.left;
    left = clampNum(
        Math.round(left),
        VIEWPORT_PAD,
        Math.max(VIEWPORT_PAD, viewportW - width - VIEWPORT_PAD),
    );

    let top = placeY === "bottom" ? trigger.bottom + PANEL_GAP : trigger.top - PANEL_GAP - height;
    top = clampNum(
        Math.round(top),
        VIEWPORT_PAD,
        Math.max(VIEWPORT_PAD, viewportH - height - VIEWPORT_PAD),
    );

    return {
        left,
        top,
        width,
        height,
        placeX,
        placeY,
    };
}

function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;

        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);

        setReduced(mq.matches);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);

    return reduced;
}

function useInjectOnceStyle(cssText: string, attr: string): void {
    useEffect(() => {
        if (typeof document === "undefined") return;
        if (document.querySelector(`style[${attr}="1"]`)) return;

        const el = document.createElement("style");
        el.setAttribute(attr, "1");
        el.textContent = cssText;
        document.head.appendChild(el);
    }, [cssText, attr]);
}

function useHoldToRepeat(action: () => void, enabled: boolean) {
    const actionRef = useRef(action);
    const enabledRef = useRef(enabled);
    const timeoutRef = useRef<number | null>(null);
    const intervalRef = useRef<number | null>(null);
    const holdStartedAtRef = useRef<number>(0);

    useEffect(() => {
        actionRef.current = action;
    }, [action]);

    useEffect(() => {
        enabledRef.current = enabled;
    }, [enabled]);

    const clearTimers = useCallback(() => {
        if (timeoutRef.current != null && typeof window !== "undefined") {
            window.clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        if (intervalRef.current != null && typeof window !== "undefined") {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    useEffect(() => clearTimers, [clearTimers]);

    const start = useCallback(() => {
        if (!enabledRef.current || typeof window === "undefined") return;

        clearTimers();
        actionRef.current();
        holdStartedAtRef.current = Date.now();

        timeoutRef.current = window.setTimeout(() => {
            let fast = false;

            const tick = () => {
                if (!enabledRef.current) {
                    clearTimers();
                    return;
                }

                actionRef.current();

                const elapsed = Date.now() - holdStartedAtRef.current;
                if (!fast && elapsed >= HOLD_ACCEL_AFTER_MS) {
                    fast = true;
                    if (intervalRef.current != null) {
                        window.clearInterval(intervalRef.current);
                    }
                    intervalRef.current = window.setInterval(tick, HOLD_REPEAT_FAST_MS);
                }
            };

            intervalRef.current = window.setInterval(tick, HOLD_REPEAT_START_MS);
        }, HOLD_INITIAL_DELAY_MS);
    }, [clearTimers]);

    const stop = useCallback(() => {
        clearTimers();
    }, [clearTimers]);

    return { start, stop };
}

function IconAa() {
    return <span style={{ fontWeight: 860, letterSpacing: "-0.06em" }}>Aa</span>;
}

function IconClose() {
    return <span style={{ fontSize: 11, lineHeight: 1 }}>✕</span>;
}

function IconChevron(props: { dir: "left" | "right" }) {
    return <span aria-hidden>{props.dir === "left" ? "‹" : "›"}</span>;
}

function ArrowButton(props: {
    title: string;
    dir: "left" | "right";
    disabled?: boolean;
    onTrigger: () => void;
}) {
    const { title, dir, disabled = false, onTrigger } = props;
    const hold = useHoldToRepeat(onTrigger, !disabled);

    return (
        <button
            type="button"
            style={{ ...sx.arrowBtn, ...(disabled ? sx.arrowBtnDisabled : null) }}
            onClick={(e) => {
                e.preventDefault();
            }}
            onPointerDown={(e) => {
                if (disabled) return;
                if (e.button !== 0) return;
                e.preventDefault();
                hold.start();
            }}
            onPointerUp={hold.stop}
            onPointerCancel={hold.stop}
            onPointerLeave={hold.stop}
            onBlur={hold.stop}
            onContextMenu={(e) => e.preventDefault()}
            disabled={disabled}
            aria-label={title}
            title={title}
        >
            <IconChevron dir={dir} />
        </button>
    );
}

function ControlCard(props: {
    title: string;
    value: string;
    disabled?: boolean;
    onPrev: () => void;
    onNext: () => void;
}) {
    const { title, value, disabled, onPrev, onNext } = props;

    return (
        <div style={{ ...sx.controlCard, ...(disabled ? sx.controlCardDisabled : null) }}>
            <div style={sx.controlMain}>
                <ArrowButton
                    title={`Previous ${title.toLowerCase()}`}
                    dir="left"
                    disabled={disabled}
                    onTrigger={onPrev}
                />

                <div style={sx.controlCenter}>
                    <div style={sx.controlKicker}>{title}</div>
                    <div style={sx.controlValue} title={value}>
                        {value}
                    </div>
                </div>

                <ArrowButton
                    title={`Next ${title.toLowerCase()}`}
                    dir="right"
                    disabled={disabled}
                    onTrigger={onNext}
                />
            </div>
        </div>
    );
}

export function ReaderTypographyControl() {
    const storageLoadedRef = useRef<ReaderTypography | null>(null);
    if (storageLoadedRef.current === null) {
        storageLoadedRef.current = loadReaderTypography();
    }

    const stored = storageLoadedRef.current;
    const [enabled, setEnabled] = useState<boolean>(!!stored);
    const [t, setT] = useState<ReaderTypography>(
        normalizeLockedTypography(stored ?? DEFAULT_TYPOGRAPHY),
    );
    const [open, setOpen] = useState(false);
    const [panelLayout, setPanelLayout] = useState<PanelLayout | null>(null);

    const rootRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);

    const reducedMotion = usePrefersReducedMotion();
    const limits = useMemo(() => typographyLimits(), []);
    const fonts = useMemo(() => fontOptions() as FontOpt[], []);

    const panelId = useId();
    const labelId = `${panelId}-label`;
    const descId = `${panelId}-desc`;

    useInjectOnceStyle(
        `
@keyframes bpTypoPopoverIn {
  from { opacity: 0; transform: translateY(4px) scale(0.992); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
#${PORTAL_PANEL_ID}::-webkit-scrollbar { width: 8px; height: 8px; }
#${PORTAL_PANEL_ID}::-webkit-scrollbar-track { background: transparent; }
#${PORTAL_PANEL_ID}::-webkit-scrollbar-thumb {
  background: color-mix(in oklab, var(--hairline) 90%, transparent);
  border-radius: 999px;
}
`,
        STYLE_ATTR,
    );

    const current = useMemo(() => normalizeLockedTypography(t), [t]);

    const currentFontIndex = useMemo(() => {
        const idx = fonts.findIndex((f) => f.id === current.font);
        return idx >= 0 ? idx : 0;
    }, [fonts, current.font]);

    const currentFont = useMemo(() => fonts[currentFontIndex] ?? null, [fonts, currentFontIndex]);
    const fontIds = useMemo(() => fonts.map((f) => f.id) as TypographyFont[], [fonts]);

    const sizeValues = useMemo(() => {
        const out: number[] = [];
        for (let n = limits.sizePx.lo; n <= limits.sizePx.hi; n += limits.sizePx.step) {
            out.push(n);
        }
        return out;
    }, [limits.sizePx.hi, limits.sizePx.lo, limits.sizePx.step]);

    const weightValues = useMemo(() => {
        const out: number[] = [];
        for (let n = limits.weight.lo; n <= limits.weight.hi; n += limits.weight.step) {
            out.push(n);
        }
        return out;
    }, [limits.weight.hi, limits.weight.lo, limits.weight.step]);

    const summary = useMemo(() => {
        const font = currentFont?.label ?? String(current.font);
        return `${font} · ${Math.round(current.sizePx)}px · ${Math.round(current.weight)}`;
    }, [current, currentFont]);

    const triggerLabel = enabled ? summary : "Typography off";

    const setPatch = useCallback((patch: Partial<ReaderTypography>) => {
        setEnabled(true);
        setT((prev) => normalizeLockedTypography(updateTypography(prev, patch)));
    }, []);

    const recomputeLayout = useCallback(() => {
        if (!open) return;
        const trigger = triggerRef.current;
        if (!trigger) return;
        setPanelLayout(computePanelLayout(trigger.getBoundingClientRect(), PANEL_W));
    }, [open]);

    const closePanel = useCallback(() => {
        setOpen(false);
        setPanelLayout(null);
        queueMicrotask(() => {
            triggerRef.current?.focus();
        });
    }, []);

    const resetToDefaults = useCallback(() => {
        setEnabled(false);
        setT(normalizeLockedTypography(DEFAULT_TYPOGRAPHY));
        setOpen(false);
        setPanelLayout(null);
        queueMicrotask(() => {
            triggerRef.current?.focus();
        });
    }, []);

    const cycleFont = useCallback(
        (dir: -1 | 1) => {
            if (!fontIds.length) return;
            setPatch({ font: nextOf(fontIds, current.font, dir) });
        },
        [current.font, fontIds, setPatch],
    );

    const cycleSize = useCallback(
        (dir: -1 | 1) => {
            if (!sizeValues.length) return;
            const cur = Math.round(current.sizePx);
            setPatch({ sizePx: nextOf(sizeValues, cur, dir) });
        },
        [current.sizePx, setPatch, sizeValues],
    );

    const cycleWeight = useCallback(
        (dir: -1 | 1) => {
            if (!weightValues.length) return;
            const cur = Math.round(current.weight);
            setPatch({ weight: nextOf(weightValues, cur, dir) });
        },
        [current.weight, setPatch, weightValues],
    );

    useEffect(() => {
        const locked = normalizeLockedTypography(current);

        if (!enabled) {
            clearReaderTypography();
            return;
        }

        applyReaderTypography(locked);
        saveReaderTypography(locked);

        if (
            locked.measurePx !== current.measurePx ||
            locked.leading !== current.leading ||
            locked.sizePx !== current.sizePx ||
            locked.weight !== current.weight ||
            locked.font !== current.font
        ) {
            setT(locked);
        }
    }, [enabled, current]);

    useLayoutEffect(() => {
        if (!open) return;
        recomputeLayout();
    }, [open, recomputeLayout]);

    useEffect(() => {
        if (!open) return;

        const id = requestAnimationFrame(() => {
            recomputeLayout();
            panelRef.current?.focus();
        });

        return () => cancelAnimationFrame(id);
    }, [open, recomputeLayout]);

    useEffect(() => {
        if (!open) return;

        const update = () => recomputeLayout();
        const vv = typeof window !== "undefined" ? window.visualViewport : null;

        window.addEventListener("resize", update, { passive: true });
        window.addEventListener("scroll", update, true);
        vv?.addEventListener("resize", update, { passive: true });
        vv?.addEventListener("scroll", update, { passive: true });

        return () => {
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
            vv?.removeEventListener("resize", update);
            vv?.removeEventListener("scroll", update);
        };
    }, [open, recomputeLayout]);

    useEffect(() => {
        if (!open) return;

        const onPointerDownCapture = (e: PointerEvent) => {
            const root = rootRef.current;
            const panel = panelRef.current;
            const target = e.target as Node | null;
            const path = eventComposedPath(e);

            const insideRoot =
                !!(target && root && root.contains(target)) || pathContainsNode(path, root);
            const insidePanel =
                !!(target && panel && panel.contains(target)) || pathContainsNode(path, panel);

            if (!insideRoot && !insidePanel) closePanel();
        };

        document.addEventListener("pointerdown", onPointerDownCapture, { capture: true });
        return () => {
            document.removeEventListener("pointerdown", onPointerDownCapture, { capture: true });
        };
    }, [open, closePanel]);

    useEffect(() => {
        if (!open) return;

        const onKeyCapture = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                closePanel();
                return;
            }

            if (e.metaKey || e.ctrlKey || e.altKey) return;

            switch (e.key) {
                case "ArrowLeft":
                    cycleFont(-1);
                    e.preventDefault();
                    return;
                case "ArrowRight":
                    cycleFont(1);
                    e.preventDefault();
                    return;
                case "[":
                    cycleSize(-1);
                    e.preventDefault();
                    return;
                case "]":
                    cycleSize(1);
                    e.preventDefault();
                    return;
                case "-":
                    cycleWeight(-1);
                    e.preventDefault();
                    return;
                case "=":
                case "+":
                    cycleWeight(1);
                    e.preventDefault();
                    return;
                default:
                    return;
            }
        };

        window.addEventListener("keydown", onKeyCapture, { capture: true });
        return () => window.removeEventListener("keydown", onKeyCapture, { capture: true });
    }, [open, closePanel, cycleFont, cycleSize, cycleWeight]);

    const panelStyle = useMemo<React.CSSProperties>(() => {
        if (!panelLayout) {
            return {
                ...sx.panel,
                opacity: 0,
                pointerEvents: "none",
            };
        }

        const originX = panelLayout.placeX === "right" ? "right" : "left";
        const originY = panelLayout.placeY === "bottom" ? "top" : "bottom";

        return {
            ...sx.panel,
            ...(reducedMotion ? sx.panelNoMotion : null),
            left: panelLayout.left,
            top: panelLayout.top,
            width: panelLayout.width,
            height: panelLayout.height,
            maxHeight: panelLayout.height,
            transformOrigin: `${originY} ${originX}`,
        };
    }, [panelLayout, reducedMotion]);

    const panelNode =
        open && typeof document !== "undefined"
            ? createPortal(
                <div
                    id={PORTAL_PANEL_ID}
                    ref={panelRef}
                    role="dialog"
                    aria-modal="false"
                    aria-labelledby={labelId}
                    aria-describedby={descId}
                    tabIndex={-1}
                    style={panelStyle}
                >
                    <div style={sx.header}>
                        <div style={sx.headerText}>
                            <div id={labelId} style={sx.title}>
                                Typography
                            </div>
                            <div id={descId} style={sx.subtitle}>
                                Font, size, weight.
                            </div>
                        </div>

                        <div style={sx.headerActions}>
                            <button
                                type="button"
                                style={{
                                    ...sx.toggleBtn,
                                    ...(enabled ? sx.toggleBtnOn : sx.toggleBtnOff),
                                }}
                                onClick={() => setEnabled((v) => !v)}
                                aria-pressed={enabled}
                                title={enabled ? "Typography overrides on" : "Typography overrides off"}
                            >
                                {enabled ? "On" : "Off"}
                            </button>

                            <button
                                type="button"
                                onClick={closePanel}
                                style={sx.iconBtn}
                                aria-label="Close typography settings"
                                title="Close"
                            >
                                <IconClose />
                            </button>
                        </div>
                    </div>

                    <div style={sx.body}>
                        <div style={sx.stack}>
                            <ControlCard
                                title="Font"
                                value={currentFont?.label ?? String(current.font)}
                                disabled={!enabled}
                                onPrev={() => cycleFont(-1)}
                                onNext={() => cycleFont(1)}
                            />

                            <ControlCard
                                title="Size"
                                value={`${Math.round(current.sizePx)}px`}
                                disabled={!enabled}
                                onPrev={() => cycleSize(-1)}
                                onNext={() => cycleSize(1)}
                            />

                            <ControlCard
                                title="Weight"
                                value={`${Math.round(current.weight)}`}
                                disabled={!enabled}
                                onPrev={() => cycleWeight(-1)}
                                onNext={() => cycleWeight(1)}
                            />
                        </div>
                    </div>

                    <div style={sx.footer}>
                        <button type="button" style={sx.resetBtn} onClick={resetToDefaults}>
                            Reset
                        </button>
                        <button type="button" style={sx.doneBtn} onClick={closePanel}>
                            Done
                        </button>
                    </div>
                </div>,
                document.body,
            )
            : null;

    return (
        <div ref={rootRef} style={sx.root}>
            <button
                ref={triggerRef}
                type="button"
                style={{
                    ...sx.trigger,
                    ...(open ? sx.triggerOpen : null),
                    ...(enabled ? sx.triggerEnabled : sx.triggerDisabled),
                }}
                onClick={() => {
                    setOpen((prev) => {
                        const next = !prev;
                        if (!next) setPanelLayout(null);
                        return next;
                    });
                }}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={panelId}
                aria-label="Typography settings"
                title={triggerLabel}
            >
                <span style={sx.triggerGlyph}>
                    <IconAa />
                </span>
                <span style={sx.triggerMeta}>
                    <span style={sx.triggerMetaTop}>Type</span>
                    <span style={sx.triggerMetaBottom}>{enabled ? "On" : "Off"}</span>
                </span>
                <span style={{ ...sx.dot, ...(enabled ? sx.dotOn : sx.dotOff) }} aria-hidden />
            </button>

            {panelNode}
        </div>
    );
}

const sx: Record<string, React.CSSProperties> = {
    root: {
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
    },

    trigger: {
        height: 30,
        minWidth: 76,
        borderRadius: 11,
        border: "1px solid color-mix(in oklab, var(--hairline) 92%, transparent)",
        background:
            "linear-gradient(180deg, color-mix(in oklab, var(--panel) 97%, transparent), color-mix(in oklab, var(--panel) 90%, var(--bg)))",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "0 10px",
        cursor: "pointer",
        userSelect: "none",
        boxShadow:
            "0 1px 0 rgba(255,255,255,0.28) inset, 0 10px 24px rgba(0,0,0,0.075)",
        transition:
            "transform 160ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 160ms cubic-bezier(0.23, 1, 0.32, 1), border-color 140ms ease, background 140ms ease, opacity 140ms ease",
        position: "relative",
        outline: "none",
        WebkitTapHighlightColor: "transparent",
    },
    triggerOpen: {
        transform: "translateY(-1px)",
        borderColor: "color-mix(in oklab, var(--focus) 58%, var(--hairline))",
        boxShadow:
            "0 1px 0 rgba(255,255,255,0.32) inset, 0 18px 34px rgba(0,0,0,0.14)",
        background:
            "linear-gradient(180deg, color-mix(in oklab, var(--panel) 99%, transparent), color-mix(in oklab, var(--panel) 92%, var(--bg)))",
    },
    triggerEnabled: {
        opacity: 1,
    },
    triggerDisabled: {
        opacity: 0.95,
    },
    triggerGlyph: {
        width: 16,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 860,
        letterSpacing: "-0.05em",
        flexShrink: 0,
    },
    triggerMeta: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        minWidth: 0,
        lineHeight: 1.02,
        gap: 1,
    },
    triggerMetaTop: {
        fontSize: 9.4,
        fontWeight: 760,
        color: "var(--muted)",
        letterSpacing: "-0.01em",
    },
    triggerMetaBottom: {
        fontSize: 10.8,
        fontWeight: 860,
        letterSpacing: "-0.01em",
        color: "var(--fg)",
    },

    dot: {
        marginLeft: "auto",
        width: 7,
        height: 7,
        borderRadius: 999,
        border: "1px solid color-mix(in oklab, var(--hairline) 70%, transparent)",
        flexShrink: 0,
    },
    dotOn: {
        background: "#22c55e",
        boxShadow: "0 0 0 4px rgba(34,197,94,0.14)",
    },
    dotOff: {
        background: "color-mix(in oklab, var(--muted) 40%, transparent)",
    },

    panel: {
        position: "fixed",
        zIndex: 99999,
        borderRadius: 16,
        border: "1px solid color-mix(in oklab, var(--hairline) 92%, transparent)",
        background:
            "linear-gradient(180deg, color-mix(in oklab, var(--bg) 99%, var(--panel)), color-mix(in oklab, var(--bg) 96%, var(--panel)))",
        boxShadow:
            "0 1px 0 rgba(255,255,255,0.26) inset, 0 28px 68px rgba(0,0,0,0.22)",
        overflow: "hidden",
        padding: 9,
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr) auto",
        gap: 7,
        animation: "bpTypoPopoverIn 120ms cubic-bezier(0.23, 1, 0.32, 1) both",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
    },
    panelNoMotion: {
        animation: "none",
    },

    header: {
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 8,
        minHeight: 0,
    },
    headerText: {
        display: "flex",
        flexDirection: "column",
        gap: 1,
        minWidth: 0,
    },
    title: {
        fontSize: 12.6,
        fontWeight: 860,
        letterSpacing: "-0.02em",
        color: "var(--fg)",
    },
    subtitle: {
        fontSize: 9.8,
        color: "var(--muted)",
        lineHeight: 1.22,
        maxWidth: 152,
    },
    headerActions: {
        display: "flex",
        alignItems: "center",
        gap: 5,
        flexShrink: 0,
    },

    toggleBtn: {
        height: 26,
        minWidth: 44,
        borderRadius: 999,
        border: "1px solid color-mix(in oklab, var(--hairline) 94%, transparent)",
        padding: "0 9px",
        fontSize: 10.4,
        fontWeight: 860,
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        boxShadow: "0 1px 0 rgba(255,255,255,0.18) inset",
        transition:
            "background 140ms ease, border-color 140ms ease, color 140ms ease, box-shadow 140ms ease, transform 140ms ease",
    },
    toggleBtnOn: {
        background:
            "linear-gradient(180deg, color-mix(in oklab, var(--fg) 100%, white 0%), color-mix(in oklab, var(--fg) 90%, black 10%))",
        borderColor: "color-mix(in oklab, var(--fg) 88%, black 12%)",
        color: "var(--bg)",
        boxShadow: "0 10px 18px rgba(0,0,0,0.16)",
    },
    toggleBtnOff: {
        background:
            "linear-gradient(180deg, color-mix(in oklab, var(--panel) 98%, transparent), color-mix(in oklab, var(--panel) 92%, var(--bg)))",
        borderColor: "color-mix(in oklab, var(--hairline) 94%, transparent)",
        color: "var(--muted)",
    },

    iconBtn: {
        width: 26,
        height: 26,
        borderRadius: 999,
        border: "1px solid color-mix(in oklab, var(--hairline) 96%, transparent)",
        background:
            "linear-gradient(180deg, color-mix(in oklab, var(--panel) 99%, transparent), color-mix(in oklab, var(--panel) 92%, var(--bg)))",
        color: "var(--fg)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
        boxShadow: "0 1px 0 rgba(255,255,255,0.2) inset",
    },

    body: {
        minHeight: 0,
        overflow: "hidden",
    },
    stack: {
        height: "100%",
        display: "grid",
        gridTemplateColumns: "1fr",
        gridAutoRows: "1fr",
        gap: 7,
        alignItems: "stretch",
    },

    controlCard: {
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        borderRadius: 12,
        border: "1px solid color-mix(in oklab, var(--hairline) 96%, transparent)",
        background:
            "linear-gradient(180deg, color-mix(in oklab, var(--bg) 90%, var(--panel)), color-mix(in oklab, var(--bg) 84%, var(--panel)))",
        padding: 7,
        minWidth: 0,
        minHeight: 0,
        boxShadow: "0 1px 0 rgba(255,255,255,0.12) inset",
    },
    controlCardDisabled: {
        opacity: 0.62,
    },
    controlMain: {
        display: "grid",
        gridTemplateColumns: "24px minmax(0,1fr) 24px",
        alignItems: "center",
        gap: 6,
        minWidth: 0,
    },
    controlCenter: {
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
    },
    controlKicker: {
        fontSize: 9.5,
        fontWeight: 760,
        color: "var(--muted)",
        letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
    },
    controlValue: {
        fontSize: 10.9,
        fontWeight: 840,
        color: "var(--fg)",
        letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        textAlign: "center",
        width: "100%",
        maxWidth: "100%",
    },

    arrowBtn: {
        width: 24,
        height: 24,
        borderRadius: 8,
        border: "1px solid color-mix(in oklab, var(--hairline) 84%, transparent)",
        background:
            "linear-gradient(180deg, color-mix(in oklab, var(--fg) 100%, white 0%), color-mix(in oklab, var(--fg) 88%, black 12%))",
        color: "var(--bg)",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 15,
        fontWeight: 900,
        flexShrink: 0,
        WebkitTapHighlightColor: "transparent",
        padding: 0,
        boxShadow:
            "0 1px 0 rgba(255,255,255,0.1) inset, 0 8px 16px rgba(0,0,0,0.16)",
        userSelect: "none",
        transition:
            "transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease, filter 120ms ease",
    },
    arrowBtnDisabled: {
        cursor: "not-allowed",
        opacity: 0.38,
        boxShadow: "none",
    },

    footer: {
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 7,
        minHeight: 0,
    },
    doneBtn: {
        height: 30,
        minWidth: 66,
        borderRadius: 10,
        border: "1px solid color-mix(in oklab, var(--fg) 84%, black 16%)",
        background:
            "linear-gradient(180deg, color-mix(in oklab, var(--fg) 100%, white 0%), color-mix(in oklab, var(--fg) 88%, black 12%))",
        color: "var(--bg)",
        fontSize: 10.9,
        fontWeight: 860,
        padding: "0 11px",
        cursor: "pointer",
        boxShadow:
            "0 1px 0 rgba(255,255,255,0.1) inset, 0 10px 18px rgba(0,0,0,0.16)",
        WebkitTapHighlightColor: "transparent",
    },
    resetBtn: {
        height: 30,
        minWidth: 62,
        borderRadius: 10,
        border: "1px solid color-mix(in oklab, var(--hairline) 94%, transparent)",
        background:
            "linear-gradient(180deg, color-mix(in oklab, var(--panel) 99%, transparent), color-mix(in oklab, var(--panel) 92%, var(--bg)))",
        color: "var(--muted)",
        fontSize: 10.7,
        fontWeight: 780,
        padding: "0 11px",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        boxShadow: "0 1px 0 rgba(255,255,255,0.16) inset",
    },
};