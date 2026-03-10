// cspell:words oklab
// apps/web/src/reader/ReaderSelectionToolbar.tsx
import React, {
     memo,
     useCallback,
     useEffect,
     useLayoutEffect,
     useMemo,
     useRef,
     useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import type { SelectionAnchorInput } from "@biblia/annotation";
import { Bookmark, Highlighter, NotebookPen, X } from "lucide-react";

type Props = {
     selection: SelectionAnchorInput | null;
     onHighlight: () => void;
     onBookmark: () => void;
     onNote: () => void;
     onClear?: () => void;
     className?: string;
};

type ActionTone = "gold" | "blue" | "violet";

type ActionSpec = {
     key: "highlight" | "bookmark" | "note";
     label: string;
     title: string;
     onClick: () => void;
     icon: ReactNode;
     tone: ActionTone;
};

type ActionButtonProps = {
     label: string;
     title: string;
     onClick: () => void;
     icon: ReactNode;
     tone: ActionTone;
};

type ToneStyles = {
     color: string;
     background: string;
     backgroundHover: string;
     borderColor: string;
};

type ToolbarPlacement = "above" | "below";

type ToolbarPosition = {
     left: number;
     top: number;
     placement: ToolbarPlacement;
};

type ToolbarRect = {
     width: number;
     height: number;
};

type SelectionRectLike = {
     left: number;
     top: number;
     right: number;
     bottom: number;
     width: number;
     height: number;
};

const SHOW_DELAY_MS = 90;
const HIDE_DELAY_MS = 40;
const MAX_DETAIL_CHARS = 68;
const VIEWPORT_PAD = 10;
const TOOLBAR_GAP = 10;
const MIN_TOUCH_TARGET = 30;
const MAX_TOOLBAR_WIDTH = 480;
const POSITION_EPSILON = 0.5;

const ROOT_Z_INDEX = 160;

const PANEL_BASE_STYLE: CSSProperties = {
     pointerEvents: "auto",
     position: "relative",
     display: "flex",
     alignItems: "center",
     gap: 8,
     minHeight: 42,
     padding: "6px 7px 6px 8px",
     borderRadius: 999,
     border: "1px solid color-mix(in oklab, var(--hairline) 88%, transparent)",
     background: "color-mix(in oklab, var(--panel) 95%, var(--bg))",
     boxShadow:
         "0 18px 38px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.05)",
     backdropFilter: "blur(16px) saturate(1.05)",
     WebkitBackdropFilter: "blur(16px) saturate(1.05)",
     maxWidth: `min(calc(100vw - ${VIEWPORT_PAD * 2}px), ${MAX_TOOLBAR_WIDTH}px)`,
     transformOrigin: "50% 50%",
     transition:
         "opacity 140ms ease, transform 180ms cubic-bezier(.2,.8,.2,1), box-shadow 140ms ease",
     willChange: "transform, opacity, left, top",
};

const META_STYLE: CSSProperties = {
     minWidth: 0,
     flex: "1 1 auto",
     display: "flex",
     alignItems: "center",
     gap: 8,
     paddingLeft: 2,
};

const BADGE_STYLE: CSSProperties = {
     width: 18,
     height: 18,
     borderRadius: 999,
     display: "inline-flex",
     alignItems: "center",
     justifyContent: "center",
     flex: "0 0 auto",
     background: "color-mix(in oklab, var(--fg) 5%, transparent)",
     color: "color-mix(in oklab, var(--fg) 56%, transparent)",
};

const TEXT_WRAP_STYLE: CSSProperties = {
     minWidth: 0,
     display: "flex",
     flexDirection: "column",
     gap: 1,
};

const LABEL_STYLE: CSSProperties = {
     minWidth: 0,
     fontSize: 11.5,
     fontWeight: 720,
     lineHeight: 1.12,
     letterSpacing: "-0.015em",
     color: "var(--fg)",
     overflow: "hidden",
     textOverflow: "ellipsis",
     whiteSpace: "nowrap",
};

const DETAIL_STYLE: CSSProperties = {
     minWidth: 0,
     fontSize: 10.5,
     lineHeight: 1.12,
     color: "color-mix(in oklab, var(--fg) 52%, transparent)",
     overflow: "hidden",
     textOverflow: "ellipsis",
     whiteSpace: "nowrap",
};

const ACTIONS_STYLE: CSSProperties = {
     display: "flex",
     alignItems: "center",
     gap: 5,
     flex: "0 0 auto",
};

function cleanText(value: string): string {
     return value.replace(/\s+/g, " ").trim();
}

function clampText(value: string, max = MAX_DETAIL_CHARS): string {
     const text = cleanText(value);
     if (text.length <= max) return text;
     return `${text.slice(0, max - 1).trimEnd()}…`;
}

function clamp(n: number, min: number, max: number): number {
     return Math.max(min, Math.min(max, n));
}

function nearlyEqual(a: number, b: number): boolean {
     return Math.abs(a - b) <= POSITION_EPSILON;
}

function samePosition(a: ToolbarPosition | null, b: ToolbarPosition | null): boolean {
     if (a === b) return true;
     if (!a || !b) return false;
     return a.placement === b.placement && nearlyEqual(a.left, b.left) && nearlyEqual(a.top, b.top);
}

function getSelectionLabel(selection: SelectionAnchorInput | null): string | null {
     if (!selection) return null;

     const start = cleanText(selection.start.verseKey);
     const end = cleanText(selection.end.verseKey);

     if (!start) return null;
     if (!end || start === end) return start;
     return `${start} — ${end}`;
}

function getSelectionDetail(selection: SelectionAnchorInput | null): string | null {
     if (!selection) return null;

     const text = selection.text ? clampText(selection.text) : "";
     if (text) return text;

     const translationId = selection.translationId ? cleanText(selection.translationId) : "";
     if (translationId) return translationId;

     return "Selected text";
}

function getSelectionSignature(selection: SelectionAnchorInput | null): string {
     if (!selection) return "";

     const startKey = cleanText(selection.start.verseKey);
     const endKey = cleanText(selection.end.verseKey);
     const text = cleanText(selection.text ?? "");
     const translationId = cleanText(selection.translationId ?? "");

     return `${startKey}|${endKey}|${translationId}|${text}`;
}

function hasMeaningfulSelection(selection: SelectionAnchorInput | null): boolean {
     if (!selection) return false;

     const startKey = cleanText(selection.start.verseKey);
     const endKey = cleanText(selection.end.verseKey);
     const text = cleanText(selection.text ?? "");

     if (!startKey && !endKey) return false;
     if (text.length === 0) return false;

     return true;
}

function getToneStyles(tone: ActionTone): ToneStyles {
     switch (tone) {
          case "gold":
               return {
                    color: "color-mix(in oklab, var(--fg) 82%, #8d6800)",
                    background: "color-mix(in oklab, #efcf73 10%, var(--panel))",
                    backgroundHover: "color-mix(in oklab, #efcf73 17%, var(--panel))",
                    borderColor: "color-mix(in oklab, #ddb54c 20%, transparent)",
               };
          case "blue":
               return {
                    color: "color-mix(in oklab, var(--fg) 82%, #295ed8)",
                    background: "color-mix(in oklab, #7ba9ff 10%, var(--panel))",
                    backgroundHover: "color-mix(in oklab, #7ba9ff 17%, var(--panel))",
                    borderColor: "color-mix(in oklab, #6d9fff 20%, transparent)",
               };
          case "violet":
               return {
                    color: "color-mix(in oklab, var(--fg) 82%, #6b47d8)",
                    background: "color-mix(in oklab, #b191ff 10%, var(--panel))",
                    backgroundHover: "color-mix(in oklab, #b191ff 17%, var(--panel))",
                    borderColor: "color-mix(in oklab, #a884ff 20%, transparent)",
               };
     }
}

function getCurrentSelectionRect(): DOMRect | null {
     if (typeof window === "undefined") return null;

     const domSelection = window.getSelection();
     if (!domSelection || domSelection.rangeCount === 0 || domSelection.isCollapsed) {
          return null;
     }

     const range = domSelection.getRangeAt(0);
     const rect = range.getBoundingClientRect();

     if ((rect.width > 0 || rect.height > 0) && Number.isFinite(rect.top) && Number.isFinite(rect.left)) {
          return rect;
     }

     const clientRects = range.getClientRects();
     if (clientRects.length === 0) return null;

     let left = Number.POSITIVE_INFINITY;
     let top = Number.POSITIVE_INFINITY;
     let right = Number.NEGATIVE_INFINITY;
     let bottom = Number.NEGATIVE_INFINITY;

     for (let i = 0; i < clientRects.length; i += 1) {
          const current = clientRects.item(i);
          if (!current) continue;
          if (current.width <= 0 && current.height <= 0) continue;

          left = Math.min(left, current.left);
          top = Math.min(top, current.top);
          right = Math.max(right, current.right);
          bottom = Math.max(bottom, current.bottom);
     }

     if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
          return null;
     }

     return new DOMRect(left, top, right - left, bottom - top);
}

function computeToolbarPosition(
    selectionRect: SelectionRectLike,
    toolbarRect: ToolbarRect,
    viewportWidth: number,
    viewportHeight: number,
): ToolbarPosition {
     const centeredLeft = selectionRect.left + (selectionRect.width / 2) - (toolbarRect.width / 2);

     const left = clamp(
         centeredLeft,
         VIEWPORT_PAD,
         Math.max(VIEWPORT_PAD, viewportWidth - toolbarRect.width - VIEWPORT_PAD),
     );

     const aboveTop = selectionRect.top - toolbarRect.height - TOOLBAR_GAP;
     const belowTop = selectionRect.bottom + TOOLBAR_GAP;

     const canFitAbove = aboveTop >= VIEWPORT_PAD;
     const canFitBelow = belowTop + toolbarRect.height <= viewportHeight - VIEWPORT_PAD;

     if (canFitAbove || !canFitBelow) {
          return {
               left: Math.round(left),
               top: Math.round(Math.max(VIEWPORT_PAD, aboveTop)),
               placement: "above",
          };
     }

     return {
          left: Math.round(left),
          top: Math.round(
              Math.min(
                  viewportHeight - toolbarRect.height - VIEWPORT_PAD,
                  belowTop,
              ),
          ),
          placement: "below",
     };
}

const ActionButton = memo(function ActionButton(props: ActionButtonProps) {
     const { label, title, onClick, icon, tone } = props;
     const toneStyles = getToneStyles(tone);
     const [hover, setHover] = useState(false);
     const [pressing, setPressing] = useState(false);

     return (
         <button
             type="button"
             title={title}
             aria-label={title}
             onClick={onClick}
             onMouseDown={(event) => {
                  event.preventDefault();
                  setPressing(true);
             }}
             onMouseUp={() => setPressing(false)}
             onMouseEnter={() => setHover(true)}
             onMouseLeave={() => {
                  setHover(false);
                  setPressing(false);
             }}
             onFocus={() => setHover(true)}
             onBlur={() => {
                  setHover(false);
                  setPressing(false);
             }}
             style={{
                  appearance: "none",
                  WebkitAppearance: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  minWidth: MIN_TOUCH_TARGET,
                  height: MIN_TOUCH_TARGET,
                  padding: "0 10px",
                  borderRadius: 999,
                  border: `1px solid ${toneStyles.borderColor}`,
                  background: hover ? toneStyles.backgroundHover : toneStyles.background,
                  color: toneStyles.color,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  fontSize: 10.75,
                  fontWeight: 720,
                  lineHeight: 1,
                  letterSpacing: "-0.01em",
                  transform: pressing ? "scale(0.98)" : "translateY(0)",
                  boxShadow: hover ? "inset 0 1px 0 rgba(255,255,255,0.08)" : "none",
                  transition:
                      "transform 120ms ease, background 120ms ease, border-color 120ms ease, box-shadow 120ms ease, opacity 120ms ease",
                  WebkitTapHighlightColor: "transparent",
             }}
         >
            <span
                aria-hidden="true"
                style={{
                     width: 13,
                     height: 13,
                     display: "inline-flex",
                     alignItems: "center",
                     justifyContent: "center",
                     flex: "0 0 auto",
                     opacity: 0.92,
                }}
            >
                {icon}
            </span>
              <span>{label}</span>
         </button>
     );
});

const ClearButton = memo(function ClearButton(props: { onClick: () => void }) {
     const [hover, setHover] = useState(false);
     const [pressing, setPressing] = useState(false);

     return (
         <button
             type="button"
             title="Clear selection"
             aria-label="Clear selection"
             onClick={props.onClick}
             onMouseDown={(event) => {
                  event.preventDefault();
                  setPressing(true);
             }}
             onMouseUp={() => setPressing(false)}
             onMouseEnter={() => setHover(true)}
             onMouseLeave={() => {
                  setHover(false);
                  setPressing(false);
             }}
             onFocus={() => setHover(true)}
             onBlur={() => {
                  setHover(false);
                  setPressing(false);
             }}
             style={{
                  appearance: "none",
                  WebkitAppearance: "none",
                  width: MIN_TOUCH_TARGET,
                  height: MIN_TOUCH_TARGET,
                  borderRadius: 999,
                  border: "1px solid color-mix(in oklab, var(--hairline) 90%, transparent)",
                  background: hover
                      ? "color-mix(in oklab, var(--fg) 5%, transparent)"
                      : "transparent",
                  color: "color-mix(in oklab, var(--fg) 62%, transparent)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flex: "0 0 auto",
                  transform: pressing ? "scale(0.98)" : "translateY(0)",
                  transition:
                      "background 120ms ease, transform 120ms ease, border-color 120ms ease, opacity 120ms ease",
                  WebkitTapHighlightColor: "transparent",
             }}
         >
              <X size={14} strokeWidth={2.1} />
         </button>
     );
});

export const ReaderSelectionToolbar = memo(function ReaderSelectionToolbar(props: Props) {
     const { selection, onHighlight, onBookmark, onNote, onClear, className } = props;

     const [mounted, setMounted] = useState(false);
     const [visible, setVisible] = useState(false);
     const [position, setPosition] = useState<ToolbarPosition | null>(null);

     const panelRef = useRef<HTMLDivElement | null>(null);
     const rafRef = useRef<number | null>(null);
     const showTimerRef = useRef<number | null>(null);
     const hideTimerRef = useRef<number | null>(null);
     const lastSignatureRef = useRef<string>("");

     const selectionSignature = useMemo(() => getSelectionSignature(selection), [selection]);
     const canShow = useMemo(() => hasMeaningfulSelection(selection), [selection]);
     const label = useMemo(() => getSelectionLabel(selection), [selection]);
     const detail = useMemo(() => getSelectionDetail(selection), [selection]);

     const actions = useMemo<ActionSpec[]>(
         () => [
              {
                   key: "highlight",
                   label: "Highlight",
                   title: "Create highlight",
                   onClick: onHighlight,
                   icon: <Highlighter size={13} strokeWidth={2.1} />,
                   tone: "gold",
              },
              {
                   key: "bookmark",
                   label: "Bookmark",
                   title: "Create bookmark",
                   onClick: onBookmark,
                   icon: <Bookmark size={13} strokeWidth={2.1} />,
                   tone: "blue",
              },
              {
                   key: "note",
                   label: "Note",
                   title: "Create note",
                   onClick: onNote,
                   icon: <NotebookPen size={13} strokeWidth={2.1} />,
                   tone: "violet",
              },
         ],
         [onBookmark, onHighlight, onNote],
     );

     const clearTimers = useCallback(() => {
          if (showTimerRef.current != null) {
               window.clearTimeout(showTimerRef.current);
               showTimerRef.current = null;
          }
          if (hideTimerRef.current != null) {
               window.clearTimeout(hideTimerRef.current);
               hideTimerRef.current = null;
          }
     }, []);

     const cancelRaf = useCallback(() => {
          if (rafRef.current != null) {
               cancelAnimationFrame(rafRef.current);
               rafRef.current = null;
          }
     }, []);

     const measureAndPlace = useCallback(() => {
          if (!mounted) return;
          if (!canShow) return;
          if (!panelRef.current) return;

          const selectionRect = getCurrentSelectionRect();
          if (!selectionRect) {
               setPosition((prev) => (prev !== null ? null : prev));
               return;
          }

          const toolbarBounds = panelRef.current.getBoundingClientRect();
          const toolbarRect: ToolbarRect = {
               width: Math.max(1, Math.ceil(toolbarBounds.width)),
               height: Math.max(1, Math.ceil(toolbarBounds.height)),
          };

          const next = computeToolbarPosition(
              selectionRect,
              toolbarRect,
              window.innerWidth,
              window.innerHeight,
          );

          setPosition((prev) => (samePosition(prev, next) ? prev : next));
     }, [canShow, mounted]);

     const scheduleMeasure = useCallback(() => {
          cancelRaf();
          rafRef.current = requestAnimationFrame(() => {
               rafRef.current = null;
               measureAndPlace();
          });
     }, [cancelRaf, measureAndPlace]);

     useEffect(() => {
          setMounted(typeof document !== "undefined");
     }, []);

     useEffect(() => {
          if (!mounted) return;

          clearTimers();

          if (canShow) {
               const signatureChanged = lastSignatureRef.current !== selectionSignature;
               lastSignatureRef.current = selectionSignature;

               if (signatureChanged) {
                    setVisible(false);
               }

               showTimerRef.current = window.setTimeout(() => {
                    setVisible(true);
               }, SHOW_DELAY_MS);
               return;
          }

          hideTimerRef.current = window.setTimeout(() => {
               setVisible(false);
               setPosition((prev) => (prev !== null ? null : prev));
          }, HIDE_DELAY_MS);

          return clearTimers;
     }, [mounted, canShow, selectionSignature, clearTimers]);

     useLayoutEffect(() => {
          if (!visible) return;
          scheduleMeasure();
     }, [visible, label, detail, scheduleMeasure]);

     useEffect(() => {
          if (!mounted || !visible) return;

          const onScroll = (): void => {
               scheduleMeasure();
          };

          const onResize = (): void => {
               scheduleMeasure();
          };

          const onSelectionChange = (): void => {
               scheduleMeasure();
          };

          window.addEventListener("scroll", onScroll, true);
          window.addEventListener("resize", onResize);
          document.addEventListener("selectionchange", onSelectionChange);

          const resizeObserver =
              typeof ResizeObserver !== "undefined" && panelRef.current
                  ? new ResizeObserver(() => {
                       scheduleMeasure();
                  })
                  : null;

          if (resizeObserver && panelRef.current) {
               resizeObserver.observe(panelRef.current);
          }

          return () => {
               window.removeEventListener("scroll", onScroll, true);
               window.removeEventListener("resize", onResize);
               document.removeEventListener("selectionchange", onSelectionChange);
               resizeObserver?.disconnect();
          };
     }, [mounted, visible, scheduleMeasure]);

     useEffect(() => {
          return () => {
               clearTimers();
               cancelRaf();
          };
     }, [cancelRaf, clearTimers]);

     if (!mounted) return null;
     if (!selection) return null;
     if (!visible) return null;

     const placement = position?.placement ?? "above";
     const ready = position !== null;

     return createPortal(
         <div
             className={className}
             role="toolbar"
             aria-label="Selection actions"
             style={{
                  position: "fixed",
                  left: position?.left ?? VIEWPORT_PAD,
                  top: position?.top ?? VIEWPORT_PAD,
                  zIndex: ROOT_Z_INDEX,
                  pointerEvents: "none",
                  opacity: ready ? 1 : 0,
                  transform: ready
                      ? "translate3d(0,0,0)"
                      : placement === "above"
                          ? "translate3d(0,4px,0)"
                          : "translate3d(0,-4px,0)",
                  transition: "opacity 140ms ease, transform 180ms cubic-bezier(.2,.8,.2,1)",
                  maxWidth: `min(calc(100vw - ${VIEWPORT_PAD * 2}px), ${MAX_TOOLBAR_WIDTH}px)`,
             }}
         >
              <div
                  ref={panelRef}
                  style={{
                       ...PANEL_BASE_STYLE,
                       transform: ready
                           ? "translate3d(0,0,0) scale(1)"
                           : placement === "above"
                               ? "translate3d(0,2px,0) scale(0.985)"
                               : "translate3d(0,-2px,0) scale(0.985)",
                  }}
              >
                   <div style={META_STYLE}>
                        <div aria-hidden="true" style={BADGE_STYLE}>
                             <Highlighter size={11} strokeWidth={2.1} />
                        </div>

                        <div style={TEXT_WRAP_STYLE}>
                             {label ? (
                                 <div style={LABEL_STYLE} title={label}>
                                      {label}
                                 </div>
                             ) : null}

                             {detail ? (
                                 <div style={DETAIL_STYLE} title={detail}>
                                      {detail}
                                 </div>
                             ) : null}
                        </div>
                   </div>

                   <div style={ACTIONS_STYLE}>
                        {actions.map((action) => (
                            <ActionButton
                                key={action.key}
                                label={action.label}
                                title={action.title}
                                onClick={action.onClick}
                                icon={action.icon}
                                tone={action.tone}
                            />
                        ))}

                        {onClear ? <ClearButton onClick={onClear} /> : null}
                   </div>
              </div>
         </div>,
         document.body,
     );
});

ReaderSelectionToolbar.displayName = "ReaderSelectionToolbar";