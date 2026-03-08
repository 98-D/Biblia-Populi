// cspell:words oklab
import React, { memo, useMemo } from "react";
import type { CSSProperties } from "react";
import type { Annotation } from "@biblia/annotation";

type Props = {
     annotations: readonly Annotation[];
};

type Tone = Readonly<{
     wash: string;
     rail: string;
     dot: string;
     ring: string;
}>;

const MAX_MARKERS = 3;
const CORNER_TOP = 8;
const CORNER_RIGHT = 10;
const RAIL_INSET_Y = 8;
const RAIL_WIDTH = 2;
const DOT_SIZE = 6;
const STACK_BADGE_H = 18;

function toneForKind(kind: Annotation["kind"]): Tone {
     switch (kind) {
          case "BOOKMARK":
               return {
                    wash: "color-mix(in oklab, #7ba9ff 8%, transparent)",
                    rail: "color-mix(in oklab, #5f92ff 58%, transparent)",
                    dot: "color-mix(in oklab, #5f92ff 74%, transparent)",
                    ring: "color-mix(in oklab, white 60%, transparent)",
               };
          case "NOTE":
               return {
                    wash: "color-mix(in oklab, #b191ff 8%, transparent)",
                    rail: "color-mix(in oklab, #9c75ff 58%, transparent)",
                    dot: "color-mix(in oklab, #9c75ff 74%, transparent)",
                    ring: "color-mix(in oklab, white 60%, transparent)",
               };
          case "DRAWING":
               return {
                    wash: "color-mix(in oklab, #7de0d0 8%, transparent)",
                    rail: "color-mix(in oklab, #42cdb7 58%, transparent)",
                    dot: "color-mix(in oklab, #42cdb7 74%, transparent)",
                    ring: "color-mix(in oklab, white 60%, transparent)",
               };
          case "HIGHLIGHT":
          default:
               return {
                    wash: "color-mix(in oklab, #efcf73 10%, transparent)",
                    rail: "color-mix(in oklab, #ddb54c 56%, transparent)",
                    dot: "color-mix(in oklab, #ddb54c 74%, transparent)",
                    ring: "color-mix(in oklab, white 60%, transparent)",
               };
     }
}

function isLiveAnnotation(annotation: Annotation): boolean {
     return annotation.deletedAt === null;
}

function hasKind(list: readonly Annotation[], kind: Annotation["kind"]): boolean {
     return list.some((annotation) => annotation.kind === kind);
}

const sx: Record<string, CSSProperties> = {
     root: {
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          borderRadius: 16,
          overflow: "hidden",
          zIndex: 0,
     },

     wash: {
          position: "absolute",
          inset: 0,
          borderRadius: 16,
     },

     rail: {
          position: "absolute",
          left: 0,
          top: RAIL_INSET_Y,
          bottom: RAIL_INSET_Y,
          width: RAIL_WIDTH,
          borderRadius: 999,
     },

     markerRow: {
          position: "absolute",
          top: CORNER_TOP,
          right: CORNER_RIGHT,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
     },

     dot: {
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: 999,
          flex: "0 0 auto",
     },

     countBadge: {
          minWidth: 18,
          height: STACK_BADGE_H,
          paddingInline: 5,
          borderRadius: 999,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: "-0.01em",
          userSelect: "none",
     },
};

export const ReaderAnnotationOverlay = memo(function ReaderAnnotationOverlay(props: Props) {
     const { annotations } = props;

     const live = useMemo(
          () => annotations.filter(isLiveAnnotation),
          [annotations],
     );

     const primary = live[0] ?? null;

     const markerKinds = useMemo(
          () => live.slice(0, MAX_MARKERS).map((annotation) => annotation.kind),
          [live],
     );

     const meta = useMemo(() => {
          if (!primary) {
               return {
                    tone: null as Tone | null,
                    hasHighlight: false,
                    showRail: false,
                    extraCount: 0,
               };
          }

          const tone = toneForKind(primary.kind);
          const hasHighlight = hasKind(live, "HIGHLIGHT");
          const showRail =
               hasKind(live, "BOOKMARK") ||
               hasKind(live, "NOTE") ||
               hasKind(live, "DRAWING");

          return {
               tone,
               hasHighlight,
               showRail,
               extraCount: Math.max(0, live.length - MAX_MARKERS),
          };
     }, [live, primary]);

     if (!primary || !meta.tone) return null;

     return (
          <div aria-hidden="true" style={sx.root}>
               {meta.hasHighlight ? (
                    <div
                         style={{
                              ...sx.wash,
                              background: meta.tone.wash,
                         }}
                    />
               ) : null}

               {meta.showRail ? (
                    <div
                         style={{
                              ...sx.rail,
                              background: meta.tone.rail,
                         }}
                    />
               ) : null}

               <div style={sx.markerRow}>
                    {markerKinds.map((kind, index) => {
                         const markerTone = toneForKind(kind);

                         return (
                              <span
                                   key={`${kind}-${index}`}
                                   style={{
                                        ...sx.dot,
                                        background: markerTone.dot,
                                        boxShadow: `0 0 0 1px ${markerTone.ring}`,
                                   }}
                              />
                         );
                    })}

                    {meta.extraCount > 0 ? (
                         <span
                              style={{
                                   ...sx.countBadge,
                                   background: "color-mix(in oklab, var(--card, white) 94%, transparent)",
                                   color: "color-mix(in oklab, var(--text, #111) 62%, transparent)",
                                   border: "1px solid color-mix(in oklab, var(--border, rgba(127,127,127,0.2)) 78%, transparent)",
                              }}
                         >
                        +{meta.extraCount}
                    </span>
                    ) : null}
               </div>
          </div>
     );
});