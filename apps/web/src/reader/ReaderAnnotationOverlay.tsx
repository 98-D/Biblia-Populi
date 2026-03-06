import React, { memo, useMemo } from "react";
import type { Annotation } from "@biblia/annotation";

type Props = {
    annotations: readonly Annotation[];
};

function toneForKind(kind: Annotation["kind"]): {
    tint: string;
    rail: string;
    dot: string;
} {
    switch (kind) {
        case "BOOKMARK":
            return {
                tint: "color-mix(in oklab, #7ba9ff 10%, transparent)",
                rail: "color-mix(in oklab, #5f92ff 70%, transparent)",
                dot: "color-mix(in oklab, #5f92ff 82%, transparent)",
            };
        case "NOTE":
            return {
                tint: "color-mix(in oklab, #b191ff 10%, transparent)",
                rail: "color-mix(in oklab, #9c75ff 70%, transparent)",
                dot: "color-mix(in oklab, #9c75ff 82%, transparent)",
            };
        case "DRAWING":
            return {
                tint: "color-mix(in oklab, #7de0d0 10%, transparent)",
                rail: "color-mix(in oklab, #42cdb7 70%, transparent)",
                dot: "color-mix(in oklab, #42cdb7 82%, transparent)",
            };
        default:
            return {
                tint: "color-mix(in oklab, #efcf73 12%, transparent)",
                rail: "color-mix(in oklab, #ddb54c 68%, transparent)",
                dot: "color-mix(in oklab, #ddb54c 82%, transparent)",
            };
    }
}

export const ReaderAnnotationOverlay = memo(function ReaderAnnotationOverlay(props: Props) {
    const { annotations } = props;

    const live = useMemo(
        () => annotations.filter((annotation) => annotation.deletedAt === null),
        [annotations],
    );

    const primary = live[0] ?? null;
    const hasHighlight = live.some((annotation) => annotation.kind === "HIGHLIGHT");
    const hasBookmark = live.some((annotation) => annotation.kind === "BOOKMARK");
    const hasNote = live.some((annotation) => annotation.kind === "NOTE");
    const markerKinds = live.slice(0, 3).map((annotation) => annotation.kind);

    if (!primary) return null;

    const tone = toneForKind(primary.kind);

    return (
        <div
            aria-hidden="true"
            style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                borderRadius: 16,
                overflow: "hidden",
                zIndex: 0,
            }}
        >
            {hasHighlight ? (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        background: tone.tint,
                        borderRadius: 16,
                    }}
                />
            ) : null}

            {(hasBookmark || hasNote || primary.kind === "DRAWING") ? (
                <div
                    style={{
                        position: "absolute",
                        left: 0,
                        top: 8,
                        bottom: 8,
                        width: 3,
                        borderRadius: 999,
                        background: tone.rail,
                    }}
                />
            ) : null}

            <div
                style={{
                    position: "absolute",
                    top: 8,
                    right: 10,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                }}
            >
                {markerKinds.map((kind, index) => {
                    const markerTone = toneForKind(kind);
                    return (
                        <span
                            key={`${kind}-${index}`}
                            style={{
                                width: 7,
                                height: 7,
                                borderRadius: 999,
                                background: markerTone.dot,
                                boxShadow: "0 0 0 1px color-mix(in oklab, white 58%, transparent)",
                            }}
                        />
                    );
                })}

                {live.length > 3 ? (
                    <span
                        style={{
                            minWidth: 18,
                            height: 18,
                            paddingInline: 5,
                            borderRadius: 999,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "color-mix(in oklab, var(--card, white) 92%, transparent)",
                            color: "color-mix(in oklab, var(--text, #111) 70%, transparent)",
                            fontSize: 10,
                            fontWeight: 700,
                            lineHeight: 1,
                            border: "1px solid color-mix(in oklab, var(--border, rgba(127,127,127,0.2)) 84%, transparent)",
                        }}
                    >
                        +{live.length - 3}
                    </span>
                ) : null}
            </div>
        </div>
    );
});