// cspell:words oklab
import React, { memo, useMemo } from "react";
import type { CSSProperties } from "react";
import type { Annotation } from "@biblia/annotation";

type Props = {
     annotations: readonly Annotation[];
};

type AnnotationKind = Annotation["kind"];

type Tone = Readonly<{
     wash: string;
     rail: string;
     dot: string;
     ring: string;
}>;

type OverlayMeta = Readonly<{
     tone: Tone;
     hasWash: boolean;
     showRail: boolean;
     markerKinds: readonly AnnotationKind[];
     extraCount: number;
}>;

const MAX_MARKERS = 3;

const CORNER_TOP = 8;
const CORNER_RIGHT = 10;

const RAIL_INSET_Y = 8;
const RAIL_WIDTH = 2;

const DOT_SIZE = 6;
const DOT_GAP = 4;
const STACK_BADGE_H = 18;
const ROOT_RADIUS = 16;

const BADGE_BG =
    "color-mix(in oklab, var(--card, white) 94%, transparent)";
const BADGE_FG =
    "color-mix(in oklab, var(--fg, #111) 62%, transparent)";
const BADGE_BORDER =
    "1px solid color-mix(in oklab, var(--border, rgba(127,127,127,0.2)) 78%, transparent)";

function toneForKind(kind: AnnotationKind): Tone {
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
     return annotation.deletedAt == null;
}

function timestampValueOf(annotation: Annotation): number {
     const raw = annotation.updatedAt ?? annotation.createdAt ?? null;
     if (typeof raw === "number" && Number.isFinite(raw)) return raw;
     if (typeof raw === "string") {
          const ms = Date.parse(raw);
          return Number.isFinite(ms) ? ms : 0;
     }
     return 0;
}

function priorityForKind(kind: AnnotationKind): number {
     switch (kind) {
          case "BOOKMARK":
               return 0;
          case "NOTE":
               return 1;
          case "DRAWING":
               return 2;
          case "HIGHLIGHT":
          default:
               return 3;
     }
}

function compareAnnotations(
    a: { annotation: Annotation; index: number },
    b: { annotation: Annotation; index: number },
): number {
     const aKind = priorityForKind(a.annotation.kind);
     const bKind = priorityForKind(b.annotation.kind);
     if (aKind !== bKind) return aKind - bKind;

     const aTime = timestampValueOf(a.annotation);
     const bTime = timestampValueOf(b.annotation);
     if (aTime !== bTime) return bTime - aTime;

     return a.index - b.index;
}

function hasKind(
    annotations: readonly Annotation[],
    kind: AnnotationKind,
): boolean {
     return annotations.some((annotation) => annotation.kind === kind);
}

function buildMeta(live: readonly Annotation[]): OverlayMeta | null {
     if (live.length === 0) return null;

     const ordered = live
         .map((annotation, index) => ({ annotation, index }))
         .sort(compareAnnotations)
         .map((entry) => entry.annotation);

     const primary = ordered[0];
     if (!primary) return null;

     const showRail =
         hasKind(ordered, "BOOKMARK") ||
         hasKind(ordered, "NOTE") ||
         hasKind(ordered, "DRAWING");

     const railSource =
         ordered.find(
             (annotation) =>
                 annotation.kind === "BOOKMARK" ||
                 annotation.kind === "NOTE" ||
                 annotation.kind === "DRAWING",
         ) ?? primary;

     return {
          tone: toneForKind(railSource.kind),
          hasWash: hasKind(ordered, "HIGHLIGHT"),
          showRail,
          markerKinds: ordered
              .slice(0, MAX_MARKERS)
              .map((annotation) => annotation.kind),
          extraCount: Math.max(0, ordered.length - MAX_MARKERS),
     };
}

const sx = {
     root: Object.freeze<CSSProperties>({
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          borderRadius: ROOT_RADIUS,
          overflow: "hidden",
          zIndex: 0,
     }),

     wash: Object.freeze<CSSProperties>({
          position: "absolute",
          inset: 0,
          borderRadius: ROOT_RADIUS,
     }),

     rail: Object.freeze<CSSProperties>({
          position: "absolute",
          left: 0,
          top: RAIL_INSET_Y,
          bottom: RAIL_INSET_Y,
          width: RAIL_WIDTH,
          borderRadius: 999,
     }),

     markerRow: Object.freeze<CSSProperties>({
          position: "absolute",
          top: CORNER_TOP,
          right: CORNER_RIGHT,
          display: "inline-flex",
          alignItems: "center",
          gap: DOT_GAP,
          maxWidth: "calc(100% - 20px)",
          minWidth: 0,
     }),

     dot: Object.freeze<CSSProperties>({
          width: DOT_SIZE,
          height: DOT_SIZE,
          minWidth: DOT_SIZE,
          minHeight: DOT_SIZE,
          borderRadius: 999,
          flex: "0 0 auto",
     }),

     countBadge: Object.freeze<CSSProperties>({
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
          whiteSpace: "nowrap",
          flex: "0 0 auto",
          background: BADGE_BG,
          color: BADGE_FG,
          border: BADGE_BORDER,
          boxSizing: "border-box",
     }),
} as const;

const MarkerDot = memo(function MarkerDot(props: { kind: AnnotationKind }) {
     const tone = toneForKind(props.kind);

     return (
         <span
             aria-hidden="true"
             style={{
                  ...sx.dot,
                  background: tone.dot,
                  boxShadow: `0 0 0 1px ${tone.ring}`,
             }}
         />
     );
});

export const ReaderAnnotationOverlay = memo(function ReaderAnnotationOverlay(
    props: Props,
) {
     const { annotations } = props;

     const meta = useMemo(() => {
          const live = annotations.filter(isLiveAnnotation);
          return buildMeta(live);
     }, [annotations]);

     if (!meta) return null;

     return (
         <div aria-hidden="true" style={sx.root}>
              {meta.hasWash ? (
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
                   {meta.markerKinds.map((kind, index) => (
                       <MarkerDot key={`${kind}-${index}`} kind={kind} />
                   ))}

                   {meta.extraCount > 0 ? (
                       <span style={sx.countBadge}>+{meta.extraCount}</span>
                   ) : null}
              </div>
         </div>
     );
});