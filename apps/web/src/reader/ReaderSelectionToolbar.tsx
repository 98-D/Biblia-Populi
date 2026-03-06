import React, { memo, useMemo, useState } from "react";
import type { SelectionAnchorInput } from "@biblia/annotation";
import {
    Bookmark,
    Highlighter,
    NotebookPen,
    Sparkles,
    X,
} from "lucide-react";

type Props = {
    selection: SelectionAnchorInput | null;
    onHighlight: () => void;
    onBookmark: () => void;
    onNote: () => void;
    onClear?: () => void;
    className?: string;
};

type ActionTone = "gold" | "blue" | "violet";

type ActionButtonProps = {
    label: string;
    title: string;
    onClick: () => void;
    icon: React.ReactNode;
    tone: ActionTone;
};

function cleanText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function clampText(value: string, max = 132): string {
    const text = cleanText(value);
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1).trimEnd()}…`;
}

function getSelectionLabel(selection: SelectionAnchorInput | null): string | null {
    if (!selection) return null;

    const start = cleanText(selection.start.verseKey);
    const end = cleanText(selection.end.verseKey);

    if (!start) return null;
    if (start === end) return start;
    return `${start} — ${end}`;
}

function getSelectionDetail(selection: SelectionAnchorInput | null): string | null {
    if (!selection) return null;

    const text = selection.text ? cleanText(selection.text) : "";
    if (text.length > 0) return clampText(text);

    const translationId = selection.translationId ? cleanText(selection.translationId) : "";
    if (translationId.length > 0) return `Selection in ${translationId}`;

    return "Text selection";
}

function getPanelBorder(): string {
    return "1px solid color-mix(in oklab, var(--reader-border, var(--border, rgba(127,127,127,0.24))) 86%, transparent)";
}

function getPanelBackground(): string {
    return `
        linear-gradient(
            180deg,
            color-mix(in oklab, var(--reader-card, var(--card, rgba(255,255,255,0.96))) 96%, white) 0%,
            color-mix(in oklab, var(--reader-card, var(--card, rgba(255,255,255,0.96))) 100%, transparent) 100%
        )
    `;
}

function getPanelShadow(): string {
    return "0 14px 34px rgba(0,0,0,0.10), 0 2px 10px rgba(0,0,0,0.05)";
}

function getToneStyles(tone: ActionTone): {
    color: string;
    background: string;
    border: string;
    shadow: string;
    hoverBackground: string;
} {
    switch (tone) {
        case "gold":
            return {
                color: "color-mix(in oklab, var(--text, #111) 76%, #8a6400)",
                background: "color-mix(in oklab, #efcf73 16%, var(--card, white))",
                border: "1px solid color-mix(in oklab, #ddb54c 40%, transparent)",
                shadow: "0 6px 16px color-mix(in oklab, #ddb54c 12%, transparent)",
                hoverBackground: "color-mix(in oklab, #efcf73 22%, var(--card, white))",
            };
        case "blue":
            return {
                color: "color-mix(in oklab, var(--text, #111) 76%, #295ed8)",
                background: "color-mix(in oklab, #7ba9ff 14%, var(--card, white))",
                border: "1px solid color-mix(in oklab, #6d9fff 38%, transparent)",
                shadow: "0 6px 16px color-mix(in oklab, #6d9fff 11%, transparent)",
                hoverBackground: "color-mix(in oklab, #7ba9ff 20%, var(--card, white))",
            };
        case "violet":
            return {
                color: "color-mix(in oklab, var(--text, #111) 76%, #6b47d8)",
                background: "color-mix(in oklab, #b191ff 14%, var(--card, white))",
                border: "1px solid color-mix(in oklab, #a884ff 38%, transparent)",
                shadow: "0 6px 16px color-mix(in oklab, #a884ff 11%, transparent)",
                hoverBackground: "color-mix(in oklab, #b191ff 20%, var(--card, white))",
            };
    }
}

const ActionButton = memo(function ActionButton(props: ActionButtonProps) {
    const { label, title, onClick, icon, tone } = props;
    const toneStyles = getToneStyles(tone);
    const [hovered, setHovered] = useState(false);

    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            onClick={onClick}
            onMouseDown={(event) => {
                event.preventDefault();
            }}
            onMouseEnter={() => {
                setHovered(true);
            }}
            onMouseLeave={() => {
                setHovered(false);
            }}
            style={{
                appearance: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                height: 38,
                padding: "0 14px",
                borderRadius: 999,
                border: toneStyles.border,
                background: hovered ? toneStyles.hoverBackground : toneStyles.background,
                color: toneStyles.color,
                boxShadow: toneStyles.shadow,
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontSize: 13,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: "-0.01em",
                transform: hovered ? "translateY(-1px)" : "translateY(0)",
                transition:
                    "transform 120ms ease, background 120ms ease, border-color 120ms ease, box-shadow 120ms ease, color 120ms ease",
                WebkitTapHighlightColor: "transparent",
            }}
        >
            <span
                aria-hidden="true"
                style={{
                    width: 16,
                    height: 16,
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
    const [hovered, setHovered] = useState(false);

    return (
        <button
            type="button"
            title="Clear selection"
            aria-label="Clear selection"
            onClick={props.onClick}
            onMouseDown={(event) => {
                event.preventDefault();
            }}
            onMouseEnter={() => {
                setHovered(true);
            }}
            onMouseLeave={() => {
                setHovered(false);
            }}
            style={{
                appearance: "none",
                width: 38,
                height: 38,
                borderRadius: 999,
                border: "1px solid color-mix(in oklab, var(--border, rgba(127,127,127,0.24)) 86%, transparent)",
                background: hovered
                    ? "color-mix(in oklab, var(--text, #111) 5%, transparent)"
                    : "transparent",
                color: "color-mix(in oklab, var(--text, #111) 70%, transparent)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flex: "0 0 auto",
                transform: hovered ? "translateY(-1px)" : "translateY(0)",
                transition: "background 120ms ease, transform 120ms ease, border-color 120ms ease",
                WebkitTapHighlightColor: "transparent",
            }}
        >
            <X size={17} strokeWidth={2.1} />
        </button>
    );
});

export const ReaderSelectionToolbar = memo(function ReaderSelectionToolbar(props: Props) {
    const { selection, onHighlight, onBookmark, onNote, onClear, className } = props;

    const label = useMemo(() => getSelectionLabel(selection), [selection]);
    const detail = useMemo(() => getSelectionDetail(selection), [selection]);

    if (!selection) return null;

    return (
        <div
            className={className}
            role="toolbar"
            aria-label="Selection actions"
            style={{
                position: "sticky",
                top: 8,
                zIndex: 60,
                width: "100%",
                display: "flex",
                justifyContent: "center",
                padding: "8px 12px 14px",
                pointerEvents: "none",
            }}
        >
            <div
                style={{
                    pointerEvents: "auto",
                    width: "min(940px, 100%)",
                    borderRadius: 22,
                    border: getPanelBorder(),
                    background: getPanelBackground(),
                    boxShadow: getPanelShadow(),
                    overflow: "hidden",
                }}
            >
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) auto",
                        gap: 12,
                        alignItems: "center",
                        padding: "12px 14px",
                    }}
                >
                    <div
                        style={{
                            minWidth: 0,
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                minWidth: 0,
                                flexWrap: "wrap",
                            }}
                        >
                            <div
                                aria-hidden="true"
                                style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: 999,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: "color-mix(in oklab, var(--text, #111) 6%, transparent)",
                                    color: "color-mix(in oklab, var(--text, #111) 76%, transparent)",
                                    flex: "0 0 auto",
                                }}
                            >
                                <Sparkles size={13} strokeWidth={2.2} />
                            </div>

                            {label ? (
                                <div
                                    style={{
                                        minWidth: 0,
                                        fontSize: 14,
                                        fontWeight: 800,
                                        letterSpacing: "-0.02em",
                                        color: "var(--text, inherit)",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                    title={label}
                                >
                                    {label}
                                </div>
                            ) : null}
                        </div>

                        {detail ? (
                            <div
                                style={{
                                    minWidth: 0,
                                    fontSize: 13,
                                    lineHeight: 1.35,
                                    color: "color-mix(in oklab, var(--text, #111) 66%, transparent)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                                title={detail}
                            >
                                {detail}
                            </div>
                        ) : null}
                    </div>

                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            gap: 8,
                            flexWrap: "wrap",
                        }}
                    >
                        <ActionButton
                            label="Highlight"
                            title="Create highlight"
                            onClick={onHighlight}
                            icon={<Highlighter size={16} strokeWidth={2.1} />}
                            tone="gold"
                        />

                        <ActionButton
                            label="Bookmark"
                            title="Create bookmark"
                            onClick={onBookmark}
                            icon={<Bookmark size={16} strokeWidth={2.1} />}
                            tone="blue"
                        />

                        <ActionButton
                            label="Note"
                            title="Create note"
                            onClick={onNote}
                            icon={<NotebookPen size={16} strokeWidth={2.1} />}
                            tone="violet"
                        />

                        {onClear ? <ClearButton onClick={onClear} /> : null}
                    </div>
                </div>
            </div>
        </div>
    );
});