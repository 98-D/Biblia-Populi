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
 * Locked contract:
 * - measurePx always fixed to DEFAULT_TYPOGRAPHY.measurePx
 * - leading always fixed to DEFAULT_TYPOGRAPHY.leading
 * - user controls: enabled + font + size + weight
 *
 * Notes:
 * - stable storage/apply contract
 * - viewport-aware panel positioning
 * - touch + mouse friendly controls
 * - hard guard against stale/legacy measure/leading drift
 * - no deprecated MediaQueryList listener APIs
 */

type FontOpt = ReturnType<typeof fontOptions>[number] & {
    cssFamily?: string;
    family?: string;
    previewFamily?: string;
    previewText?: string;
};

type PanelSide = "bottom-right" | "bottom-left";

const PANEL_W = 332;
const PANEL_GAP = 10;
const SAMPLE_TEXT = "In the beginning God created the heaven and the earth.";

function clampNum(n: number, lo: number, hi: number): number {
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
}

function roundToStep(n: number, step: number): number {
    if (!Number.isFinite(n) || !Number.isFinite(step) || step <= 0) return n;
    return Math.round(n / step) * step;
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

function fontFamilyForOpt(f: FontOpt | null): string {
    if (!f) return "var(--font-serif)";
    const fam = (f.previewFamily ?? f.cssFamily ?? f.family ?? String(f.id)).trim();
    if (!fam) return "var(--font-serif)";
    if (
         fam.startsWith("var(") ||
         fam.includes(",") ||
         fam.startsWith("ui-") ||
         fam.includes("system-ui")
    ) {
        return fam;
    }
    return `"${fam}", var(--font-serif), Georgia, Cambria, "Times New Roman", serif`;
}

function isRangeInput(el: Element | null): el is HTMLInputElement {
    return !!el && el.tagName === "INPUT" && (el as HTMLInputElement).type === "range";
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

function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;

        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);

        setReduced(mq.matches);
        mq.addEventListener("change", onChange);

        return () => {
            mq.removeEventListener("change", onChange);
        };
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

function useViewportPanelSide(
     open: boolean,
     triggerRef: React.RefObject<HTMLButtonElement | null>,
): PanelSide {
    const [side, setSide] = useState<PanelSide>("bottom-right");

    useLayoutEffect(() => {
        if (!open || typeof window === "undefined") return;

        const compute = () => {
            const trigger = triggerRef.current;
            if (!trigger) return;

            const rect = trigger.getBoundingClientRect();
            const roomRight = window.innerWidth - rect.right;
            const roomLeft = rect.left;

            if (roomRight >= PANEL_W || roomRight >= roomLeft) {
                setSide("bottom-right");
            } else {
                setSide("bottom-left");
            }
        };

        compute();
        window.addEventListener("resize", compute);

        return () => window.removeEventListener("resize", compute);
    }, [open, triggerRef]);

    return side;
}

function IconAa() {
    return <span style={{ fontWeight: 860, letterSpacing: "-0.06em" }}>Aa</span>;
}

function IconX() {
    return <span style={{ fontSize: 14, lineHeight: 1 }}>✕</span>;
}

function IconCheck(props: { on: boolean }) {
    return (
         <span
              aria-hidden
              style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  lineHeight: 1,
                  border: "1px solid color-mix(in oklab, var(--hairline) 88%, transparent)",
                  background: props.on
                       ? "color-mix(in oklab, var(--focus) 92%, transparent)"
                       : "transparent",
                  color: props.on ? "#fff" : "transparent",
                  flexShrink: 0,
              }}
         >
            ✓
        </span>
    );
}

const FONT_PREVIEW_TEXTS = [
    "Blessed are the pure in heart.",
    "The earth was without form, and void.",
    "The Lord is my shepherd; I shall not want.",
] as const;

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

    const rootRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const firstFontButtonRef = useRef<HTMLButtonElement | null>(null);

    const reducedMotion = usePrefersReducedMotion();
    const limits = useMemo(() => typographyLimits(), []);
    const fonts = useMemo(() => fontOptions() as FontOpt[], []);
    const ids = useMemo(() => fonts.map((f) => f.id) as TypographyFont[], [fonts]);

    const panelSide = useViewportPanelSide(open, triggerRef);

    const panelId = useId();
    const labelId = `${panelId}-label`;
    const descId = `${panelId}-desc`;

    useInjectOnceStyle(
         `
@keyframes bpTypoPop {
  from { opacity: 0; transform: translateY(6px) scale(0.985); }
  to   { opacity: 1; transform: translateY(0px) scale(1); }
}
`,
         "data-bp-typo-pop",
    );

    const current = useMemo(() => normalizeLockedTypography(t), [t]);

    const currentFontIndex = useMemo(() => {
        if (!fonts.length) return 0;
        const idx = fonts.findIndex((f) => f.id === current.font);
        return idx >= 0 ? idx : 0;
    }, [fonts, current.font]);

    const currentFont = useMemo(() => {
        if (!fonts.length) return null;
        return fonts[currentFontIndex] ?? null;
    }, [fonts, currentFontIndex]);

    const currentFontCss = useMemo(() => fontFamilyForOpt(currentFont), [currentFont]);

    const summary = useMemo(() => {
        const font = currentFont?.label ?? String(current.font);
        const size = `${Math.round(current.sizePx)}px`;
        const weight = `${Math.round(current.weight)}`;
        return `${font} · ${size} · ${weight}`;
    }, [current, currentFont]);

    const setPatch = useCallback((patch: Partial<ReaderTypography>) => {
        setEnabled(true);
        setT((prev) => normalizeLockedTypography(updateTypography(prev, patch)));
    }, []);

    const closePanel = useCallback(() => {
        setOpen(false);
        queueMicrotask(() => {
            triggerRef.current?.focus();
        });
    }, []);

    const resetToDefaults = useCallback(() => {
        setEnabled(false);
        setT(normalizeLockedTypography(DEFAULT_TYPOGRAPHY));
        setOpen(false);
        queueMicrotask(() => {
            triggerRef.current?.focus();
        });
    }, []);

    const cycleFont = useCallback(
         (dir: -1 | 1) => {
             if (!ids.length) return;
             setPatch({ font: nextOf(ids, current.font, dir) });
         },
         [ids, current.font, setPatch],
    );

    const applySizeDelta = useCallback(
         (delta: number) => {
             const step = limits.sizePx.step;
             const next = clampNum(
                  roundToStep(current.sizePx + delta * step, step),
                  limits.sizePx.lo,
                  limits.sizePx.hi,
             );
             setPatch({ sizePx: Math.round(next) });
         },
         [current.sizePx, limits.sizePx.hi, limits.sizePx.lo, limits.sizePx.step, setPatch],
    );

    const applyWeightDelta = useCallback(
         (delta: number) => {
             const step = limits.weight.step;
             const next = clampNum(
                  roundToStep(current.weight + delta * step, step),
                  limits.weight.lo,
                  limits.weight.hi,
             );
             setPatch({ weight: Math.round(next) });
         },
         [current.weight, limits.weight.hi, limits.weight.lo, limits.weight.step, setPatch],
    );

    useEffect(() => {
        const locked = normalizeLockedTypography(current);

        if (!enabled) {
            applyReaderTypography(null);
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

    useEffect(() => {
        if (!open) return;
        queueMicrotask(() => {
            if (firstFontButtonRef.current) {
                firstFontButtonRef.current.focus();
                return;
            }
            panelRef.current?.focus();
        });
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const onPointerDownCapture = (e: PointerEvent) => {
            const root = rootRef.current;
            if (!root) return;

            const target = e.target as Node | null;
            const path = eventComposedPath(e);
            const inside =
                 !!(target && root.contains(target)) || pathContainsNode(path, root);

            if (!inside) closePanel();
        };

        document.addEventListener("pointerdown", onPointerDownCapture, { capture: true });
        return () => {
            document.removeEventListener("pointerdown", onPointerDownCapture, {
                capture: true,
            });
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

            const activeEl = document.activeElement as Element | null;

            if (isRangeInput(activeEl)) {
                if (e.key === "Home" || e.key === "End") {
                    const min = Number(activeEl.min);
                    const max = Number(activeEl.max);
                    activeEl.value = String(e.key === "Home" ? min : max);
                    activeEl.dispatchEvent(new Event("input", { bubbles: true }));
                    activeEl.dispatchEvent(new Event("change", { bubbles: true }));
                    e.preventDefault();
                }
                return;
            }

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
                    applySizeDelta(-1);
                    e.preventDefault();
                    return;
                case "]":
                    applySizeDelta(1);
                    e.preventDefault();
                    return;
                case "-":
                    applyWeightDelta(-1);
                    e.preventDefault();
                    return;
                case "=":
                case "+":
                    applyWeightDelta(1);
                    e.preventDefault();
                    return;
                default:
                    return;
            }
        };

        window.addEventListener("keydown", onKeyCapture, { capture: true });
        return () => window.removeEventListener("keydown", onKeyCapture, { capture: true });
    }, [open, closePanel, cycleFont, applySizeDelta, applyWeightDelta]);

    const panelStyle = useMemo<React.CSSProperties>(() => {
        const base: React.CSSProperties = {
            ...sx.panel,
            ...(reducedMotion ? sx.panelNoMotion : null),
        };

        if (panelSide === "bottom-left") {
            return {
                ...base,
                left: 0,
                right: "auto",
                transformOrigin: "top left",
            };
        }

        return {
            ...base,
            right: 0,
            left: "auto",
            transformOrigin: "top right",
        };
    }, [panelSide, reducedMotion]);

    const sliderStyle = enabled ? sx.range : { ...sx.range, ...sx.rangeDisabled };

    return (
         <div ref={rootRef} style={sx.root}>
             <button
                  ref={triggerRef}
                  type="button"
                  style={{
                      ...sx.trigger,
                      ...(open ? sx.triggerOpen : null),
                      ...(enabled ? null : sx.triggerDisabled),
                  }}
                  onClick={() => setOpen((v) => !v)}
                  aria-haspopup="dialog"
                  aria-expanded={open}
                  aria-controls={panelId}
                  aria-label="Typography settings"
                  title={`Typography (${summary})`}
             >
                <span style={sx.triggerGlyph}>
                    <IconAa />
                </span>
                 <span style={{ ...sx.dot, ...(enabled ? sx.dotOn : sx.dotOff) }} aria-hidden />
             </button>

             {open ? (
                  <div
                       id={panelId}
                       ref={panelRef}
                       role="dialog"
                       aria-modal="false"
                       aria-labelledby={labelId}
                       aria-describedby={descId}
                       tabIndex={-1}
                       style={panelStyle}
                  >
                      <div style={sx.header}>
                          <div style={sx.hTitleWrap}>
                              <div id={labelId} style={sx.hTitle}>
                                  Typography
                              </div>
                              <div id={descId} style={sx.hSub}>
                                  Reader overrides for font, size, and weight.
                              </div>
                          </div>

                          <div style={sx.hRight}>
                              <label style={sx.switchLabel} title={enabled ? "Overrides on" : "Overrides off"}>
                                  <input
                                       type="checkbox"
                                       checked={enabled}
                                       onChange={() => setEnabled((v) => !v)}
                                       style={sx.switchInput}
                                       aria-label={
                                           enabled
                                                ? "Turn typography overrides off"
                                                : "Turn typography overrides on"
                                       }
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

                              <button
                                   type="button"
                                   onClick={closePanel}
                                   style={sx.iconBtn}
                                   aria-label="Close"
                              >
                                  <IconX />
                              </button>
                          </div>
                      </div>

                      <div style={sx.summaryRow}>
                          <div style={sx.summaryText} title={summary}>
                              {summary}
                          </div>
                          <div style={sx.lockPill} title="Width and leading are locked">
                              Locked layout
                          </div>
                      </div>

                      <div
                           style={{
                               ...sx.sampleCard,
                               ...(enabled ? null : sx.sampleCardDisabled),
                           }}
                           aria-hidden={!enabled}
                      >
                          <div style={sx.sampleMetaRow}>
                              <span style={sx.sampleMetaLabel}>Live preview</span>
                              <span style={sx.sampleMetaValue}>
                                {Math.round(current.sizePx)}px · {Math.round(current.weight)}
                            </span>
                          </div>

                          <div
                               style={{
                                   ...sx.sampleVerse,
                                   fontFamily: currentFontCss,
                                   fontSize: current.sizePx,
                                   fontWeight: current.weight,
                                   lineHeight: DEFAULT_TYPOGRAPHY.leading,
                                   maxWidth: DEFAULT_TYPOGRAPHY.measurePx,
                               }}
                          >
                              {SAMPLE_TEXT}
                          </div>
                      </div>

                      {!enabled ? (
                           <div style={sx.offRow}>
                               <span style={sx.offPill}>Off</span>
                               <span style={sx.offText}>Enable to apply reader typography overrides.</span>
                           </div>
                      ) : null}

                      <div style={sx.body}>
                          <div style={sx.sectionHead}>
                              <div style={sx.sectionTitle}>Fonts</div>
                              <div style={sx.sectionHint}>← → to cycle</div>
                          </div>

                          <div style={sx.fontNavRow}>
                              <button
                                   type="button"
                                   style={{ ...sx.chevBtn, ...(enabled ? null : sx.chevBtnDisabled) }}
                                   onClick={() => cycleFont(-1)}
                                   disabled={!enabled || fonts.length === 0}
                                   aria-label="Previous font"
                                   title="Previous font"
                              >
                                  ‹
                              </button>

                              <div style={sx.fontIndexPill}>
                                  {fonts.length ? `${currentFontIndex + 1}/${fonts.length}` : "0/0"}
                              </div>

                              <button
                                   type="button"
                                   style={{ ...sx.chevBtn, ...(enabled ? null : sx.chevBtnDisabled) }}
                                   onClick={() => cycleFont(1)}
                                   disabled={!enabled || fonts.length === 0}
                                   aria-label="Next font"
                                   title="Next font"
                              >
                                  ›
                              </button>
                          </div>

                          <div style={sx.fontGrid} role="list" aria-label="Font choices">
                              {fonts.map((font, index) => {
                                  const selected = font.id === current.font;
                                  const previewFamily = fontFamilyForOpt(font);
                                  const previewText =
                                       font.previewText?.trim() ||
                                       FONT_PREVIEW_TEXTS[index % FONT_PREVIEW_TEXTS.length];

                                  return (
                                       <button
                                            key={font.id}
                                            ref={index === 0 ? firstFontButtonRef : undefined}
                                            type="button"
                                            role="listitem"
                                            disabled={!enabled}
                                            aria-pressed={selected}
                                            onClick={() => setPatch({ font: font.id })}
                                            title={font.label}
                                            style={{
                                                ...sx.fontCard,
                                                ...(selected ? sx.fontCardSelected : null),
                                                ...(enabled ? null : sx.fontCardDisabled),
                                            }}
                                       >
                                           <div style={sx.fontCardTop}>
                                               <IconCheck on={selected} />
                                               <span style={sx.fontCardName}>{font.label}</span>
                                           </div>

                                           <div
                                                style={{
                                                    ...sx.fontCardSample,
                                                    fontFamily: previewFamily,
                                                    fontWeight: current.weight,
                                                }}
                                           >
                                               {previewText}
                                           </div>
                                       </button>
                                  );
                              })}
                          </div>

                          <div style={sx.block}>
                              <div style={sx.blockTop}>
                                  <span style={sx.blockLabel}>Size</span>
                                  <div style={sx.blockTopRight}>
                                      <button
                                           type="button"
                                           style={{
                                               ...sx.miniStepBtn,
                                               ...(enabled ? null : sx.miniStepBtnDisabled),
                                           }}
                                           onClick={() => applySizeDelta(-1)}
                                           disabled={!enabled}
                                           aria-label="Decrease size"
                                      >
                                          −
                                      </button>
                                      <span style={sx.blockValue}>{Math.round(current.sizePx)}px</span>
                                      <button
                                           type="button"
                                           style={{
                                               ...sx.miniStepBtn,
                                               ...(enabled ? null : sx.miniStepBtnDisabled),
                                           }}
                                           onClick={() => applySizeDelta(1)}
                                           disabled={!enabled}
                                           aria-label="Increase size"
                                      >
                                          +
                                      </button>
                                  </div>
                              </div>

                              <input
                                   type="range"
                                   min={limits.sizePx.lo}
                                   max={limits.sizePx.hi}
                                   step={limits.sizePx.step}
                                   value={current.sizePx}
                                   onChange={(e) =>
                                        setPatch({
                                            sizePx: Math.round(
                                                 clampNum(
                                                      Number(e.target.value),
                                                      limits.sizePx.lo,
                                                      limits.sizePx.hi,
                                                 ),
                                            ),
                                        })
                                   }
                                   style={sliderStyle}
                                   disabled={!enabled}
                                   aria-label="Scripture font size"
                              />

                              <div style={sx.keyHint}>Keys: [ and ]</div>
                          </div>

                          <div style={sx.block}>
                              <div style={sx.blockTop}>
                                  <span style={sx.blockLabel}>Weight</span>
                                  <div style={sx.blockTopRight}>
                                      <button
                                           type="button"
                                           style={{
                                               ...sx.miniStepBtn,
                                               ...(enabled ? null : sx.miniStepBtnDisabled),
                                           }}
                                           onClick={() => applyWeightDelta(-1)}
                                           disabled={!enabled}
                                           aria-label="Decrease weight"
                                      >
                                          −
                                      </button>
                                      <span style={sx.blockValue}>{Math.round(current.weight)}</span>
                                      <button
                                           type="button"
                                           style={{
                                               ...sx.miniStepBtn,
                                               ...(enabled ? null : sx.miniStepBtnDisabled),
                                           }}
                                           onClick={() => applyWeightDelta(1)}
                                           disabled={!enabled}
                                           aria-label="Increase weight"
                                      >
                                          +
                                      </button>
                                  </div>
                              </div>

                              <input
                                   type="range"
                                   min={limits.weight.lo}
                                   max={limits.weight.hi}
                                   step={limits.weight.step}
                                   value={current.weight}
                                   onChange={(e) =>
                                        setPatch({
                                            weight: Math.round(
                                                 clampNum(
                                                      Number(e.target.value),
                                                      limits.weight.lo,
                                                      limits.weight.hi,
                                                 ),
                                            ),
                                        })
                                   }
                                   style={sliderStyle}
                                   disabled={!enabled}
                                   aria-label="Scripture font weight"
                              />

                              <div style={sx.keyHint}>Keys: - and +</div>
                          </div>
                      </div>

                      <div style={sx.footer}>
                          <button type="button" style={sx.doneBtn} onClick={closePanel}>
                              Done
                          </button>

                          <button
                               type="button"
                               style={sx.resetBtn}
                               onClick={resetToDefaults}
                               title="Reset and turn off overrides"
                          >
                              Reset
                          </button>
                      </div>
                  </div>
             ) : null}
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
    triggerDisabled: {
        opacity: 0.92,
    },
    triggerGlyph: {
        fontSize: 13.5,
        fontWeight: 860,
        letterSpacing: "-0.05em",
    },

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
    dotOff: {
        background: "color-mix(in oklab, var(--muted) 40%, transparent)",
    },

    panel: {
        position: "absolute",
        top: 32 + PANEL_GAP,
        width: PANEL_W,
        maxWidth: "min(360px, calc(100vw - 18px))",
        borderRadius: 18,
        border: "1px solid color-mix(in oklab, var(--hairline) 92%, transparent)",
        background: "color-mix(in oklab, var(--bg) 96%, var(--panel))",
        boxShadow: "0 28px 80px rgba(0,0,0,0.22)",
        overflow: "hidden",
        zIndex: 9999,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        animation: "bpTypoPop 170ms cubic-bezier(0.23, 1, 0.32, 1) both",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
    },
    panelNoMotion: {
        animation: "none",
    },

    header: {
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 10,
        padding: "1px 1px 0",
    },
    hTitleWrap: {
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minWidth: 0,
    },
    hTitle: {
        fontSize: 13,
        fontWeight: 860,
        letterSpacing: "-0.02em",
    },
    hSub: {
        fontSize: 10.8,
        color: "var(--muted)",
        lineHeight: 1.3,
    },
    hRight: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
    },

    summaryRow: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        justifyContent: "space-between",
        minWidth: 0,
    },
    summaryText: {
        minWidth: 0,
        fontSize: 10.8,
        color: "var(--muted)",
        letterSpacing: "-0.01em",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    lockPill: {
        flexShrink: 0,
        fontSize: 10.1,
        fontWeight: 780,
        color: "var(--muted)",
        padding: "4px 8px",
        borderRadius: 999,
        border: "1px solid color-mix(in oklab, var(--hairline) 92%, transparent)",
        background: "color-mix(in oklab, var(--panel) 92%, transparent)",
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
        transition:
             "transform 140ms cubic-bezier(0.23, 1, 0.32, 1), background 140ms ease, border-color 140ms ease",
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
    },
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

    sampleCard: {
        borderRadius: 14,
        border: "1px solid color-mix(in oklab, var(--hairline) 92%, transparent)",
        background:
             "linear-gradient(180deg, color-mix(in oklab, var(--panel) 96%, transparent), color-mix(in oklab, var(--bg) 94%, var(--panel)))",
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
    },
    sampleCardDisabled: {
        opacity: 0.66,
    },
    sampleMetaRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
    },
    sampleMetaLabel: {
        fontSize: 10.8,
        color: "var(--muted)",
        fontWeight: 740,
    },
    sampleMetaValue: {
        fontSize: 10.8,
        color: "var(--muted)",
        fontVariantNumeric: "tabular-nums",
    },
    sampleVerse: {
        color: "var(--fg)",
        letterSpacing: "-0.01em",
        wordBreak: "break-word",
        textWrap: "pretty",
    },

    offRow: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 9px",
        borderRadius: 11,
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
    offText: {
        fontSize: 11.2,
        color: "var(--muted)",
    },

    body: {
        background: "color-mix(in oklab, var(--bg) 86%, var(--panel))",
        borderRadius: 14,
        border: "1px solid var(--hairline)",
        padding: 9,
        display: "flex",
        flexDirection: "column",
        gap: 10,
    },

    sectionHead: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
    },
    sectionTitle: {
        fontSize: 11.7,
        fontWeight: 840,
        letterSpacing: "-0.01em",
    },
    sectionHint: {
        fontSize: 10.5,
        color: "var(--muted)",
    },

    fontNavRow: {
        display: "flex",
        alignItems: "center",
        gap: 6,
    },
    fontIndexPill: {
        flex: 1,
        height: 30,
        borderRadius: 10,
        border: "1px solid var(--hairline)",
        background: "color-mix(in oklab, var(--panel) 92%, transparent)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 760,
        color: "var(--muted)",
        fontVariantNumeric: "tabular-nums",
    },

    chevBtn: {
        width: 30,
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
        flexShrink: 0,
    },
    chevBtnDisabled: {
        cursor: "not-allowed",
        opacity: 0.55,
    },

    fontGrid: {
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 7,
        maxHeight: 204,
        overflowY: "auto",
        paddingRight: 2,
    },
    fontCard: {
        width: "100%",
        borderRadius: 12,
        border: "1px solid color-mix(in oklab, var(--hairline) 92%, transparent)",
        background: "color-mix(in oklab, var(--panel) 90%, transparent)",
        padding: "9px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 7,
        textAlign: "left",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
    },
    fontCardSelected: {
        borderColor: "color-mix(in oklab, var(--focus) 68%, var(--hairline))",
        boxShadow: "0 0 0 1px color-mix(in oklab, var(--focus) 18%, transparent) inset",
        background: "color-mix(in oklab, var(--focus) 9%, var(--panel))",
    },
    fontCardDisabled: {
        cursor: "not-allowed",
        opacity: 0.62,
    },
    fontCardTop: {
        display: "flex",
        alignItems: "center",
        gap: 8,
    },
    fontCardName: {
        minWidth: 0,
        fontSize: 11.5,
        fontWeight: 820,
        letterSpacing: "-0.01em",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    fontCardSample: {
        fontSize: 14.2,
        lineHeight: 1.25,
        color: "color-mix(in oklab, var(--fg) 94%, var(--muted) 6%)",
        letterSpacing: "-0.01em",
        textWrap: "pretty",
        overflowWrap: "anywhere",
    },

    block: {
        display: "flex",
        flexDirection: "column",
        gap: 6,
    },
    blockTop: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    blockTopRight: {
        display: "flex",
        alignItems: "center",
        gap: 6,
    },
    blockLabel: {
        fontSize: 11.6,
        fontWeight: 820,
        letterSpacing: "-0.01em",
    },
    blockValue: {
        minWidth: 52,
        textAlign: "center",
        fontSize: 11.6,
        color: "var(--focus)",
        fontVariantNumeric: "tabular-nums",
        fontWeight: 860,
    },
    miniStepBtn: {
        width: 24,
        height: 24,
        borderRadius: 8,
        border: "1px solid var(--hairline)",
        background: "color-mix(in oklab, var(--panel) 90%, transparent)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        color: "var(--muted)",
        fontSize: 15,
        fontWeight: 860,
        padding: 0,
        flexShrink: 0,
    },
    miniStepBtnDisabled: {
        cursor: "not-allowed",
        opacity: 0.55,
    },

    range: {
        width: "100%",
        accentColor: "var(--focus)",
        cursor: "pointer",
        height: 4,
        borderRadius: 999,
        background: "color-mix(in oklab, var(--hairline) 44%, transparent)",
    },
    rangeDisabled: {
        cursor: "not-allowed",
        opacity: 0.55,
    },

    keyHint: {
        fontSize: 10.5,
        color: "var(--muted)",
        fontVariantNumeric: "tabular-nums",
    },

    footer: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        paddingTop: 1,
    },
    doneBtn: {
        flex: 1,
        height: 35,
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
        height: 35,
        borderRadius: 11,
        border: "1px solid var(--hairline)",
        background: "transparent",
        color: "var(--muted)",
        fontSize: 12,
        fontWeight: 740,
        padding: "0 12px",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
    },
};