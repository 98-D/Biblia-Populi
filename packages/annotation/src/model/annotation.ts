import type { AnnotationId, DeviceId, PaletteId, SpanId, StrokeId, UserId } from "./ids";
import {
    createAnnotationId,
    toAnnotationId,
    toDeviceId,
    toPaletteId,
    toSpanId,
    toStrokeId,
    toUserId,
} from "./ids";
import type { AnnotationSpan } from "./span";
import { assertAnnotationSpan, normalizeSpanOrdinals } from "./span";
import type { InkStroke } from "./stroke";
import { assertInkStroke, normalizeStrokeOrdinals } from "./stroke";

export const ANNOTATION_KIND = {
    HIGHLIGHT: "HIGHLIGHT",
    NOTE: "NOTE",
    BOOKMARK: "BOOKMARK",
    DRAWING: "DRAWING",
} as const;

export type AnnotationKind = (typeof ANNOTATION_KIND)[keyof typeof ANNOTATION_KIND];

export interface Annotation {
    annotationId: AnnotationId;
    ownerUserId: UserId;
    createdByUserId: UserId;
    updatedByUserId: UserId;
    deviceId: DeviceId;
    kind: AnnotationKind;
    title: string | null;
    body: string | null;
    color: string | null;
    paletteId: PaletteId | null;
    labels: readonly string[];
    collectionIds: readonly string[];
    spans: readonly AnnotationSpan[];
    strokes: readonly InkStroke[];
    pinned: boolean;
    archived: boolean;
    createdAt: number;
    updatedAt: number;
    deletedAt: number | null;
    revision: number;
}

export interface CreateAnnotationInput {
    annotationId?: AnnotationId;
    ownerUserId: UserId;
    createdByUserId: UserId;
    updatedByUserId?: UserId;
    deviceId: DeviceId;
    kind?: AnnotationKind;
    title?: string | null;
    body?: string | null;
    color?: string | null;
    paletteId?: PaletteId | null;
    labels?: readonly string[];
    collectionIds?: readonly string[];
    spans?: readonly AnnotationSpan[];
    strokes?: readonly InkStroke[];
    pinned?: boolean;
    archived?: boolean;
    createdAt?: number;
    updatedAt?: number;
    deletedAt?: number | null;
    revision?: number;
}

export interface NoteAnnotationPatch {
    title?: string | null;
    body?: string | null;
    color?: string | null;
    paletteId?: PaletteId | null;
    labels?: readonly string[];
    collectionIds?: readonly string[];
    pinned?: boolean;
    archived?: boolean;
}

export interface AnnotationMutationMeta {
    updatedAt: number;
    updatedByUserId: UserId;
    deviceId?: DeviceId;
}

function assertInteger(value: unknown, label: string): asserts value is number {
    if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new Error(`[annotation] ${label} must be an integer`);
    }
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
        throw new Error(`[annotation] ${label} must be a positive integer`);
    }
}

function assertKind(value: unknown): asserts value is AnnotationKind {
    if (
        value !== ANNOTATION_KIND.HIGHLIGHT &&
        value !== ANNOTATION_KIND.NOTE &&
        value !== ANNOTATION_KIND.BOOKMARK &&
        value !== ANNOTATION_KIND.DRAWING
    ) {
        throw new Error("[annotation] kind must be HIGHLIGHT, NOTE, BOOKMARK, or DRAWING");
    }
}

function normalizeNullableString(value: string | null | undefined): string | null {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringList(values: readonly string[] | undefined): readonly string[] {
    if (!values) return [];
    return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))].sort((a, b) => a.localeCompare(b));
}

function normalizeSpans(spans: readonly AnnotationSpan[] | undefined): readonly AnnotationSpan[] {
    if (!spans) return [];
    for (const span of spans) assertAnnotationSpan(span);
    return normalizeSpanOrdinals(spans);
}

function normalizeStrokes(strokes: readonly InkStroke[] | undefined): readonly InkStroke[] {
    if (!strokes) return [];
    for (const stroke of strokes) assertInkStroke(stroke);
    return normalizeStrokeOrdinals(strokes);
}

function requireUniqueIds<T extends string>(ids: readonly T[], label: string): void {
    const seen = new Set<T>();
    for (const id of ids) {
        if (seen.has(id)) {
            throw new Error(`[annotation] duplicate ${label}: ${id}`);
        }
        seen.add(id);
    }
}

export function createAnnotation(input: CreateAnnotationInput, now = Date.now()): Annotation {
    const createdAt = input.createdAt ?? now;
    const updatedAt = input.updatedAt ?? createdAt;
    const deletedAt = input.deletedAt ?? null;
    const spans = normalizeSpans(input.spans);
    const strokes = normalizeStrokes(input.strokes);

    requireUniqueIds(spans.map((span) => span.spanId), "spanId");
    requireUniqueIds(strokes.map((stroke) => stroke.strokeId), "strokeId");

    const annotation: Annotation = {
        annotationId: input.annotationId ?? createAnnotationId(input.ownerUserId),
        ownerUserId: input.ownerUserId,
        createdByUserId: input.createdByUserId,
        updatedByUserId: input.updatedByUserId ?? input.createdByUserId,
        deviceId: input.deviceId,
        kind: input.kind ?? ANNOTATION_KIND.HIGHLIGHT,
        title: normalizeNullableString(input.title),
        body: normalizeNullableString(input.body),
        color: normalizeNullableString(input.color),
        paletteId: input.paletteId ?? null,
        labels: normalizeStringList(input.labels),
        collectionIds: normalizeStringList(input.collectionIds),
        spans,
        strokes,
        pinned: input.pinned ?? false,
        archived: input.archived ?? false,
        createdAt,
        updatedAt,
        deletedAt,
        revision: input.revision ?? 1,
    };
    assertAnnotation(annotation);
    return annotation;
}

export function assertAnnotation(value: unknown): asserts value is Annotation {
    if (typeof value !== "object" || value === null) {
        throw new Error("[annotation] annotation must be an object");
    }
    const annotation = value as Record<string, unknown>;
    toAnnotationId(annotation.annotationId);
    toUserId(annotation.ownerUserId);
    toUserId(annotation.createdByUserId);
    toUserId(annotation.updatedByUserId);
    toDeviceId(annotation.deviceId);
    assertKind(annotation.kind);
    if (annotation.title != null && typeof annotation.title !== "string") {
        throw new Error("[annotation] title must be null or a string");
    }
    if (annotation.body != null && typeof annotation.body !== "string") {
        throw new Error("[annotation] body must be null or a string");
    }
    if (annotation.color != null && typeof annotation.color !== "string") {
        throw new Error("[annotation] color must be null or a string");
    }
    if (annotation.paletteId != null) {
        toPaletteId(annotation.paletteId);
    }
    if (!Array.isArray(annotation.labels) || annotation.labels.some((value) => typeof value !== "string" || value.trim().length === 0)) {
        throw new Error("[annotation] labels must be a string array");
    }
    if (!Array.isArray(annotation.collectionIds) || annotation.collectionIds.some((value) => typeof value !== "string" || value.trim().length === 0)) {
        throw new Error("[annotation] collectionIds must be a string array");
    }
    if (!Array.isArray(annotation.spans)) {
        throw new Error("[annotation] spans must be an array");
    }
    if (!Array.isArray(annotation.strokes)) {
        throw new Error("[annotation] strokes must be an array");
    }
    for (const span of annotation.spans) assertAnnotationSpan(span);
    for (const stroke of annotation.strokes) {
        assertInkStroke(stroke);
        if (stroke.annotationId !== annotation.annotationId) {
            throw new Error("[annotation] stroke.annotationId must match annotation.annotationId");
        }
    }
    assertInteger(annotation.createdAt, "createdAt");
    assertInteger(annotation.updatedAt, "updatedAt");
    if (annotation.deletedAt !== null && annotation.deletedAt !== undefined) {
        assertInteger(annotation.deletedAt, "deletedAt");
        if ((annotation.deletedAt as number) < (annotation.createdAt as number)) {
            throw new Error("[annotation] deletedAt must be >= createdAt");
        }
    }
    if ((annotation.updatedAt as number) < (annotation.createdAt as number)) {
        throw new Error("[annotation] updatedAt must be >= createdAt");
    }
    if (typeof annotation.pinned !== "boolean") {
        throw new Error("[annotation] pinned must be boolean");
    }
    if (typeof annotation.archived !== "boolean") {
        throw new Error("[annotation] archived must be boolean");
    }
    assertPositiveInteger(annotation.revision, "revision");
    requireUniqueIds((annotation.spans as AnnotationSpan[]).map((span) => span.spanId), "spanId");
    requireUniqueIds((annotation.strokes as InkStroke[]).map((stroke) => stroke.strokeId), "strokeId");
}

export function patchNoteAnnotation(annotation: Annotation, patch: NoteAnnotationPatch, meta: AnnotationMutationMeta): Annotation {
    assertAnnotation(annotation);
    return createAnnotation({
        ...annotation,
        title: patch.title !== undefined ? patch.title : annotation.title,
        body: patch.body !== undefined ? patch.body : annotation.body,
        color: patch.color !== undefined ? patch.color : annotation.color,
        paletteId: patch.paletteId !== undefined ? patch.paletteId : annotation.paletteId,
        labels: patch.labels !== undefined ? patch.labels : annotation.labels,
        collectionIds: patch.collectionIds !== undefined ? patch.collectionIds : annotation.collectionIds,
        pinned: patch.pinned !== undefined ? patch.pinned : annotation.pinned,
        archived: patch.archived !== undefined ? patch.archived : annotation.archived,
        updatedAt: meta.updatedAt,
        updatedByUserId: meta.updatedByUserId,
        deviceId: meta.deviceId ?? annotation.deviceId,
        revision: annotation.revision + 1,
    });
}

export function replaceAnnotationSpans(annotation: Annotation, spans: readonly AnnotationSpan[], meta: AnnotationMutationMeta): Annotation {
    assertAnnotation(annotation);
    return createAnnotation({
        ...annotation,
        spans,
        updatedAt: meta.updatedAt,
        updatedByUserId: meta.updatedByUserId,
        deviceId: meta.deviceId ?? annotation.deviceId,
        revision: annotation.revision + 1,
    });
}

export function upsertAnnotationSpan(annotation: Annotation, span: AnnotationSpan, meta: AnnotationMutationMeta): Annotation {
    assertAnnotation(annotation);
    assertAnnotationSpan(span);
    const existingIndex = annotation.spans.findIndex((candidate) => candidate.spanId === span.spanId);
    const spans = existingIndex === -1
        ? [...annotation.spans, span]
        : annotation.spans.map((candidate) => (candidate.spanId === span.spanId ? span : candidate));
    return replaceAnnotationSpans(annotation, spans, meta);
}

export function removeAnnotationSpan(annotation: Annotation, spanId: SpanId, meta: AnnotationMutationMeta): Annotation {
    assertAnnotation(annotation);
    toSpanId(spanId);
    const spans = annotation.spans.filter((span) => span.spanId !== spanId);
    if (spans.length === annotation.spans.length) {
        throw new Error(`[annotation] span not found: ${spanId}`);
    }
    return replaceAnnotationSpans(annotation, spans, meta);
}

export function replaceAnnotationStrokes(annotation: Annotation, strokes: readonly InkStroke[], meta: AnnotationMutationMeta): Annotation {
    assertAnnotation(annotation);
    return createAnnotation({
        ...annotation,
        strokes,
        updatedAt: meta.updatedAt,
        updatedByUserId: meta.updatedByUserId,
        deviceId: meta.deviceId ?? annotation.deviceId,
        revision: annotation.revision + 1,
    });
}

export function upsertAnnotationStroke(annotation: Annotation, stroke: InkStroke, meta: AnnotationMutationMeta): Annotation {
    assertAnnotation(annotation);
    assertInkStroke(stroke);
    if (stroke.annotationId !== annotation.annotationId) {
        throw new Error("[annotation] upsert stroke annotationId mismatch");
    }
    const existingIndex = annotation.strokes.findIndex((candidate) => candidate.strokeId === stroke.strokeId);
    const strokes = existingIndex === -1
        ? [...annotation.strokes, stroke]
        : annotation.strokes.map((candidate) => (candidate.strokeId === stroke.strokeId ? stroke : candidate));
    return replaceAnnotationStrokes(annotation, strokes, meta);
}

export function removeAnnotationStroke(annotation: Annotation, strokeId: StrokeId, meta: AnnotationMutationMeta): Annotation {
    assertAnnotation(annotation);
    toStrokeId(strokeId);
    const strokes = annotation.strokes.filter((stroke) => stroke.strokeId !== strokeId);
    if (strokes.length === annotation.strokes.length) {
        throw new Error(`[annotation] stroke not found: ${strokeId}`);
    }
    return replaceAnnotationStrokes(annotation, strokes, meta);
}

export function softDeleteAnnotation(annotation: Annotation, meta: AnnotationMutationMeta, deletedAt = meta.updatedAt): Annotation {
    assertAnnotation(annotation);
    return createAnnotation({
        ...annotation,
        updatedAt: meta.updatedAt,
        updatedByUserId: meta.updatedByUserId,
        deviceId: meta.deviceId ?? annotation.deviceId,
        deletedAt,
        revision: annotation.revision + 1,
    });
}

export function restoreAnnotation(annotation: Annotation, meta: AnnotationMutationMeta): Annotation {
    assertAnnotation(annotation);
    return createAnnotation({
        ...annotation,
        updatedAt: meta.updatedAt,
        updatedByUserId: meta.updatedByUserId,
        deviceId: meta.deviceId ?? annotation.deviceId,
        deletedAt: null,
        revision: annotation.revision + 1,
    });
}