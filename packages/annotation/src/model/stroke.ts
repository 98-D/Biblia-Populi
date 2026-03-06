import type { AnnotationId, PaletteId, StrokeId } from "./ids";
import {
    createStrokeId,
    defaultHashText,
    toAnnotationId,
    toPaletteId,
    toStrokeId,
} from "./ids";

export const INK_TOOL = {
    PEN: "PEN",
    HIGHLIGHTER: "HIGHLIGHTER",
    ERASER: "ERASER",
} as const;

export type InkTool = (typeof INK_TOOL)[keyof typeof INK_TOOL];

export const INK_STORAGE_MODE = {
    INLINE: "INLINE",
    CHUNKED: "CHUNKED",
} as const;

export type InkStorageMode = (typeof INK_STORAGE_MODE)[keyof typeof INK_STORAGE_MODE];

export interface InkPoint {
    x: number;
    y: number;
    t: number | null;
    pressure: number | null;
    tiltX: number | null;
    tiltY: number | null;
}

export interface InkBBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface InkStroke {
    strokeId: StrokeId;
    annotationId: AnnotationId;
    ordinal: number;
    tool: InkTool;
    storageMode: InkStorageMode;
    color: string | null;
    width: number;
    opacity: number;
    paletteId: PaletteId | null;
    pointCount: number;
    bbox: InkBBox | null;
    contentHash: string;
    points: readonly InkPoint[] | null;
    chunkRefs: readonly string[] | null;
    clientKey: string | null;
    createdAt: number;
    deletedAt: number | null;
}

export interface InkStrokeInput {
    strokeId?: StrokeId;
    annotationId: AnnotationId;
    ordinal?: number;
    tool?: InkTool;
    storageMode?: InkStorageMode;
    color?: string | null;
    width?: number;
    opacity?: number;
    paletteId?: PaletteId | null;
    points?: readonly InkPoint[] | null;
    chunkRefs?: readonly string[] | null;
    clientKey?: string | null;
    createdAt?: number;
    deletedAt?: number | null;
}

export interface InkStrokePatch {
    tool?: InkTool;
    storageMode?: InkStorageMode;
    color?: string | null;
    width?: number;
    opacity?: number;
    paletteId?: PaletteId | null;
    points?: readonly InkPoint[] | null;
    chunkRefs?: readonly string[] | null;
    clientKey?: string | null;
    deletedAt?: number | null;
}

export interface InkStrokeRow {
    stroke_id: string;
    annotation_id: string;
    ordinal: number;
    tool: InkTool;
    storage_mode: InkStorageMode;
    color: string | null;
    width: number;
    opacity: number;
    palette_id: string | null;
    point_count: number;
    bbox_json: string | null;
    content_hash: string;
    points_json: string | null;
    chunk_refs_json: string | null;
    client_key: string | null;
    created_at: number;
    deleted_at: number | null;
}

function assertInteger(value: unknown, label: string): asserts value is number {
    if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new Error(`[stroke] ${label} must be an integer`);
    }
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
        throw new Error(`[stroke] ${label} must be a positive integer`);
    }
}

function assertNullableIntegerGte(value: unknown, minimum: number, label: string): asserts value is number | null {
    if (value !== null && (typeof value !== "number" || !Number.isInteger(value) || value < minimum)) {
        throw new Error(`[stroke] ${label} must be null or an integer >= ${minimum}`);
    }
}

function assertFinitePositiveNumber(value: unknown, label: string): asserts value is number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        throw new Error(`[stroke] ${label} must be a finite positive number`);
    }
}

function assertFiniteUnitNumber(value: unknown, label: string): asserts value is number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`[stroke] ${label} must be a finite number in [0..1]`);
    }
}

function assertTool(value: unknown): asserts value is InkTool {
    if (value !== INK_TOOL.PEN && value !== INK_TOOL.HIGHLIGHTER && value !== INK_TOOL.ERASER) {
        throw new Error("[stroke] tool must be PEN, HIGHLIGHTER, or ERASER");
    }
}

function assertStorageMode(value: unknown): asserts value is InkStorageMode {
    if (value !== INK_STORAGE_MODE.INLINE && value !== INK_STORAGE_MODE.CHUNKED) {
        throw new Error("[stroke] storageMode must be INLINE or CHUNKED");
    }
}

function normalizeNullableString(value: string | null | undefined): string | null {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizeInkPoint(point: InkPoint): InkPoint {
    assertInkPoint(point);
    return {
        x: point.x,
        y: point.y,
        t: point.t,
        pressure: point.pressure,
        tiltX: point.tiltX,
        tiltY: point.tiltY,
    };
}

function compareBBox(a: InkBBox | null, b: InkBBox | null): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    return a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;
}

function serializePoints(points: readonly InkPoint[]): string {
    return JSON.stringify(points.map((point) => [point.x, point.y, point.t, point.pressure, point.tiltX, point.tiltY]));
}

export function assertInkPoint(value: unknown): asserts value is InkPoint {
    if (typeof value !== "object" || value === null) {
        throw new Error("[stroke] point must be an object");
    }
    const point = value as Record<string, unknown>;
    assertFiniteUnitNumber(point.x, "point.x");
    assertFiniteUnitNumber(point.y, "point.y");
    assertNullableIntegerGte(point.t ?? null, 0, "point.t");
    if (point.pressure !== null && point.pressure !== undefined) {
        assertFiniteUnitNumber(point.pressure, "point.pressure");
    }
    if (point.tiltX !== null && point.tiltX !== undefined && (typeof point.tiltX !== "number" || !Number.isFinite(point.tiltX))) {
        throw new Error("[stroke] point.tiltX must be null or a finite number");
    }
    if (point.tiltY !== null && point.tiltY !== undefined && (typeof point.tiltY !== "number" || !Number.isFinite(point.tiltY))) {
        throw new Error("[stroke] point.tiltY must be null or a finite number");
    }
}

export function computeInkBBox(points: readonly InkPoint[]): InkBBox | null {
    if (points.length === 0) return null;
    let minX = points[0]!.x;
    let minY = points[0]!.y;
    let maxX = points[0]!.x;
    let maxY = points[0]!.y;
    for (let i = 1; i < points.length; i += 1) {
        const point = points[i]!;
        if (point.x < minX) minX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.x > maxX) maxX = point.x;
        if (point.y > maxY) maxY = point.y;
    }
    return { minX, minY, maxX, maxY };
}

export function createInkStroke(input: InkStrokeInput, now = Date.now()): InkStroke {
    const storageMode = input.storageMode ?? INK_STORAGE_MODE.INLINE;
    const points = storageMode === INK_STORAGE_MODE.INLINE
        ? (input.points ?? []).map(normalizeInkPoint)
        : null;
    const bbox = points ? computeInkBBox(points) : null;
    const pointCount = points ? points.length : 0;
    const createdAt = input.createdAt ?? now;
    const deletedAt = input.deletedAt ?? null;
    const chunkRefs = storageMode === INK_STORAGE_MODE.CHUNKED
        ? [...new Set((input.chunkRefs ?? []).map((value) => value.trim()).filter((value) => value.length > 0))]
        : null;

    const stroke: InkStroke = {
        strokeId: input.strokeId ?? createStrokeId(input.annotationId),
        annotationId: input.annotationId,
        ordinal: input.ordinal ?? 1,
        tool: input.tool ?? INK_TOOL.PEN,
        storageMode,
        color: normalizeNullableString(input.color),
        width: input.width ?? 1,
        opacity: input.opacity ?? 1,
        paletteId: input.paletteId ?? null,
        pointCount,
        bbox,
        contentHash: points ? defaultHashText(serializePoints(points)) : defaultHashText(JSON.stringify(chunkRefs ?? [])),
        points,
        chunkRefs,
        clientKey: normalizeNullableString(input.clientKey),
        createdAt,
        deletedAt,
    };
    assertInkStroke(stroke);
    return stroke;
}

export function patchInkStroke(stroke: InkStroke, patch: InkStrokePatch): InkStroke {
    assertInkStroke(stroke);
    const nextStorageMode = patch.storageMode ?? stroke.storageMode;
    const points = nextStorageMode === INK_STORAGE_MODE.INLINE
        ? (patch.points ?? stroke.points ?? []).map(normalizeInkPoint)
        : null;
    const chunkRefs = nextStorageMode === INK_STORAGE_MODE.CHUNKED
        ? [...new Set((patch.chunkRefs ?? stroke.chunkRefs ?? []).map((value) => value.trim()).filter((value) => value.length > 0))]
        : null;
    const bbox = points ? computeInkBBox(points) : null;
    const pointCount = points ? points.length : 0;

    const next: InkStroke = {
        ...stroke,
        tool: patch.tool ?? stroke.tool,
        storageMode: nextStorageMode,
        color: patch.color !== undefined ? normalizeNullableString(patch.color) : stroke.color,
        width: patch.width ?? stroke.width,
        opacity: patch.opacity ?? stroke.opacity,
        paletteId: patch.paletteId !== undefined ? patch.paletteId : stroke.paletteId,
        pointCount,
        bbox,
        contentHash: points ? defaultHashText(serializePoints(points)) : defaultHashText(JSON.stringify(chunkRefs ?? [])),
        points,
        chunkRefs,
        clientKey: patch.clientKey !== undefined ? normalizeNullableString(patch.clientKey) : stroke.clientKey,
        deletedAt: patch.deletedAt !== undefined ? patch.deletedAt : stroke.deletedAt,
    };
    assertInkStroke(next);
    return next;
}

export function assertInkStroke(value: unknown): asserts value is InkStroke {
    if (typeof value !== "object" || value === null) {
        throw new Error("[stroke] stroke must be an object");
    }
    const stroke = value as Record<string, unknown>;
    toStrokeId(stroke.strokeId);
    toAnnotationId(stroke.annotationId);
    assertPositiveInteger(stroke.ordinal, "ordinal");
    assertTool(stroke.tool);
    assertStorageMode(stroke.storageMode);
    if (stroke.color != null && typeof stroke.color !== "string") {
        throw new Error("[stroke] color must be null or a string");
    }
    assertFinitePositiveNumber(stroke.width, "width");
    assertFiniteUnitNumber(stroke.opacity, "opacity");
    if (stroke.paletteId != null) {
        toPaletteId(stroke.paletteId);
    }
    assertInteger(stroke.pointCount, "pointCount");
    if (typeof stroke.contentHash !== "string" || stroke.contentHash.trim().length === 0) {
        throw new Error("[stroke] contentHash must be a non-empty string");
    }
    if (stroke.clientKey != null && typeof stroke.clientKey !== "string") {
        throw new Error("[stroke] clientKey must be null or a string");
    }
    assertInteger(stroke.createdAt, "createdAt");
    assertNullableIntegerGte(stroke.deletedAt ?? null, stroke.createdAt as number, "deletedAt");

    const storageMode = stroke.storageMode as InkStorageMode;
    const points = (stroke.points ?? null) as readonly InkPoint[] | null;
    const bbox = (stroke.bbox ?? null) as InkBBox | null;
    const pointCount = stroke.pointCount as number;
    const chunkRefs = (stroke.chunkRefs ?? null) as readonly string[] | null;

    if (storageMode === INK_STORAGE_MODE.INLINE) {
        if (!Array.isArray(points)) {
            throw new Error("[stroke] INLINE strokes must carry points");
        }
        if (pointCount !== points.length) {
            throw new Error("[stroke] pointCount must equal points.length for INLINE strokes");
        }
        for (const point of points) assertInkPoint(point);
        const computed = computeInkBBox(points);
        if (!compareBBox(computed, bbox)) {
            throw new Error("[stroke] bbox must match points for INLINE strokes");
        }
    } else {
        if (points !== null) {
            throw new Error("[stroke] CHUNKED strokes must not carry inline points");
        }
        if (pointCount !== 0) {
            throw new Error("[stroke] CHUNKED strokes must have pointCount 0 in the base row");
        }
        if (chunkRefs !== null) {
            if (!Array.isArray(chunkRefs)) throw new Error("[stroke] chunkRefs must be null or a string array");
            for (const chunkRef of chunkRefs) {
                if (typeof chunkRef !== "string" || chunkRef.trim().length === 0) {
                    throw new Error("[stroke] chunkRefs must contain non-empty strings");
                }
            }
        }
        if (bbox !== null) {
            throw new Error("[stroke] CHUNKED strokes must not carry bbox in the base row");
        }
    }
}

export function inkStrokeToRow(stroke: InkStroke): InkStrokeRow {
    assertInkStroke(stroke);
    return {
        stroke_id: stroke.strokeId,
        annotation_id: stroke.annotationId,
        ordinal: stroke.ordinal,
        tool: stroke.tool,
        storage_mode: stroke.storageMode,
        color: stroke.color,
        width: stroke.width,
        opacity: stroke.opacity,
        palette_id: stroke.paletteId,
        point_count: stroke.pointCount,
        bbox_json: stroke.bbox ? JSON.stringify(stroke.bbox) : null,
        content_hash: stroke.contentHash,
        points_json: stroke.points ? JSON.stringify(stroke.points) : null,
        chunk_refs_json: stroke.chunkRefs ? JSON.stringify(stroke.chunkRefs) : null,
        client_key: stroke.clientKey,
        created_at: stroke.createdAt,
        deleted_at: stroke.deletedAt,
    };
}

export function inkStrokeFromRow(row: InkStrokeRow): InkStroke {
    return createInkStroke({
        strokeId: toStrokeId(row.stroke_id),
        annotationId: toAnnotationId(row.annotation_id),
        ordinal: row.ordinal,
        tool: row.tool,
        storageMode: row.storage_mode,
        color: row.color,
        width: row.width,
        opacity: row.opacity,
        paletteId: row.palette_id ? toPaletteId(row.palette_id) : null,
        points: row.points_json ? (JSON.parse(row.points_json) as InkPoint[]) : null,
        chunkRefs: row.chunk_refs_json ? (JSON.parse(row.chunk_refs_json) as string[]) : null,
        clientKey: row.client_key,
        createdAt: row.created_at,
        deletedAt: row.deleted_at,
    });
}

export function normalizeStrokeOrdinals(strokes: readonly InkStroke[]): InkStroke[] {
    return [...strokes]
        .sort((a, b) => {
            if (a.ordinal !== b.ordinal) return a.ordinal - b.ordinal;
            if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
            return a.strokeId.localeCompare(b.strokeId);
        })
        .map((stroke, index) => ({
            ...stroke,
            ordinal: index + 1,
        }));
}