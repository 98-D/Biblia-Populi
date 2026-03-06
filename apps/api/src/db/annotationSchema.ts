// apps/api/src/db/annotationSchema.ts
// Biblia.to — Reader Annotations schema (user data; NOT canon)
//
// Hardened goals:
// - Virtualization-safe anchors: verse-ord truth + optional token spans + optional char offsets
// - Durable user data that survives canon/token rebuilds
// - Stronger invariants between related fields
// - Sync-friendly writes: rev, tombstones, idempotency, device/client metadata
// - Better relational structure for collections + sharing
// - Ink storage supports both inline and chunked payloads
//
// Important:
// - This module references bpUser from authSchema.
// - It intentionally does NOT FK to canon tables (bp_verse, bp_token, etc.).
//   Annotation durability matters more than rebuild-coupled referential integrity.
//
// SQLite / Drizzle:
// - All timestamps are INTEGER ms epoch.
// - JSON payloads are stored as TEXT.
// - Do not treat viewport pixels as truth.

import {
    sqliteTable,
    text,
    integer,
    real,
    index,
    uniqueIndex,
    primaryKey,
    check,
    foreignKey,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { bpUser } from "./authSchema";

/* --------------------------------- Helpers --------------------------------- */

const lenGt0 = (col: unknown) => sql`length(${col as any}) > 0`;
const lenGe = (col: unknown, n: number) => sql`length(${col as any}) >= ${n}`;
const jsonNonEmptyArrayish = (col: unknown) => sql`length(trim(${col as any})) >= 2`;

/* ---------------------------------- Enums ---------------------------------- */

export const AnnotationKind = {
    HIGHLIGHT: "HIGHLIGHT",
    NOTE: "NOTE",
    INK: "INK",
    BOOKMARK: "BOOKMARK",
} as const;
export type AnnotationKind = (typeof AnnotationKind)[keyof typeof AnnotationKind];

export const AnchorKind = {
    RANGE: "RANGE",
    TOKEN_SPAN: "TOKEN_SPAN",
    LOCATION: "LOCATION",
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

export const PaletteKind = {
    HIGHLIGHT: "HIGHLIGHT",
    INK: "INK",
    TAG: "TAG",
} as const;
export type PaletteKind = (typeof PaletteKind)[keyof typeof PaletteKind];

export const AnnotationShareScope = {
    ANNOTATIONS: "ANNOTATIONS",
    COLLECTION: "COLLECTION",
} as const;
export type AnnotationShareScope = (typeof AnnotationShareScope)[keyof typeof AnnotationShareScope];

export const InkStorageMode = {
    INLINE: "INLINE",
    CHUNKED: "CHUNKED",
} as const;
export type InkStorageMode = (typeof InkStorageMode)[keyof typeof InkStorageMode];

export const AnnotationEventKind = {
    CREATE: "CREATE",
    UPDATE: "UPDATE",
    DELETE: "DELETE",
    RESTORE: "RESTORE",
    ADD_STROKE: "ADD_STROKE",
    DEL_STROKE: "DEL_STROKE",
    ADD_LABEL: "ADD_LABEL",
    DEL_LABEL: "DEL_LABEL",
    MOVE_COLLECTION: "MOVE_COLLECTION",
} as const;
export type AnnotationEventKind = (typeof AnnotationEventKind)[keyof typeof AnnotationEventKind];

/* -------------------------- Collections / Notebooks ------------------------- */

export const bpAnnotationCollection = sqliteTable(
    "bp_annotation_collection",
    {
        collectionId: text("collection_id").primaryKey(), // uuid/cuid/ulid
        userId: text("user_id")
            .notNull()
            .references(() => bpUser.id, { onDelete: "cascade", onUpdate: "cascade" }),

        name: text("name").notNull(),
        nameNorm: text("name_norm").notNull(),

        description: text("description"),
        color: text("color"),
        icon: text("icon"),

        sortOrdinal: integer("sort_ordinal"),
        createdAt: integer("created_at").notNull(),
        updatedAt: integer("updated_at").notNull(),
        deletedAt: integer("deleted_at"),
    },
    (t) => ({
        userIdx: index("bp_annotation_collection_user_idx").on(t.userId, t.updatedAt),
        userSortIdx: index("bp_annotation_collection_user_sort_idx").on(t.userId, t.sortOrdinal, t.updatedAt),
        nameUq: uniqueIndex("bp_annotation_collection_name_uq").on(t.userId, t.nameNorm),

        idCheck: check("bp_annotation_collection_id_check", lenGt0(t.collectionId)),
        nameCheck: check("bp_annotation_collection_name_check", lenGt0(t.name)),
        nameNormCheck: check("bp_annotation_collection_name_norm_check", lenGt0(t.nameNorm)),
        sortCheck: check(
            "bp_annotation_collection_sort_check",
            sql`${t.sortOrdinal} is null or ${t.sortOrdinal} >= 0`,
        ),
        chronologyCheck: check(
            "bp_annotation_collection_chronology_check",
            sql`${t.updatedAt} >= ${t.createdAt}`,
        ),
        deletedChronologyCheck: check(
            "bp_annotation_collection_deleted_chronology_check",
            sql`${t.deletedAt} is null or ${t.deletedAt} >= ${t.createdAt}`,
        ),
    }),
);

/* ----------------------------- Core Annotation ------------------------------ */

export const bpAnnotation = sqliteTable(
    "bp_annotation",
    {
        annotationId: text("annotation_id").primaryKey(), // uuid/cuid/ksuid/ulid
        userId: text("user_id")
            .notNull()
            .references(() => bpUser.id, { onDelete: "cascade", onUpdate: "cascade" }),

        kind: text("kind").notNull(), // AnnotationKind

        // Optimistic concurrency / sync revision.
        rev: integer("rev").notNull().default(1),

        // Idempotent write support.
        idempotencyKey: text("idempotency_key"),

        // Device / client metadata for debugging + sync reconciliation.
        createdDeviceId: text("created_device_id"),
        updatedDeviceId: text("updated_device_id"),
        clientCreatedAt: integer("client_created_at"),
        clientUpdatedAt: integer("client_updated_at"),

        createdAt: integer("created_at").notNull(),
        updatedAt: integer("updated_at").notNull(),
        deletedAt: integer("deleted_at"),

        collectionId: text("collection_id").references(() => bpAnnotationCollection.collectionId, {
            onDelete: "set null",
            onUpdate: "cascade",
        }),

        title: text("title"),

        // Visual style.
        color: text("color"),
        opacity: real("opacity"),
        paletteId: text("palette_id"),
        styleJson: text("style_json"),

        // NOTE / BOOKMARK payload
        noteText: text("note_text"),
        noteFormat: text("note_format"),
        noteHtml: text("note_html"), // cached / derived render surface

        // Derived, denormalized search surface for quick LIKE/FTS pipelines.
        textSearch: text("text_search"),

        // Optional user sort override / pin order inside a collection or view.
        sortOrdinal: integer("sort_ordinal"),
    },
    (t) => ({
        userIdx: index("bp_annotation_user_idx").on(t.userId, t.updatedAt),
        userKindIdx: index("bp_annotation_user_kind_idx").on(t.userId, t.kind, t.updatedAt),
        userCollectionIdx: index("bp_annotation_user_collection_idx").on(t.userId, t.collectionId, t.updatedAt),
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
        sortCheck: check(
            "bp_annotation_sort_check",
            sql`${t.sortOrdinal} is null or ${t.sortOrdinal} >= 0`,
        ),
        chronologyCheck: check(
            "bp_annotation_chronology_check",
            sql`${t.updatedAt} >= ${t.createdAt}`,
        ),
        clientChronologyCheck: check(
            "bp_annotation_client_chronology_check",
            sql`${t.clientCreatedAt} is null or ${t.clientUpdatedAt} is null or ${t.clientUpdatedAt} >= ${t.clientCreatedAt}`,
        ),
        deletedChronologyCheck: check(
            "bp_annotation_deleted_chronology_check",
            sql`${t.deletedAt} is null or ${t.deletedAt} >= ${t.createdAt}`,
        ),
        notePayloadCheck: check(
            "bp_annotation_note_payload_check",
            sql`
                ${t.kind} != 'NOTE'
                or ${t.noteText} is not null
                or ${t.noteHtml} is not null
                or ${t.title} is not null
            `,
        ),
    }),
);

/* ------------------------------ Span Anchors -------------------------------- */

export const bpAnnotationSpan = sqliteTable(
    "bp_annotation_span",
    {
        annotationId: text("annotation_id")
            .notNull()
            .references(() => bpAnnotation.annotationId, { onDelete: "cascade", onUpdate: "cascade" }),

        spanOrdinal: integer("span_ordinal").notNull(), // 1..N

        anchorKind: text("anchor_kind").notNull().default("RANGE"),

        // Null means translation-agnostic structural anchor.
        // Set for token-precise, translation-specific anchoring.
        translationId: text("translation_id"),

        // Structural truth.
        startVerseOrd: integer("start_verse_ord").notNull(),
        endVerseOrd: integer("end_verse_ord").notNull(),

        // Convenience / export / debugging snapshots.
        startVerseKey: text("start_verse_key"),
        endVerseKey: text("end_verse_key"),

        // Optional exact token anchoring.
        startTokenIndex: integer("start_token_index"),
        endTokenIndex: integer("end_token_index"),

        // Optional char offsets inside start/end verse text.
        startCharOffset: integer("start_char_offset"),
        endCharOffset: integer("end_char_offset"),

        selectedText: text("selected_text"),
        selectedTextHash: text("selected_text_hash"),
        selectionVersion: integer("selection_version"),

        // Logical pin inside local span space [0..1]; never viewport pixels.
        pinX: real("pin_x"),
        pinY: real("pin_y"),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.annotationId, t.spanOrdinal] }),

        annIdx: index("bp_annotation_span_ann_idx").on(t.annotationId),
        ordIdx: index("bp_annotation_span_ord_idx").on(t.startVerseOrd, t.endVerseOrd),
        transIdx: index("bp_annotation_span_trans_idx").on(t.translationId, t.startVerseOrd, t.endVerseOrd),
        startKeyIdx: index("bp_annotation_span_start_key_idx").on(t.translationId, t.startVerseKey),
        endKeyIdx: index("bp_annotation_span_end_key_idx").on(t.translationId, t.endVerseKey),

        anchorKindCheck: check(
            "bp_annotation_span_anchor_kind_check",
            sql`${t.anchorKind} in ('RANGE','TOKEN_SPAN','LOCATION')`,
        ),
        spanOrdCheck: check("bp_annotation_span_ordinal_check", sql`${t.spanOrdinal} >= 1`),
        spanCheck: check("bp_annotation_span_check", sql`${t.startVerseOrd} <= ${t.endVerseOrd}`),

        tokStartCheck: check(
            "bp_annotation_span_tok_start_check",
            sql`${t.startTokenIndex} is null or ${t.startTokenIndex} >= 0`,
        ),
        tokEndCheck: check(
            "bp_annotation_span_tok_end_check",
            sql`${t.endTokenIndex} is null or ${t.endTokenIndex} >= 0`,
        ),

        charStartCheck: check(
            "bp_annotation_span_char_start_check",
            sql`${t.startCharOffset} is null or ${t.startCharOffset} >= 0`,
        ),
        charEndCheck: check(
            "bp_annotation_span_char_end_check",
            sql`${t.endCharOffset} is null or ${t.endCharOffset} >= 0`,
        ),

        tokenPairCheck: check(
            "bp_annotation_span_token_pair_check",
            sql`(${t.startTokenIndex} is null) = (${t.endTokenIndex} is null)`,
        ),
        charPairCheck: check(
            "bp_annotation_span_char_pair_check",
            sql`(${t.startCharOffset} is null) = (${t.endCharOffset} is null)`,
        ),

        tokenSpanRequiresTranslationCheck: check(
            "bp_annotation_span_token_requires_translation_check",
            sql`${t.anchorKind} != 'TOKEN_SPAN' or ${t.translationId} is not null`,
        ),
        tokenSpanRequiresTokensCheck: check(
            "bp_annotation_span_token_requires_tokens_check",
            sql`${t.anchorKind} != 'TOKEN_SPAN' or (${t.startTokenIndex} is not null and ${t.endTokenIndex} is not null)`,
        ),
        locationSingleVerseCheck: check(
            "bp_annotation_span_location_single_verse_check",
            sql`${t.anchorKind} != 'LOCATION' or ${t.startVerseOrd} = ${t.endVerseOrd}`,
        ),

        sameVerseTokenOrderCheck: check(
            "bp_annotation_span_same_verse_token_order_check",
            sql`
                ${t.startTokenIndex} is null
                or ${t.endTokenIndex} is null
                or ${t.startVerseOrd} != ${t.endVerseOrd}
                or ${t.startTokenIndex} <= ${t.endTokenIndex}
            `,
        ),
        sameVerseCharOrderCheck: check(
            "bp_annotation_span_same_verse_char_order_check",
            sql`
                ${t.startCharOffset} is null
                or ${t.endCharOffset} is null
                or ${t.startVerseOrd} != ${t.endVerseOrd}
                or ${t.startCharOffset} <= ${t.endCharOffset}
            `,
        ),

        selectionVersionCheck: check(
            "bp_annotation_span_selection_version_check",
            sql`${t.selectionVersion} is null or ${t.selectionVersion} >= 1`,
        ),

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

export const bpAnnotationSpanBBox = sqliteTable(
    "bp_annotation_span_bbox",
    {
        annotationId: text("annotation_id").notNull(),
        spanOrdinal: integer("span_ordinal").notNull(),

        minX: real("min_x").notNull(),
        minY: real("min_y").notNull(),
        maxX: real("max_x").notNull(),
        maxY: real("max_y").notNull(),

        updatedAt: integer("updated_at").notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.annotationId, t.spanOrdinal] }),
        spanFk: foreignKey({
            columns: [t.annotationId, t.spanOrdinal],
            foreignColumns: [bpAnnotationSpan.annotationId, bpAnnotationSpan.spanOrdinal],
            name: "bp_annotation_span_bbox_span_fk",
        }).onDelete("cascade").onUpdate("cascade"),
        idx: index("bp_annotation_span_bbox_idx").on(t.annotationId, t.spanOrdinal),

        minXCheck: check("bp_annotation_span_bbox_min_x_check", sql`${t.minX} >= 0 and ${t.minX} <= 1`),
        minYCheck: check("bp_annotation_span_bbox_min_y_check", sql`${t.minY} >= 0 and ${t.minY} <= 1`),
        maxXCheck: check("bp_annotation_span_bbox_max_x_check", sql`${t.maxX} >= 0 and ${t.maxX} <= 1`),
        maxYCheck: check("bp_annotation_span_bbox_max_y_check", sql`${t.maxY} >= 0 and ${t.maxY} <= 1`),
        spanCheck: check(
            "bp_annotation_span_bbox_span_check",
            sql`${t.minX} <= ${t.maxX} and ${t.minY} <= ${t.maxY}`,
        ),
    }),
);

/* ------------------------------ Labels / Tags ------------------------------- */

export const bpAnnotationLabel = sqliteTable(
    "bp_annotation_label",
    {
        labelId: text("label_id").primaryKey(),
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
        nameCheck: check("bp_annotation_label_name_check", lenGt0(t.name)),
        nameNormCheck: check("bp_annotation_label_name_norm_check", lenGt0(t.nameNorm)),
        chronologyCheck: check(
            "bp_annotation_label_chronology_check",
            sql`${t.updatedAt} >= ${t.createdAt}`,
        ),
        deletedChronologyCheck: check(
            "bp_annotation_label_deleted_chronology_check",
            sql`${t.deletedAt} is null or ${t.deletedAt} >= ${t.createdAt}`,
        ),
    }),
);

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

/* -------------------------------- Palette ---------------------------------- */

export const bpAnnotationPalette = sqliteTable(
    "bp_annotation_palette",
    {
        paletteId: text("palette_id").primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => bpUser.id, { onDelete: "cascade", onUpdate: "cascade" }),

        kind: text("kind").notNull(),
        name: text("name").notNull(),
        nameNorm: text("name_norm").notNull(),

        color: text("color").notNull(),
        opacity: real("opacity"),

        createdAt: integer("created_at").notNull(),
        updatedAt: integer("updated_at").notNull(),
        deletedAt: integer("deleted_at"),
    },
    (t) => ({
        userIdx: index("bp_annotation_palette_user_idx").on(t.userId, t.kind, t.updatedAt),
        nameUq: uniqueIndex("bp_annotation_palette_name_uq").on(t.userId, t.kind, t.nameNorm),

        kindCheck: check("bp_annotation_palette_kind_check", sql`${t.kind} in ('HIGHLIGHT','INK','TAG')`),
        idCheck: check("bp_annotation_palette_id_check", lenGt0(t.paletteId)),
        nameCheck: check("bp_annotation_palette_name_check", lenGt0(t.name)),
        nameNormCheck: check("bp_annotation_palette_name_norm_check", lenGt0(t.nameNorm)),
        colorCheck: check("bp_annotation_palette_color_check", lenGe(t.color, 4)),
        opacityCheck: check(
            "bp_annotation_palette_opacity_check",
            sql`${t.opacity} is null or (${t.opacity} >= 0 and ${t.opacity} <= 1)`,
        ),
        chronologyCheck: check(
            "bp_annotation_palette_chronology_check",
            sql`${t.updatedAt} >= ${t.createdAt}`,
        ),
        deletedChronologyCheck: check(
            "bp_annotation_palette_deleted_chronology_check",
            sql`${t.deletedAt} is null or ${t.deletedAt} >= ${t.createdAt}`,
        ),
    }),
);

/* ----------------------------------- Ink ----------------------------------- */

export const bpAnnotationInkStroke = sqliteTable(
    "bp_annotation_ink_stroke",
    {
        strokeId: text("stroke_id").primaryKey(),
        annotationId: text("annotation_id")
            .notNull()
            .references(() => bpAnnotation.annotationId, { onDelete: "cascade", onUpdate: "cascade" }),

        ordinal: integer("ordinal").notNull(),
        tool: text("tool").notNull().default("PEN"),

        storageMode: text("storage_mode").notNull().default("INLINE"),

        paletteId: text("palette_id"),
        color: text("color"),
        opacity: real("opacity"),

        // Width in normalized local-span units.
        width: real("width"),

        brushJson: text("brush_json"),

        minX: real("min_x"),
        minY: real("min_y"),
        maxX: real("max_x"),
        maxY: real("max_y"),

        pointCount: integer("point_count"),

        // INLINE mode: full payload here.
        // CHUNKED mode: null here; use chunk rows.
        pointsJson: text("points_json"),

        createdAt: integer("created_at").notNull(),
        deletedAt: integer("deleted_at"),
    },
    (t) => ({
        annIdx: index("bp_annotation_ink_ann_idx").on(t.annotationId),
        ordUq: uniqueIndex("bp_annotation_ink_ord_uq").on(t.annotationId, t.ordinal),
        deletedIdx: index("bp_annotation_ink_deleted_idx").on(t.annotationId, t.deletedAt),

        storageModeCheck: check(
            "bp_annotation_ink_storage_mode_check",
            sql`${t.storageMode} in ('INLINE','CHUNKED')`,
        ),
        toolCheck: check(
            "bp_annotation_ink_tool_check",
            sql`${t.tool} in ('PEN','HIGHLIGHTER','ERASER')`,
        ),
        ordCheck: check("bp_annotation_ink_ord_check", sql`${t.ordinal} >= 1`),
        opacityCheck: check(
            "bp_annotation_ink_opacity_check",
            sql`${t.opacity} is null or (${t.opacity} >= 0 and ${t.opacity} <= 1)`,
        ),
        widthCheck: check(
            "bp_annotation_ink_width_check",
            sql`${t.width} is null or ${t.width} >= 0`,
        ),
        pointCountCheck: check(
            "bp_annotation_ink_point_count_check",
            sql`${t.pointCount} is null or ${t.pointCount} >= 0`,
        ),
        bboxMinXCheck: check(
            "bp_annotation_ink_min_x_check",
            sql`${t.minX} is null or (${t.minX} >= 0 and ${t.minX} <= 1)`,
        ),
        bboxMinYCheck: check(
            "bp_annotation_ink_min_y_check",
            sql`${t.minY} is null or (${t.minY} >= 0 and ${t.minY} <= 1)`,
        ),
        bboxMaxXCheck: check(
            "bp_annotation_ink_max_x_check",
            sql`${t.maxX} is null or (${t.maxX} >= 0 and ${t.maxX} <= 1)`,
        ),
        bboxMaxYCheck: check(
            "bp_annotation_ink_max_y_check",
            sql`${t.maxY} is null or (${t.maxY} >= 0 and ${t.maxY} <= 1)`,
        ),
        bboxOrderCheck: check(
            "bp_annotation_ink_bbox_order_check",
            sql`
                (
                    ${t.minX} is null and ${t.minY} is null and ${t.maxX} is null and ${t.maxY} is null
                ) or (
                    ${t.minX} is not null and ${t.minY} is not null and ${t.maxX} is not null and ${t.maxY} is not null
                    and ${t.minX} <= ${t.maxX}
                    and ${t.minY} <= ${t.maxY}
                )
            `,
        ),
        storagePayloadCheck: check(
            "bp_annotation_ink_storage_payload_check",
            sql`
                (${t.storageMode} = 'INLINE' and ${t.pointsJson} is not null)
                or (${t.storageMode} = 'CHUNKED' and ${t.pointsJson} is null)
            `,
        ),
        deletedChronologyCheck: check(
            "bp_annotation_ink_deleted_chronology_check",
            sql`${t.deletedAt} is null or ${t.deletedAt} >= ${t.createdAt}`,
        ),
    }),
);

export const bpAnnotationInkStrokeChunk = sqliteTable(
    "bp_annotation_ink_stroke_chunk",
    {
        strokeId: text("stroke_id")
            .notNull()
            .references(() => bpAnnotationInkStroke.strokeId, { onDelete: "cascade", onUpdate: "cascade" }),

        chunkIndex: integer("chunk_index").notNull(),
        pointsJson: text("points_json").notNull(),

        createdAt: integer("created_at").notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.strokeId, t.chunkIndex] }),
        idx: index("bp_annotation_ink_stroke_chunk_idx").on(t.strokeId),
        chunkCheck: check("bp_annotation_ink_stroke_chunk_check", sql`${t.chunkIndex} >= 0`),
        pointsCheck: check("bp_annotation_ink_stroke_chunk_points_check", lenGt0(t.pointsJson)),
    }),
);

/* ------------------------------ Attachments -------------------------------- */

export const bpAnnotationAttachment = sqliteTable(
    "bp_annotation_attachment",
    {
        attachmentId: text("attachment_id").primaryKey(),
        annotationId: text("annotation_id")
            .notNull()
            .references(() => bpAnnotation.annotationId, { onDelete: "cascade", onUpdate: "cascade" }),

        kind: text("kind").notNull(), // image | audio | file | ...
        mime: text("mime"),
        byteSize: integer("byte_size"),
        storageKey: text("storage_key").notNull(),
        originalName: text("original_name"),
        sha256: text("sha256"),

        createdAt: integer("created_at").notNull(),
        deletedAt: integer("deleted_at"),
    },
    (t) => ({
        annIdx: index("bp_annotation_attachment_ann_idx").on(t.annotationId),
        kindIdx: index("bp_annotation_attachment_kind_idx").on(t.kind),
        storageIdx: uniqueIndex("bp_annotation_attachment_storage_uq").on(t.storageKey),

        attachmentIdCheck: check("bp_annotation_attachment_id_check", lenGt0(t.attachmentId)),
        kindCheck: check("bp_annotation_attachment_kind_check", lenGt0(t.kind)),
        storageCheck: check("bp_annotation_attachment_storage_check", lenGt0(t.storageKey)),
        sizeCheck: check(
            "bp_annotation_attachment_size_check",
            sql`${t.byteSize} is null or ${t.byteSize} >= 0`,
        ),
        deletedChronologyCheck: check(
            "bp_annotation_attachment_deleted_chronology_check",
            sql`${t.deletedAt} is null or ${t.deletedAt} >= ${t.createdAt}`,
        ),
    }),
);

/* ------------------------------ Share / Export ------------------------------ */

export const bpAnnotationShare = sqliteTable(
    "bp_annotation_share",
    {
        shareId: text("share_id").primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => bpUser.id, { onDelete: "cascade", onUpdate: "cascade" }),

        privacy: text("privacy").notNull().default("PRIVATE"),
        scope: text("scope").notNull().default("ANNOTATIONS"),

        // Optional stable slug / token for public or shared-link retrieval.
        shareSlug: text("share_slug"),

        // For collection-scoped shares.
        collectionId: text("collection_id").references(() => bpAnnotationCollection.collectionId, {
            onDelete: "set null",
            onUpdate: "cascade",
        }),

        title: text("title"),
        note: text("note"),

        createdAt: integer("created_at").notNull(),
        updatedAt: integer("updated_at").notNull(),
        revokedAt: integer("revoked_at"),
    },
    (t) => ({
        userIdx: index("bp_annotation_share_user_idx").on(t.userId, t.updatedAt),
        shareSlugUq: uniqueIndex("bp_annotation_share_slug_uq").on(t.shareSlug),

        privacyCheck: check(
            "bp_annotation_share_privacy_check",
            sql`${t.privacy} in ('PRIVATE','SHARED_LINK','PUBLIC')`,
        ),
        scopeCheck: check(
            "bp_annotation_share_scope_check",
            sql`${t.scope} in ('ANNOTATIONS','COLLECTION')`,
        ),
        chronologyCheck: check(
            "bp_annotation_share_chronology_check",
            sql`${t.updatedAt} >= ${t.createdAt}`,
        ),
        revokedChronologyCheck: check(
            "bp_annotation_share_revoked_chronology_check",
            sql`${t.revokedAt} is null or ${t.revokedAt} >= ${t.createdAt}`,
        ),
        collectionScopeCheck: check(
            "bp_annotation_share_collection_scope_check",
            sql`${t.scope} != 'COLLECTION' or ${t.collectionId} is not null`,
        ),
    }),
);

export const bpAnnotationShareItem = sqliteTable(
    "bp_annotation_share_item",
    {
        shareId: text("share_id")
            .notNull()
            .references(() => bpAnnotationShare.shareId, { onDelete: "cascade", onUpdate: "cascade" }),

        annotationId: text("annotation_id")
            .notNull()
            .references(() => bpAnnotation.annotationId, { onDelete: "cascade", onUpdate: "cascade" }),

        ordinal: integer("ordinal").notNull(),
        createdAt: integer("created_at").notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.shareId, t.annotationId] }),
        shareOrdUq: uniqueIndex("bp_annotation_share_item_ord_uq").on(t.shareId, t.ordinal),
        annIdx: index("bp_annotation_share_item_ann_idx").on(t.annotationId),
        ordCheck: check("bp_annotation_share_item_ord_check", sql`${t.ordinal} >= 1`),
    }),
);

/* ------------------------------- Event Log --------------------------------- */

export const bpAnnotationEvent = sqliteTable(
    "bp_annotation_event",
    {
        eventId: text("event_id").primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => bpUser.id, { onDelete: "cascade", onUpdate: "cascade" }),

        annotationId: text("annotation_id"),
        annotationRev: integer("annotation_rev"),
        kind: text("kind").notNull(),
        at: integer("at").notNull(),

        // Client / sync metadata
        clientAt: integer("client_at"),
        deviceId: text("device_id"),
        idempotencyKey: text("idempotency_key"),

        // Optional detailed links
        strokeId: text("stroke_id"),
        labelId: text("label_id"),
        collectionId: text("collection_id"),

        payloadJson: text("payload_json"),
    },
    (t) => ({
        userIdx: index("bp_annotation_event_user_idx").on(t.userId, t.at),
        annIdx: index("bp_annotation_event_ann_idx").on(t.annotationId, t.at),
        kindIdx: index("bp_annotation_event_kind_idx").on(t.kind, t.at),
        annRevIdx: index("bp_annotation_event_ann_rev_idx").on(t.annotationId, t.annotationRev),

        kindCheck: check(
            "bp_annotation_event_kind_check",
            sql`${t.kind} in (
                'CREATE','UPDATE','DELETE','RESTORE',
                'ADD_STROKE','DEL_STROKE',
                'ADD_LABEL','DEL_LABEL',
                'MOVE_COLLECTION'
            )`,
        ),
        revCheck: check(
            "bp_annotation_event_rev_check",
            sql`${t.annotationRev} is null or ${t.annotationRev} >= 1`,
        ),
    }),
);

/* ---------------------------- Export convenience ---------------------------- */

export const annotationSchema = {
    bpAnnotationCollection,

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
    bpAnnotationShareItem,

    bpAnnotationEvent,
} as const;