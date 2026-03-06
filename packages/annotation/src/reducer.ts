import {
    patchNoteAnnotation,
    replaceAnnotationSpans,
    restoreAnnotation,
    softDeleteAnnotation,
    upsertAnnotationSpan,
    upsertAnnotationStroke,
    removeAnnotationSpan,
    removeAnnotationStroke,
} from "./model/annotation";
import type { Annotation } from "./model/annotation";
import { patchInkStroke } from "./model/stroke";
import type { AnnotationEvent } from "./events";
import { ANNOTATION_EVENT_TYPE, assertAnnotationEvent } from "./events";
import type { AnnotationId } from "./model/ids";

export interface AnnotationSnapshot {
    annotations: ReadonlyMap<AnnotationId, Annotation>;
    labels: ReadonlyMap<string, readonly AnnotationId[]>;
    collections: ReadonlyMap<string, readonly AnnotationId[]>;
}

function cloneAnnotations(source: ReadonlyMap<AnnotationId, Annotation>): Map<AnnotationId, Annotation> {
    return new Map(source);
}

function rebuildIndexes(annotations: ReadonlyMap<AnnotationId, Annotation>): Pick<AnnotationSnapshot, "labels" | "collections"> {
    const labels = new Map<string, Set<AnnotationId>>();
    const collections = new Map<string, Set<AnnotationId>>();

    for (const [annotationId, annotation] of annotations) {
        if (annotation.deletedAt !== null) continue;

        for (const label of annotation.labels) {
            const bucket = labels.get(label) ?? new Set<AnnotationId>();
            bucket.add(annotationId);
            labels.set(label, bucket);
        }

        for (const collectionId of annotation.collectionIds) {
            const bucket = collections.get(collectionId) ?? new Set<AnnotationId>();
            bucket.add(annotationId);
            collections.set(collectionId, bucket);
        }
    }

    const materialize = (source: Map<string, Set<AnnotationId>>): ReadonlyMap<string, readonly AnnotationId[]> => {
        const next = new Map<string, readonly AnnotationId[]>();
        for (const [key, ids] of source) {
            next.set(key, [...ids].sort((a, b) => a.localeCompare(b)));
        }
        return next;
    };

    return {
        labels: materialize(labels),
        collections: materialize(collections),
    };
}

function requireAnnotation(annotations: ReadonlyMap<AnnotationId, Annotation>, annotationId: AnnotationId): Annotation {
    const annotation = annotations.get(annotationId);
    if (!annotation) {
        throw new Error(`[reducer] annotation not found: ${annotationId}`);
    }
    return annotation;
}

export function emptyAnnotationSnapshot(): AnnotationSnapshot {
    return {
        annotations: new Map(),
        labels: new Map(),
        collections: new Map(),
    };
}

export function reduceAnnotationEvent(snapshot: AnnotationSnapshot, event: AnnotationEvent): AnnotationSnapshot {
    assertAnnotationEvent(event);

    const annotations = cloneAnnotations(snapshot.annotations);
    const mutationMeta = {
        updatedAt: event.createdAt,
        updatedByUserId: event.userId,
        deviceId: event.deviceId,
    };

    switch (event.type) {
        case ANNOTATION_EVENT_TYPE.ANNOTATION_CREATED: {
            if (annotations.has(event.annotationId)) {
                throw new Error(`[reducer] duplicate annotation create: ${event.annotationId}`);
            }
            annotations.set(event.annotationId, event.payload.annotation);
            break;
        }
        case ANNOTATION_EVENT_TYPE.ANNOTATION_PATCHED: {
            const annotation = requireAnnotation(annotations, event.annotationId);
            annotations.set(event.annotationId, patchNoteAnnotation(annotation, event.payload.patch, mutationMeta));
            break;
        }
        case ANNOTATION_EVENT_TYPE.ANNOTATION_SOFT_DELETED: {
            const annotation = requireAnnotation(annotations, event.annotationId);
            annotations.set(event.annotationId, softDeleteAnnotation(annotation, mutationMeta, event.payload.deletedAt ?? event.createdAt));
            break;
        }
        case ANNOTATION_EVENT_TYPE.ANNOTATION_RESTORED: {
            const annotation = requireAnnotation(annotations, event.annotationId);
            annotations.set(event.annotationId, restoreAnnotation(annotation, { ...mutationMeta, updatedAt: event.payload.restoredAt ?? event.createdAt }));
            break;
        }
        case ANNOTATION_EVENT_TYPE.SPANS_REPLACED: {
            const annotation = requireAnnotation(annotations, event.annotationId);
            annotations.set(event.annotationId, replaceAnnotationSpans(annotation, event.payload.spans, mutationMeta));
            break;
        }
        case ANNOTATION_EVENT_TYPE.SPAN_UPSERTED: {
            const annotation = requireAnnotation(annotations, event.annotationId);
            annotations.set(event.annotationId, upsertAnnotationSpan(annotation, event.payload.span, mutationMeta));
            break;
        }
        case ANNOTATION_EVENT_TYPE.SPAN_REMOVED: {
            const annotation = requireAnnotation(annotations, event.annotationId);
            annotations.set(event.annotationId, removeAnnotationSpan(annotation, event.payload.spanId, mutationMeta));
            break;
        }
        case ANNOTATION_EVENT_TYPE.STROKE_CREATED: {
            const annotation = requireAnnotation(annotations, event.annotationId);
            annotations.set(event.annotationId, upsertAnnotationStroke(annotation, event.payload.stroke, mutationMeta));
            break;
        }
        case ANNOTATION_EVENT_TYPE.STROKE_PATCHED: {
            const annotation = requireAnnotation(annotations, event.annotationId);
            const currentStroke = annotation.strokes.find((stroke) => stroke.strokeId === event.payload.strokeId);
            if (!currentStroke) {
                throw new Error(`[reducer] stroke not found: ${event.payload.strokeId}`);
            }
            const patched = patchInkStroke(currentStroke, event.payload.patch);
            annotations.set(event.annotationId, upsertAnnotationStroke(annotation, patched, mutationMeta));
            break;
        }
        case ANNOTATION_EVENT_TYPE.STROKE_REMOVED: {
            const annotation = requireAnnotation(annotations, event.annotationId);
            annotations.set(event.annotationId, removeAnnotationStroke(annotation, event.payload.strokeId, mutationMeta));
            break;
        }
        default: {
            const exhaustive: never = event;
            throw new Error(`[reducer] unhandled event: ${JSON.stringify(exhaustive)}`);
        }
    }

    return {
        annotations,
        ...rebuildIndexes(annotations),
    };
}

export function reduceAnnotationEvents(events: readonly AnnotationEvent[], seed = emptyAnnotationSnapshot()): AnnotationSnapshot {
    let snapshot = seed;
    for (const event of events) {
        snapshot = reduceAnnotationEvent(snapshot, event);
    }
    return snapshot;
}