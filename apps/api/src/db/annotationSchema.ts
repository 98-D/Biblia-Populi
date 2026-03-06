// apps/api/src/db/annotationSchema.ts
// Biblia.to — Reader Annotations schema (user data; NOT canon)
//
// Deep upgrade goals (virtualized-reader + future-proof):
// - Virtualization-safe anchors: verse-ord ranges + optional token spans + optional token char offsets
// - Supports: highlights, notes, drawings/ink, bookmarks, tags, attachments, history, sharing exports
// - Sync-friendly: per-row rev + updatedAtMs + tombstones + idempotency keys + conflict-safe writes
// - Fast querying: by user, by updatedAt, by verseOrd range overlap, by kind
// - Durable styling: palette-based + explicit per-annotation style JSON
// - Ink scaling: normalized coords, bbox, stroke chunks, compression-ready
// - Audit/undo: event log optional (append-only), and snapshot helpers
//
// Anchoring model (truth):
// - Structural truth: startVerseOrd/endVerseOrd ALWAYS (range overlap queryable)
// - Exact selection: (startVerseKey/endVerseKey + token indices + char offsets) optional and used for precision
// - Never store viewport pixels as truth.
//
// Notes:
// - This module references bpUser from authSchema.
// - It intentionally does NOT reference canon tables with foreign keys (bp_verse, bp_token, etc.)
//   because those are "canon-ish" and may be rebuilt; annotations should survive rebuilds.
//   We keep verseKey/translationId fields as plain TEXT with indexes.
//
// SQLite/Drizzle: timestamps are INTEGER ms epoch.

import {
    sqliteTable,
    text,
    integer,
    real,
    index,
    uniqueIndex,
    primaryKey,
    check,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { bpUser } from "./authSchema";

/* ---------------------------------- Enums ---------------------------------- */

export const AnnotationKind = {
    HIGHLIGHT: "HIGHLIGHT",
    NOTE: "NOTE",
    INK: "INK",
    BOOKMARK: "BOOKMARK",
} as const;
export type AnnotationKind = (typeof AnnotationKind)[keyof typeof AnnotationKind];

export const AnchorKind = {
    RANGE: "RANGE", // verse-ord range (required)
    TOKEN_SPAN: "TOKEN_SPAN", // optional token indices/offsets for exactness
    LOCATION: "LOCATION", // optional: exact single-verse "pin" (still has ord range; 1 verse)
} as const;
export type AnchorKind = (typeof AnchorKind)[keyof typeof AnchorKind];

export const NoteFormat = {
    PLAIN: "plain",
    MD: "md",
} as const;
export type NoteFormat = (typeof NoteFormat)[keyof typeof NoteFormat];

export const InkTool = {
    PEN: "PEN",
    HIGHLIGHTER: "HIGHLIGHTER",
    ERASER: "ERASER",
} as const;
export type InkTool = (typeof InkTool)[keyof typeof InkTool];

export const PrivacyLevel = {
    PRIVATE: "PRIVATE",
    SHARED_LINK: "SHARED_LINK",
    PUBLIC: "PUBLIC",
} as const;
export type PrivacyLevel = (typeof PrivacyLevel)[keyof typeof PrivacyLevel];

/**
 * Palette is optional but recommended:
 * - gives consistent colors across devices
 * - allows user to rename/manage swatches
 */
export const PaletteKind = {
    HIGHLIGHT: "HIGHLIGHT",
    INK: "INK",
    TAG: "TAG",
} as const;
export type PaletteKind = (typeof PaletteKind)[keyof typeof PaletteKind];

/**
 * A minimal stable uuid-ish check for ids (don’t enforce strict uuid).
 * SQLite regex checks are annoying; keep checks simple.
 */
const lenGt0 = (col: unknown) => sql`length(${col as any}) > 0`;

/* ----------------------------- Core Annotation ------------------------------ */

/**
 * bp_annotation
 * The user-owned “thing”: highlight/note/ink/bookmark/etc.
 * Spans/strokes/labels/attachments hang off this id.
 */
export const bpAnnotation = sqliteTable(
    "bp_annotation",
    {
        annotationId: text("annotation_id").primaryKey(), // uuid/cuid/ksuid (app-generated)
        userId: text("user_id")
            .notNull()
            .references(() => bpUser.id, { onDelete: "cascade", onUpdate: "cascade" }),

        kind: text("kind").notNull(), // AnnotationKind

        // Optimistic sync revision (monotonic per annotation).
        // Any write increments rev.
        rev: integer("rev").notNull().default(1),

        // Idempotency key (optional): lets clients retry safely.
        // Typical: "deviceId:ulid" or request hash.
        idempotencyKey: text("idempotency_key"),

        createdAt: integer("created_at").notNull(), // ms epoch
        updatedAt: integer("updated_at").notNull(), // ms epoch
        deletedAt: integer("deleted_at"), // ms epoch (nullable; soft delete/tombstone)

        // Optional “foldering” / grouping
        collectionId: text("collection_id"), // optional (user-defined notebooks, etc.)
        title: text("title"), // optional label

        // Optional visual styling
        color: text("color"), // e.g. "#FFD54A"
        opacity: real("opacity"), // 0..1

        // Prefer paletteId when set; keeps palette stable even if color changes.
        paletteId: text("palette_id"),

        // JSON blob: underline, squiggle, badge shape, note pin style, etc.
        styleJson: text("style_json"),

        // Content payload for NOTE / BOOKMARK
        noteText: text("note_text"),
        noteFormat: text("note_format"), // "plain" | "md"
        noteHtml: text("note_html"), // optional pre-rendered for fast UI (cache; can be regenerated)

        // Search helpers
        textSearch: text("text_search"), // optional normalized text concat for quick LIKE searches
    },
    (t) => ({
        userIdx: index("bp_annotation_user_idx").on(t.userId, t.updatedAt),
        userKindIdx: index("bp_annotation_user_kind_idx").on(t.userId, t.kind, t.updatedAt),
        updatedIdx: index("bp_annotation_updated_idx").on(t.updatedAt),
        deletedIdx: index("bp_annotation_deleted_idx").on(t.deletedAt),
        idemUq: uniqueIndex("bp_annotation_idem_uq").on(t.userId, t.idempotencyKey),

        kindCheck: check(
            "bp_annotation_kind_check",
            sql`${t.kind} in ('HIGHLIGHT','NOTE','INK','BOOKMARK')`,
        ),
        revCheck: check("bp_annotation_rev_check", sql`${t.rev} >= 1`),
        opacityCheck: check(
            "bp_annotation_opacity_check",
            sql`${t.opacity} is null or (${t.opacity} >= 0 and ${t.opacity} <= 1)`,
        ),
        idCheck: check("bp_annotation_id_check", lenGt0(t.annotationId)),
        userIdCheck: check("bp_annotation_user_id_check", lenGt0(t.userId)),
        noteFormatCheck: check(
            "bp_annotation_note_format_check",
            sql`${t.noteFormat} is null or ${t.noteFormat} in ('plain','md')`,
        ),
    }),
);

/* ------------------------------ Span Anchors -------------------------------- */

/**
 * bp_annotation_span
 * A single annotation can target one or more spans (most are exactly 1).
 *
 * Structural truth:
 * - startVerseOrd/endVerseOrd are REQUIRED.
 *
 * Exactness options:
 * - translationId can be set to "bind" the selection to a translation.
 * - start/end token indices (token_index) are recommended for partial-verse selection.
 * - start/end char offsets (within bp_verse_text.text) are optional and help sanity checks.
 *
 * Cross-verse token spans:
 * - startTokenIndex applies to startVerseKey (or start verse of the range)
 * - endTokenIndex applies to endVerseKey (or end verse of the range)
 *
 * If you don’t have tokenization yet, leave token indices null and rely on verse range.
 */
export const bpAnnotationSpan = sqliteTable(
    "bp_annotation_span",
    {
        annotationId: text("annotation_id")
            .notNull()
            .references(() => bpAnnotation.annotationId, { onDelete: "cascade", onUpdate: "cascade" }),

        spanOrdinal: integer("span_ordinal").notNull(), // 1..N ordering of spans

        anchorKind: text("anchor_kind").notNull().default("RANGE"),

        // If set, annotation is tied to a translation (good for exact token indices).
        // If null, UI can apply it across translations, but token anchors may be ignored.
        translationId: text("translation_id"),

        // Structural anchor (required)
        startVerseOrd: integer("start_verse_ord").notNull(),
        endVerseOrd: integer("end_verse_ord").notNull(),

        // Convenience/debug/export (optional)
        startVerseKey: text("start_verse_key"),
        endVerseKey: text("end_verse_key"),

        // Optional token anchoring (recommended for partial highlights)
        startTokenIndex: integer("start_token_index"),
        endTokenIndex: integer("end_token_index"),

        // Optional char offsets for extra exactness checks.
        // Interpret as offsets into verse text for startVerseKey/endVerseKey.
        startCharOffset: integer("start_char_offset"),
        endCharOffset: integer("end_char_offset"),

        // Optional exactness helpers (never used as identity)
        selectedText: text("selected_text"), // snapshot
        selectedTextHash: text("selected_text_hash"), // hash of snapshot
        selectionVersion: integer("selection_version"), // bump if selection encoding changes

        // Optional “pin” within the range for note/bookmark placement (0..1).
        // This is NOT viewport positioning: it’s a logical hint within the range.
        pinX: real("pin_x"),
        pinY: real("pin_y"),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.annotationId, t.spanOrdinal] }),

        annIdx: index("bp_annotation_span_ann_idx").on(t.annotationId),
        ordIdx: index("bp_annotation_span_ord_idx").on(t.startVerseOrd, t.endVerseOrd),
        transIdx: index("bp_annotation_span_trans_idx").on(t.translationId, t.startVerseOrd, t.endVerseOrd),
        startKeyIdx: index("bp_annotation_span_start_key_idx").on(t.translationId, t.startVerseKey),

        anchorKindCheck: check(
            "bp_annotation_span_anchor_kind_check",
            sql`${t.anchorKind} in ('RANGE','TOKEN_SPAN','LOCATION')`,
        ),
        spanOrdCheck: check("bp_annotation_span_ordinal_check", sql`${t.spanOrdinal} >= 1`),
        spanCheck: check("bp_annotation_span_check", sql`${t.startVerseOrd} <= ${t.endVerseOrd}`),

        // token span sanity (if provided)
        tokStartCheck: check(
            "bp_annotation_span_tok_start_check",
            sql`${t.startTokenIndex} is null or ${t.startTokenIndex} >= 0`,
        ),
        tokEndCheck: check(
            "bp_annotation_span_tok_end_check",
            sql`${t.endTokenIndex} is null or ${t.endTokenIndex} >= 0`,
        ),

        // char offset sanity (if provided)
        charStartCheck: check(
            "bp_annotation_span_char_start_check",
            sql`${t.startCharOffset} is null or ${t.startCharOffset} >= 0`,
        ),
        charEndCheck: check(
            "bp_annotation_span_char_end_check",
            sql`${t.endCharOffset} is null or ${t.endCharOffset} >= 0`,
        ),

        // pin sanity
        pinXCheck: check(
            "bp_annotation_span_pin_x_check",
            sql`${t.pinX} is null or (${t.pinX} >= 0 and ${t.pinX} <= 1)`,
        ),
        pinYCheck: check(
            "bp_annotation_span_pin_y_check",
            sql`${t.pinY} is null or (${t.pinY} >= 0 and ${t.pinY} <= 1)`,
        ),
    }),
);

/**
 * Optional computed bbox per span in “layout-neutral” normalized coordinates.
 * - For highlight spans, bbox can represent union of token rects normalized by verse block.
 * - For ink spans, bbox can represent ink strokes union for rendering acceleration.
 *
 * Keep separate so you can regenerate without touching the core span row.
 */
export const bpAnnotationSpanBBox = sqliteTable(
    "bp_annotation_span_bbox",
    {
        annotationId: text("annotation_id")
            .notNull()
            .references(() => bpAnnotation.annotationId, { onDelete: "cascade", onUpdate: "cascade" }),

        spanOrdinal: integer("span_ordinal").notNull(),

        // Normalized bounding box in [0..1] coords within the local span canvas.
        minX: real("min_x").notNull(),
        minY: real("min_y").notNull(),
        maxX: real("max_x").notNull(),
        maxY: real("max_y").notNull(),

        updatedAt: integer("updated_at").notNull(), // ms epoch
    },
    (t) => ({
        pk: primaryKey({ columns: [t.annotationId, t.spanOrdinal] }),
        idx: index("bp_annotation_span_bbox_idx").on(t.annotationId, t.spanOrdinal),
        minXCheck: check("bp_annotation_span_bbox_min_x_check", sql`${t.minX} >= 0 and ${t.minX} <= 1`),
        minYCheck: check("bp_annotation_span_bbox_min_y_check", sql`${t.minY} >= 0 and ${t.minY} <= 1`),
        maxXCheck: check("bp_annotation_span_bbox_max_x_check", sql`${t.maxX} >= 0 and ${t.maxX} <= 1`),
        maxYCheck: check("bp_annotation_span_bbox_max_y_check", sql`${t.maxY} >= 0 and ${t.maxY} <= 1`),
        spanCheck: check("bp_annotation_span_bbox_span_check", sql`${t.minX} <= ${t.maxX} and ${t.minY} <= ${t.maxY}`),
    }),
);

/* ------------------------------ Labels / Tags ------------------------------- */

/**
 * bp_annotation_label
 * User-defined labels/tags (not canon, not interpretation; just organization).
 * These are like “topics” a user uses privately.
 */
export const bpAnnotationLabel = sqliteTable(
    "bp_annotation_label",
    {
        labelId: text("label_id").primaryKey(), // uuid/cuid
        userId: text("user_id")
            .notNull()
            .references(() => bpUser.id, { onDelete: "cascade", onUpdate: "cascade" }),

        name: text("name").notNull(),
        nameNorm: text("name_norm").notNull(),

        color: text("color"),
        createdAt: integer("created_at").notNull(),
        updatedAt: integer("updated_at").notNull(),
        deletedAt: integer("deleted_at"),
    },
    (t) => ({
        userIdx: index("bp_annotation_label_user_idx").on(t.userId, t.updatedAt),
        normUq: uniqueIndex("bp_annotation_label_norm_uq").on(t.userId, t.nameNorm),

        idCheck: check("bp_annotation_label_id_check", lenGt0(t.labelId)),
        nameCheck: check("bp_annotation_label_name_check", sql`length(${t.name}) > 0`),
        nameNormCheck: check("bp_annotation_label_name_norm_check", sql`length(${t.nameNorm}) > 0`),
    }),
);

/**
 * Join table: annotation <-> label (many-to-many)
 */
export const bpAnnotationLabelLink = sqliteTable(
    "bp_annotation_label_link",
    {
        annotationId: text("annotation_id")
            .notNull()
            .references(() => bpAnnotation.annotationId, { onDelete: "cascade", onUpdate: "cascade" }),
        labelId: text("label_id")
            .notNull()
            .references(() => bpAnnotationLabel.labelId, { onDelete: "cascade", onUpdate: "cascade" }),

        createdAt: integer("created_at").notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.annotationId, t.labelId] }),
        annIdx: index("bp_annotation_label_link_ann_idx").on(t.annotationId),
        labelIdx: index("bp_annotation_label_link_label_idx").on(t.labelId),
    }),
);

/* ------------------------------- Palette ----------------------------------- */

export const bpAnnotationPalette = sqliteTable(
    "bp_annotation_palette",
    {
        paletteId: text("palette_id").primaryKey(), // uuid/cuid
        userId: text("user_id")
            .notNull()
            .references(() => bpUser.id, { onDelete: "cascade", onUpdate: "cascade" }),

        kind: text("kind").notNull(), // PaletteKind
        name: text("name").notNull(),
        color: text("color").notNull(), // #RRGGBB
        opacity: real("opacity"),

        createdAt: integer("created_at").notNull(),
        updatedAt: integer("updated_at").notNull(),
        deletedAt: integer("deleted_at"),
    },
    (t) => ({
        userIdx: index("bp_annotation_palette_user_idx").on(t.userId, t.kind, t.updatedAt),
        nameUq: uniqueIndex("bp_annotation_palette_name_uq").on(t.userId, t.kind, t.name),
        kindCheck: check("bp_annotation_palette_kind_check", sql`${t.kind} in ('HIGHLIGHT','INK','TAG')`),
        nameCheck: check("bp_annotation_palette_name_check", sql`length(${t.name}) > 0`),
        colorCheck: check("bp_annotation_palette_color_check", sql`length(${t.color}) >= 4`),
        opacityCheck: check(
            "bp_annotation_palette_opacity_check",
            sql`${t.opacity} is null or (${t.opacity} >= 0 and ${t.opacity} <= 1)`,
        ),
    }),
);

/* ----------------------------------- Ink ----------------------------------- */

/**
 * bp_annotation_ink_stroke
 * One INK annotation can have many strokes.
 *
 * Points:
 * - x/y are normalized [0..1] within the local span canvas
 * - optional: t = ms offset since stroke start
 * - optional: p = pressure [0..1]
 * - optional: v = velocity (computed)
 *
 * Storage:
 * - pointsJson: JSON array of points (simple, portable)
 * - Optional chunking table below for very large strokes (mobile pencil use).
 */
export const bpAnnotationInkStroke = sqliteTable(
    "bp_annotation_ink_stroke",
    {
        strokeId: text("stroke_id").primaryKey(), // uuid/cuid
        annotationId: text("annotation_id")
            .notNull()
            .references(() => bpAnnotation.annotationId, { onDelete: "cascade", onUpdate: "cascade" }),

        ordinal: integer("ordinal").notNull(), // 1..N within annotation
        tool: text("tool").notNull().default("PEN"), // InkTool

        paletteId: text("palette_id"), // prefer palette
        color: text("color"),
        opacity: real("opacity"),

        // Width expressed in normalized units; UI maps to px relative to span bbox.
        width: real("width"),

        // Optional stroke smoothing/brush config (JSON)
        brushJson: text("brush_json"),

        // Bounding box in normalized coords for fast culling
        minX: real("min_x"),
        minY: real("min_y"),
        maxX: real("max_x"),
        maxY: real("max_y"),

        // Total points count (for quick sanity)
        pointCount: integer("point_count"),

        // Full points payload
        pointsJson: text("points_json").notNull(),

        createdAt: integer("created_at").notNull(), // ms epoch
        deletedAt: integer("deleted_at"), // optional tombstone for per-stroke erase ops
    },
    (t) => ({
        annIdx: index("bp_annotation_ink_ann_idx").on(t.annotationId),
        ordUq: uniqueIndex("bp_annotation_ink_ord_uq").on(t.annotationId, t.ordinal),
        deletedIdx: index("bp_annotation_ink_deleted_idx").on(t.annotationId, t.deletedAt),

        toolCheck: check("bp_annotation_ink_tool_check", sql`${t.tool} in ('PEN','HIGHLIGHTER','ERASER')`),
        ordCheck: check("bp_annotation_ink_ord_check", sql`${t.ordinal} >= 1`),
        opacityCheck: check(
            "bp_annotation_ink_opacity_check",
            sql`${t.opacity} is null or (${t.opacity} >= 0 and ${t.opacity} <= 1)`,
        ),
        widthCheck: check("bp_annotation_ink_width_check", sql`${t.width} is null or ${t.width} >= 0`),
        pointCountCheck: check(
            "bp_annotation_ink_point_count_check",
            sql`${t.pointCount} is null or ${t.pointCount} >= 0`,
        ),
        bboxMinXCheck: check("bp_annotation_ink_min_x_check", sql`${t.minX} is null or (${t.minX} >= 0 and ${t.minX} <= 1)`),
        bboxMinYCheck: check("bp_annotation_ink_min_y_check", sql`${t.minY} is null or (${t.minY} >= 0 and ${t.minY} <= 1)`),
        bboxMaxXCheck: check("bp_annotation_ink_max_x_check", sql`${t.maxX} is null or (${t.maxX} >= 0 and ${t.maxX} <= 1)`),
        bboxMaxYCheck: check("bp_annotation_ink_max_y_check", sql`${t.maxY} is null or (${t.maxY} >= 0 and ${t.maxY} <= 1)`),
    }),
);

/**
 * Optional chunk table for very large strokes.
 * If used:
 * - bp_annotation_ink_stroke.pointsJson may be NULL (but Drizzle would need schema change),
 *   or you store a small preview and put full data in chunks.
 *
 * Keeping it as optional “append” storage. Use only if you hit perf limits.
 */
export const bpAnnotationInkStrokeChunk = sqliteTable(
    "bp_annotation_ink_stroke_chunk",
    {
        strokeId: text("stroke_id")
            .notNull()
            .references(() => bpAnnotationInkStroke.strokeId, { onDelete: "cascade", onUpdate: "cascade" }),

        chunkIndex: integer("chunk_index").notNull(), // 0..N
        pointsJson: text("points_json").notNull(),

        createdAt: integer("created_at").notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.strokeId, t.chunkIndex] }),
        idx: index("bp_annotation_ink_stroke_chunk_idx").on(t.strokeId),
        chunkCheck: check("bp_annotation_ink_stroke_chunk_check", sql`${t.chunkIndex} >= 0`),
    }),
);

/* ------------------------------ Attachments -------------------------------- */

/**
 * Attachments let notes include images, audio, PDFs, etc (future).
 * We store metadata and a storage key; actual blob storage can be local disk, S3, etc.
 */
export const bpAnnotationAttachment = sqliteTable(
    "bp_annotation_attachment",
    {
        attachmentId: text("attachment_id").primaryKey(),
        annotationId: text("annotation_id")
            .notNull()
            .references(() => bpAnnotation.annotationId, { onDelete: "cascade", onUpdate: "cascade" }),

        kind: text("kind").notNull(), // "image" | "audio" | "file" | ...
        mime: text("mime"),
        byteSize: integer("byte_size"),
        storageKey: text("storage_key").notNull(), // e.g. "user/<id>/att/<id>"
        originalName: text("original_name"),
        sha256: text("sha256"),

        createdAt: integer("created_at").notNull(),
        deletedAt: integer("deleted_at"),
    },
    (t) => ({
        annIdx: index("bp_annotation_attachment_ann_idx").on(t.annotationId),
        kindIdx: index("bp_annotation_attachment_kind_idx").on(t.kind),
        storageIdx: uniqueIndex("bp_annotation_attachment_storage_uq").on(t.storageKey),
        kindCheck: check("bp_annotation_attachment_kind_check", sql`length(${t.kind}) > 0`),
        storageCheck: check("bp_annotation_attachment_storage_check", lenGt0(t.storageKey)),
        sizeCheck: check("bp_annotation_attachment_size_check", sql`${t.byteSize} is null or ${t.byteSize} >= 0`),
    }),
);

/* ------------------------------ Share / Export ------------------------------ */

/**
 * Optional “share” surface:
 * - share selected annotations via link
 * - or export packs
 *
 * Keep privacy defaults PRIVATE.
 */
export const bpAnnotationShare = sqliteTable(
    "bp_annotation_share",
    {
        shareId: text("share_id").primaryKey(), // uuid/cuid
        userId: text("user_id")
            .notNull()
            .references(() => bpUser.id, { onDelete: "cascade", onUpdate: "cascade" }),

        privacy: text("privacy").notNull().default("PRIVATE"),

        // A share pack is a list of annotation IDs (JSON array) + optional metadata.
        annotationIdsJson: text("annotation_ids_json").notNull(),

        title: text("title"),
        note: text("note"),

        createdAt: integer("created_at").notNull(),
        updatedAt: integer("updated_at").notNull(),
        revokedAt: integer("revoked_at"),
    },
    (t) => ({
        userIdx: index("bp_annotation_share_user_idx").on(t.userId, t.updatedAt),
        privacyCheck: check(
            "bp_annotation_share_privacy_check",
            sql`${t.privacy} in ('PRIVATE','SHARED_LINK','PUBLIC')`,
        ),
        idsCheck: check("bp_annotation_share_ids_check", sql`length(${t.annotationIdsJson}) > 1`),
    }),
);

/* ------------------------------ Event Log ----------------------------------- */

/**
 * Append-only event log (optional but extremely valuable):
 * - enables undo/redo
 * - enables audit/debugging
 * - enables replication if you ever move off SQLite
 *
 * You can keep this table even if you don’t use it initially.
 */
export const AnnotationEventKind = {
    CREATE: "CREATE",
    UPDATE: "UPDATE",
    DELETE: "DELETE",
    RESTORE: "RESTORE",
    ADD_STROKE: "ADD_STROKE",
    DEL_STROKE: "DEL_STROKE",
    ADD_LABEL: "ADD_LABEL",
    DEL_LABEL: "DEL_LABEL",
} as const;
export type AnnotationEventKind = (typeof AnnotationEventKind)[keyof typeof AnnotationEventKind];

export const bpAnnotationEvent = sqliteTable(
    "bp_annotation_event",
    {
        eventId: text("event_id").primaryKey(), // uuid/cuid
        userId: text("user_id")
            .notNull()
            .references(() => bpUser.id, { onDelete: "cascade", onUpdate: "cascade" }),

        annotationId: text("annotation_id"),
        kind: text("kind").notNull(), // AnnotationEventKind
        at: integer("at").notNull(), // ms epoch

        // Optional linking for detailed events
        strokeId: text("stroke_id"),
        labelId: text("label_id"),

        // JSON payload: before/after deltas, client meta, etc.
        payloadJson: text("payload_json"),
    },
    (t) => ({
        userIdx: index("bp_annotation_event_user_idx").on(t.userId, t.at),
        annIdx: index("bp_annotation_event_ann_idx").on(t.annotationId, t.at),
        kindIdx: index("bp_annotation_event_kind_idx").on(t.kind, t.at),
        kindCheck: check(
            "bp_annotation_event_kind_check",
            sql`${t.kind} in (
                'CREATE','UPDATE','DELETE','RESTORE',
                'ADD_STROKE','DEL_STROKE',
                'ADD_LABEL','DEL_LABEL'
            )`,
        ),
    }),
);

/* ---------------------------- Export convenience ---------------------------- */

export const annotationSchema = {
    bpAnnotation,
    bpAnnotationSpan,
    bpAnnotationSpanBBox,

    bpAnnotationLabel,
    bpAnnotationLabelLink,

    bpAnnotationPalette,

    bpAnnotationInkStroke,
    bpAnnotationInkStrokeChunk,

    bpAnnotationAttachment,

    bpAnnotationShare,

    bpAnnotationEvent,
} as const;