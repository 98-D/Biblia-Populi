import type { Annotation, NoteAnnotationPatch } from "./model/annotation";
import { assertAnnotation } from "./model/annotation";
import type { AnnotationId, DeviceId, EventId, SpanId, StrokeId, UserId } from "./model/ids";
import { createEventId, toAnnotationId, toEventId, toSpanId, toStrokeId, toUserId, toDeviceId } from "./model/ids";
import type { AnnotationSpan } from "./model/span";
import { assertAnnotationSpan } from "./model/span";
import type { InkStroke, InkStrokePatch } from "./model/stroke";
import { assertInkStroke } from "./model/stroke";

export const ANNOTATION_EVENT_TYPE = {
    ANNOTATION_CREATED: "ANNOTATION_CREATED",
    ANNOTATION_PATCHED: "ANNOTATION_PATCHED",
    ANNOTATION_SOFT_DELETED: "ANNOTATION_SOFT_DELETED",
    ANNOTATION_RESTORED: "ANNOTATION_RESTORED",
    SPANS_REPLACED: "SPANS_REPLACED",
    SPAN_UPSERTED: "SPAN_UPSERTED",
    SPAN_REMOVED: "SPAN_REMOVED",
    STROKE_CREATED: "STROKE_CREATED",
    STROKE_PATCHED: "STROKE_PATCHED",
    STROKE_REMOVED: "STROKE_REMOVED",
} as const;

export type AnnotationEventType = (typeof ANNOTATION_EVENT_TYPE)[keyof typeof ANNOTATION_EVENT_TYPE];

interface AnnotationEventBase<TType extends AnnotationEventType, TPayload> {
    eventId: EventId;
    type: TType;
    annotationId: AnnotationId;
    userId: UserId;
    deviceId: DeviceId;
    createdAt: number;
    payload: TPayload;
}

export type AnnotationCreatedEvent = AnnotationEventBase<
    typeof ANNOTATION_EVENT_TYPE.ANNOTATION_CREATED,
    { annotation: Annotation }
>;

export type AnnotationPatchedEvent = AnnotationEventBase<
    typeof ANNOTATION_EVENT_TYPE.ANNOTATION_PATCHED,
    { patch: NoteAnnotationPatch }
>;

export type AnnotationSoftDeletedEvent = AnnotationEventBase<
    typeof ANNOTATION_EVENT_TYPE.ANNOTATION_SOFT_DELETED,
    { deletedAt?: number }
>;

export type AnnotationRestoredEvent = AnnotationEventBase<
    typeof ANNOTATION_EVENT_TYPE.ANNOTATION_RESTORED,
    { restoredAt?: number }
>;

export type SpansReplacedEvent = AnnotationEventBase<
    typeof ANNOTATION_EVENT_TYPE.SPANS_REPLACED,
    { spans: readonly AnnotationSpan[] }
>;

export type SpanUpsertedEvent = AnnotationEventBase<
    typeof ANNOTATION_EVENT_TYPE.SPAN_UPSERTED,
    { span: AnnotationSpan }
>;

export type SpanRemovedEvent = AnnotationEventBase<
    typeof ANNOTATION_EVENT_TYPE.SPAN_REMOVED,
    { spanId: SpanId }
>;

export type StrokeCreatedEvent = AnnotationEventBase<
    typeof ANNOTATION_EVENT_TYPE.STROKE_CREATED,
    { stroke: InkStroke }
>;

export type StrokePatchedEvent = AnnotationEventBase<
    typeof ANNOTATION_EVENT_TYPE.STROKE_PATCHED,
    { strokeId: StrokeId; patch: InkStrokePatch }
>;

export type StrokeRemovedEvent = AnnotationEventBase<
    typeof ANNOTATION_EVENT_TYPE.STROKE_REMOVED,
    { strokeId: StrokeId }
>;

export type AnnotationEvent =
    | AnnotationCreatedEvent
    | AnnotationPatchedEvent
    | AnnotationSoftDeletedEvent
    | AnnotationRestoredEvent
    | SpansReplacedEvent
    | SpanUpsertedEvent
    | SpanRemovedEvent
    | StrokeCreatedEvent
    | StrokePatchedEvent
    | StrokeRemovedEvent;

export interface CreateEventMeta {
    eventId?: EventId;
    userId: UserId;
    deviceId: DeviceId;
    createdAt?: number;
}

function assertInteger(value: unknown, label: string): asserts value is number {
    if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new Error(`[events] ${label} must be an integer`);
    }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function createBaseEvent<TType extends AnnotationEventType, TPayload>(
    type: TType,
    annotationId: AnnotationId,
    payload: TPayload,
    meta: CreateEventMeta,
): AnnotationEventBase<TType, TPayload> {
    return {
        eventId: meta.eventId ?? createEventId(type),
        type,
        annotationId,
        userId: meta.userId,
        deviceId: meta.deviceId,
        createdAt: meta.createdAt ?? Date.now(),
        payload,
    };
}

export function createAnnotationCreatedEvent(annotation: Annotation, meta: CreateEventMeta): AnnotationCreatedEvent {
    assertAnnotation(annotation);
    return createBaseEvent(ANNOTATION_EVENT_TYPE.ANNOTATION_CREATED, annotation.annotationId, { annotation }, meta);
}

export function createAnnotationPatchedEvent(
    annotationId: AnnotationId,
    patch: NoteAnnotationPatch,
    meta: CreateEventMeta,
): AnnotationPatchedEvent {
    return createBaseEvent(ANNOTATION_EVENT_TYPE.ANNOTATION_PATCHED, annotationId, { patch }, meta);
}

export function createAnnotationSoftDeletedEvent(
    annotationId: AnnotationId,
    meta: CreateEventMeta & { deletedAt?: number },
): AnnotationSoftDeletedEvent {
    return createBaseEvent(
        ANNOTATION_EVENT_TYPE.ANNOTATION_SOFT_DELETED,
        annotationId,
        meta.deletedAt === undefined ? {} : { deletedAt: meta.deletedAt },
        meta,
    );
}

export function createAnnotationRestoredEvent(
    annotationId: AnnotationId,
    meta: CreateEventMeta & { restoredAt?: number },
): AnnotationRestoredEvent {
    return createBaseEvent(
        ANNOTATION_EVENT_TYPE.ANNOTATION_RESTORED,
        annotationId,
        meta.restoredAt === undefined ? {} : { restoredAt: meta.restoredAt },
        meta,
    );
}

export function createSpansReplacedEvent(
    annotationId: AnnotationId,
    spans: readonly AnnotationSpan[],
    meta: CreateEventMeta,
): SpansReplacedEvent {
    for (const span of spans) assertAnnotationSpan(span);
    return createBaseEvent(ANNOTATION_EVENT_TYPE.SPANS_REPLACED, annotationId, { spans }, meta);
}

export function createSpanUpsertedEvent(
    annotationId: AnnotationId,
    span: AnnotationSpan,
    meta: CreateEventMeta,
): SpanUpsertedEvent {
    assertAnnotationSpan(span);
    return createBaseEvent(ANNOTATION_EVENT_TYPE.SPAN_UPSERTED, annotationId, { span }, meta);
}

export function createSpanRemovedEvent(
    annotationId: AnnotationId,
    spanId: SpanId,
    meta: CreateEventMeta,
): SpanRemovedEvent {
    return createBaseEvent(ANNOTATION_EVENT_TYPE.SPAN_REMOVED, annotationId, { spanId }, meta);
}

export function createStrokeCreatedEvent(
    annotationId: AnnotationId,
    stroke: InkStroke,
    meta: CreateEventMeta,
): StrokeCreatedEvent {
    assertInkStroke(stroke);
    if (stroke.annotationId !== annotationId) {
        throw new Error("[events] stroke.annotationId must match annotationId");
    }
    return createBaseEvent(ANNOTATION_EVENT_TYPE.STROKE_CREATED, annotationId, { stroke }, meta);
}

export function createStrokePatchedEvent(
    annotationId: AnnotationId,
    strokeId: StrokeId,
    patch: InkStrokePatch,
    meta: CreateEventMeta,
): StrokePatchedEvent {
    return createBaseEvent(ANNOTATION_EVENT_TYPE.STROKE_PATCHED, annotationId, { strokeId, patch }, meta);
}

export function createStrokeRemovedEvent(
    annotationId: AnnotationId,
    strokeId: StrokeId,
    meta: CreateEventMeta,
): StrokeRemovedEvent {
    return createBaseEvent(ANNOTATION_EVENT_TYPE.STROKE_REMOVED, annotationId, { strokeId }, meta);
}

export function assertAnnotationEvent(value: unknown): asserts value is AnnotationEvent {
    if (!isObjectRecord(value)) {
        throw new Error("[events] event must be an object");
    }

    toEventId(value.eventId);
    toAnnotationId(value.annotationId);
    toUserId(value.userId);
    toDeviceId(value.deviceId);
    assertInteger(value.createdAt, "createdAt");
    if (typeof value.type !== "string") {
        throw new Error("[events] type must be a string");
    }
    if (!isObjectRecord(value.payload)) {
        throw new Error("[events] payload must be an object");
    }

    switch (value.type) {
        case ANNOTATION_EVENT_TYPE.ANNOTATION_CREATED: {
            assertAnnotation(value.payload.annotation);
            if (value.payload.annotation.annotationId !== value.annotationId) {
                throw new Error("[events] created annotationId mismatch");
            }
            return;
        }
        case ANNOTATION_EVENT_TYPE.ANNOTATION_PATCHED: {
            if (!isObjectRecord(value.payload.patch)) {
                throw new Error("[events] patch payload must be an object");
            }
            return;
        }
        case ANNOTATION_EVENT_TYPE.ANNOTATION_SOFT_DELETED: {
            if (value.payload.deletedAt !== undefined) {
                assertInteger(value.payload.deletedAt, "payload.deletedAt");
            }
            return;
        }
        case ANNOTATION_EVENT_TYPE.ANNOTATION_RESTORED: {
            if (value.payload.restoredAt !== undefined) {
                assertInteger(value.payload.restoredAt, "payload.restoredAt");
            }
            return;
        }
        case ANNOTATION_EVENT_TYPE.SPANS_REPLACED: {
            if (!Array.isArray(value.payload.spans)) {
                throw new Error("[events] payload.spans must be an array");
            }
            for (const span of value.payload.spans) assertAnnotationSpan(span);
            return;
        }
        case ANNOTATION_EVENT_TYPE.SPAN_UPSERTED: {
            assertAnnotationSpan(value.payload.span);
            return;
        }
        case ANNOTATION_EVENT_TYPE.SPAN_REMOVED: {
            toSpanId(value.payload.spanId);
            return;
        }
        case ANNOTATION_EVENT_TYPE.STROKE_CREATED: {
            assertInkStroke(value.payload.stroke);
            return;
        }
        case ANNOTATION_EVENT_TYPE.STROKE_PATCHED: {
            toStrokeId(value.payload.strokeId);
            if (!isObjectRecord(value.payload.patch)) {
                throw new Error("[events] payload.patch must be an object");
            }
            return;
        }
        case ANNOTATION_EVENT_TYPE.STROKE_REMOVED: {
            toStrokeId(value.payload.strokeId);
            return;
        }
        default:
            throw new Error(`[events] unknown event type: ${String(value.type)}`);
    }
}