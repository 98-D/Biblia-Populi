// cspell:words oklab
// apps/web/src/reader/ReaderSelectionToolbar.tsx
import React, { memo, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
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

const STICKY_TOP = 10;
const PANEL_MAX_WIDTH = 660;

const TOOLBAR_WRAP_STYLE: CSSProperties = {
     position: "sticky",
     top: STICKY_TOP,
     zIndex: 60,
     width: "100%",
     display: "flex",
     justifyContent: "center",
     padding: "8px 12px 10px",
     pointerEvents: "none",
};

const PANEL_STYLE: CSSProperties = {
     pointerEvents: "auto",
     width: "min(100%, 660px)",
     maxWidth: PANEL_MAX_WIDTH,
     borderRadius: 16,
     border: "1px solid color-mix(in oklab, var(--hairline) 92%, transparent)",
     background:
          "color-mix(in oklab, var(--panel) 92%, var(--bg))",
     boxShadow:
          "0 10px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)",
     overflow: "hidden",
     backdropFilter: "blur(12px)",
     WebkitBackdropFilter: "blur(12px)",
};

const PANEL_INNER_STYLE: CSSProperties = {
     display: "grid",
     gridTemplateColumns: "minmax(0, 1fr) auto",
     alignItems: "center",
     gap: 10,
     padding: "8px 10px",
};

const META_STYLE: CSSProperties = {
     minWidth: 0,
     display: "flex",
     alignItems: "center",
     gap: 10,
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
     color: "color-mix(in oklab, var(--fg) 50%, transparent)",
};

const TEXT_WRAP_STYLE: CSSProperties = {
     minWidth: 0,
     display: "flex",
     flexDirection: "column",
     gap: 1,
};

const LABEL_STYLE: CSSProperties = {
     minWidth: 0,
     fontSize: 12.5,
     fontWeight: 700,
     letterSpacing: "-0.015em",
     lineHeight: 1.15,
     color: "var(--fg)",
     overflow: "hidden",
     textOverflow: "ellipsis",
     whiteSpace: "nowrap",
};

const DETAIL_STYLE: CSSProperties = {
     minWidth: 0,
     fontSize: 11.5,
     lineHeight: 1.25,
     color: "color-mix(in oklab, var(--fg) 56%, transparent)",
     overflow: "hidden",
     textOverflow: "ellipsis",
     whiteSpace: "nowrap",
};

const ACTIONS_STYLE: CSSProperties = {
     display: "flex",
     alignItems: "center",
     justifyContent: "flex-end",
     gap: 6,
     flexWrap: "nowrap",
     minWidth: 0,
};

function cleanText(value: string): string {
     return value.replace(/\s+/g, " ").trim();
}

function clampText(value: string, max = 96): string {
     const text = cleanText(value);
     if (text.length <= max) return text;
     return `${text.slice(0, max - 1).trimEnd()}…`;
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

     const text = selection.text ? clampText(selection.text, 96) : "";
     if (text) return text;

     const translationId = selection.translationId ? cleanText(selection.translationId) : "";
     if (translationId) return translationId;

     return "Text selection";
}

function getToneStyles(tone: ActionTone): ToneStyles {
     switch (tone) {
          case "gold":
               return {
                    color: "color-mix(in oklab, var(--fg) 84%, #8d6800)",
                    background: "color-mix(in oklab, #efcf73 10%, var(--panel))",
                    backgroundHover: "color-mix(in oklab, #efcf73 14%, var(--panel))",
                    borderColor: "color-mix(in oklab, #ddb54c 22%, transparent)",
               };
          case "blue":
               return {
                    color: "color-mix(in oklab, var(--fg) 84%, #295ed8)",
                    background: "color-mix(in oklab, #7ba9ff 10%, var(--panel))",
                    backgroundHover: "color-mix(in oklab, #7ba9ff 14%, var(--panel))",
                    borderColor: "color-mix(in oklab, #6d9fff 22%, transparent)",
               };
          case "violet":
               return {
                    color: "color-mix(in oklab, var(--fg) 84%, #6b47d8)",
                    background: "color-mix(in oklab, #b191ff 10%, var(--panel))",
                    backgroundHover: "color-mix(in oklab, #b191ff 14%, var(--panel))",
                    borderColor: "color-mix(in oklab, #a884ff 22%, transparent)",
               };
     }
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
               onMouseLeave={() => {
                    setHover(false);
                    setPressing(false);
               }}
               onMouseEnter={() => setHover(true)}
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
                    gap: 6,
                    height: 30,
                    padding: "0 10px",
                    borderRadius: 999,
                    border: `1px solid ${toneStyles.borderColor}`,
                    background: hover ? toneStyles.backgroundHover : toneStyles.background,
                    color: toneStyles.color,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    fontSize: 11.5,
                    fontWeight: 690,
                    lineHeight: 1,
                    letterSpacing: "-0.01em",
                    transform: pressing ? "scale(0.985)" : "translateY(0)",
                    transition:
                         "transform 120ms ease, background 120ms ease, border-color 120ms ease, opacity 120ms ease",
                    WebkitTapHighlightColor: "transparent",
               }}
          >
            <span
                 aria-hidden="true"
                 style={{
                      width: 14,
                      height: 14,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: "0 0 auto",
                      opacity: 0.9,
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
                    width: 30,
                    height: 30,
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
                    transform: pressing ? "scale(0.985)" : "translateY(0)",
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

     const label = useMemo(() => getSelectionLabel(selection), [selection]);
     const detail = useMemo(() => getSelectionDetail(selection), [selection]);

     const actions = useMemo<ActionSpec[]>(
          () => [
               {
                    key: "highlight",
                    label: "Highlight",
                    title: "Create highlight",
                    onClick: onHighlight,
                    icon: <Highlighter size={14} strokeWidth={2.1} />,
                    tone: "gold",
               },
               {
                    key: "bookmark",
                    label: "Bookmark",
                    title: "Create bookmark",
                    onClick: onBookmark,
                    icon: <Bookmark size={14} strokeWidth={2.1} />,
                    tone: "blue",
               },
               {
                    key: "note",
                    label: "Note",
                    title: "Create note",
                    onClick: onNote,
                    icon: <NotebookPen size={14} strokeWidth={2.1} />,
                    tone: "violet",
               },
          ],
          [onBookmark, onHighlight, onNote],
     );

     if (!selection) return null;

     return (
          <div
               className={className}
               role="toolbar"
               aria-label="Selection actions"
               style={TOOLBAR_WRAP_STYLE}
          >
               <div style={PANEL_STYLE}>
                    <div style={PANEL_INNER_STYLE}>
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
               </div>
          </div>
     );
});