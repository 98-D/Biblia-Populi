// apps/web/src/reader/ReaderSelectionToolbar.tsx
import React, { memo, useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { SelectionAnchorInput } from "@biblia/annotation";
import { Bookmark, Highlighter, NotebookPen, Sparkles, X } from "lucide-react";

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
     shadow: string;
};

const STICKY_TOP = 8;
const PANEL_MAX_WIDTH = 720;

const TOOLBAR_WRAP_STYLE: CSSProperties = {
     position: "sticky",
     top: STICKY_TOP,
     zIndex: 60,
     width: "100%",
     display: "flex",
     justifyContent: "center",
     padding: "8px 12px 12px",
     pointerEvents: "none",
};

const PANEL_STYLE: CSSProperties = {
     pointerEvents: "auto",
     width: "min(100%, 720px)",
     maxWidth: PANEL_MAX_WIDTH,
     borderRadius: 18,
     border: "1px solid color-mix(in oklab, var(--hairline) 90%, transparent)",
     background:
          "linear-gradient(180deg, color-mix(in oklab, var(--panel) 94%, var(--bg)) 0%, color-mix(in oklab, var(--panel) 98%, var(--bg)) 100%)",
     boxShadow: "0 12px 30px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.05)",
     overflow: "hidden",
     backdropFilter: "blur(14px)",
     WebkitBackdropFilter: "blur(14px)",
};

const PANEL_INNER_STYLE: CSSProperties = {
     display: "grid",
     gridTemplateColumns: "minmax(0, 1fr) auto",
     alignItems: "center",
     gap: 12,
     padding: "10px 12px",
};

const META_STYLE: CSSProperties = {
     minWidth: 0,
     display: "flex",
     alignItems: "center",
     gap: 10,
};

const BADGE_STYLE: CSSProperties = {
     width: 22,
     height: 22,
     borderRadius: 999,
     display: "inline-flex",
     alignItems: "center",
     justifyContent: "center",
     flex: "0 0 auto",
     background: "color-mix(in oklab, var(--fg) 6%, transparent)",
     color: "color-mix(in oklab, var(--fg) 74%, transparent)",
};

const TEXT_WRAP_STYLE: CSSProperties = {
     minWidth: 0,
     display: "flex",
     flexDirection: "column",
     gap: 2,
};

const LABEL_STYLE: CSSProperties = {
     minWidth: 0,
     fontSize: 13,
     fontWeight: 760,
     letterSpacing: "-0.02em",
     lineHeight: 1.15,
     color: "var(--fg)",
     overflow: "hidden",
     textOverflow: "ellipsis",
     whiteSpace: "nowrap",
};

const DETAIL_STYLE: CSSProperties = {
     minWidth: 0,
     fontSize: 12,
     lineHeight: 1.25,
     color: "color-mix(in oklab, var(--fg) 62%, transparent)",
     overflow: "hidden",
     textOverflow: "ellipsis",
     whiteSpace: "nowrap",
};

const ACTIONS_STYLE: CSSProperties = {
     display: "flex",
     alignItems: "center",
     justifyContent: "flex-end",
     gap: 8,
     flexWrap: "nowrap",
     minWidth: 0,
};

function cleanText(value: string): string {
     return value.replace(/\s+/g, " ").trim();
}

function clampText(value: string, max = 88): string {
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

     const text = selection.text ? clampText(selection.text, 88) : "";
     if (text) return text;

     const translationId = selection.translationId ? cleanText(selection.translationId) : "";
     if (translationId) return translationId;

     return "Text selection";
}

function getToneStyles(tone: ActionTone): ToneStyles {
     switch (tone) {
          case "gold":
               return {
                    color: "color-mix(in oklab, var(--fg) 78%, #8d6800)",
                    background: "color-mix(in oklab, #efcf73 14%, var(--panel))",
                    backgroundHover: "color-mix(in oklab, #efcf73 20%, var(--panel))",
                    borderColor: "color-mix(in oklab, #ddb54c 34%, transparent)",
                    shadow: "0 4px 12px color-mix(in oklab, #ddb54c 10%, transparent)",
               };
          case "blue":
               return {
                    color: "color-mix(in oklab, var(--fg) 78%, #295ed8)",
                    background: "color-mix(in oklab, #7ba9ff 13%, var(--panel))",
                    backgroundHover: "color-mix(in oklab, #7ba9ff 18%, var(--panel))",
                    borderColor: "color-mix(in oklab, #6d9fff 34%, transparent)",
                    shadow: "0 4px 12px color-mix(in oklab, #6d9fff 10%, transparent)",
               };
          case "violet":
               return {
                    color: "color-mix(in oklab, var(--fg) 78%, #6b47d8)",
                    background: "color-mix(in oklab, #b191ff 13%, var(--panel))",
                    backgroundHover: "color-mix(in oklab, #b191ff 18%, var(--panel))",
                    borderColor: "color-mix(in oklab, #a884ff 34%, transparent)",
                    shadow: "0 4px 12px color-mix(in oklab, #a884ff 10%, transparent)",
               };
     }
}

const ActionButton = memo(function ActionButton(props: ActionButtonProps) {
     const { label, title, onClick, icon, tone } = props;
     const toneStyles = getToneStyles(tone);

     return (
          <button
               type="button"
               title={title}
               aria-label={title}
               onClick={onClick}
               onMouseDown={(event) => {
                    event.preventDefault();
               }}
               style={{
                    appearance: "none",
                    WebkitAppearance: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    height: 34,
                    padding: "0 11px",
                    borderRadius: 999,
                    border: `1px solid ${toneStyles.borderColor}`,
                    background: toneStyles.background,
                    color: toneStyles.color,
                    boxShadow: toneStyles.shadow,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    fontSize: 12,
                    fontWeight: 720,
                    lineHeight: 1,
                    letterSpacing: "-0.01em",
                    transition:
                         "transform 120ms ease, background 120ms ease, border-color 120ms ease, box-shadow 120ms ease, opacity 120ms ease",
                    WebkitTapHighlightColor: "transparent",
               }}
               onMouseEnter={(event) => {
                    event.currentTarget.style.background = toneStyles.backgroundHover;
                    event.currentTarget.style.transform = "translateY(-1px)";
               }}
               onMouseLeave={(event) => {
                    event.currentTarget.style.background = toneStyles.background;
                    event.currentTarget.style.transform = "translateY(0)";
               }}
               onMouseUp={(event) => {
                    event.currentTarget.style.transform = "translateY(0)";
               }}
          >
            <span
                 aria-hidden="true"
                 style={{
                      width: 15,
                      height: 15,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: "0 0 auto",
                 }}
            >
                {icon}
            </span>
               <span>{label}</span>
          </button>
     );
});

const ClearButton = memo(function ClearButton(props: { onClick: () => void }) {
     return (
          <button
               type="button"
               title="Clear selection"
               aria-label="Clear selection"
               onClick={props.onClick}
               onMouseDown={(event) => {
                    event.preventDefault();
               }}
               style={{
                    appearance: "none",
                    WebkitAppearance: "none",
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    border: "1px solid color-mix(in oklab, var(--hairline) 88%, transparent)",
                    background: "transparent",
                    color: "color-mix(in oklab, var(--fg) 70%, transparent)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    flex: "0 0 auto",
                    transition: "background 120ms ease, transform 120ms ease, border-color 120ms ease",
                    WebkitTapHighlightColor: "transparent",
               }}
               onMouseEnter={(event) => {
                    event.currentTarget.style.background =
                         "color-mix(in oklab, var(--fg) 5%, transparent)";
                    event.currentTarget.style.transform = "translateY(-1px)";
               }}
               onMouseLeave={(event) => {
                    event.currentTarget.style.background = "transparent";
                    event.currentTarget.style.transform = "translateY(0)";
               }}
               onMouseUp={(event) => {
                    event.currentTarget.style.transform = "translateY(0)";
               }}
          >
               <X size={15} strokeWidth={2.1} />
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
                    icon: <Highlighter size={15} strokeWidth={2.1} />,
                    tone: "gold",
               },
               {
                    key: "bookmark",
                    label: "Bookmark",
                    title: "Create bookmark",
                    onClick: onBookmark,
                    icon: <Bookmark size={15} strokeWidth={2.1} />,
                    tone: "blue",
               },
               {
                    key: "note",
                    label: "Note",
                    title: "Create note",
                    onClick: onNote,
                    icon: <NotebookPen size={15} strokeWidth={2.1} />,
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
                                   <Sparkles size={12} strokeWidth={2.2} />
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