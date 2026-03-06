// apps/api/src/db/schema.ts
// Biblia.to — Canonical Data Universe Schema v1.1 (SQLite / Drizzle)
//
// Orientation-only canon.
// - Stable Scripture identity: verse_key + verse_ord
// - Text is swappable: translation overlays
// - All links target ranges (ordinals), never strings
// - Uncertainty is first-class (time + geo precision/confidence)
// - No interpretation layer in canon (no commentary / doctrine / devotionals)
//
// Upgrades in this version:
// - Stronger tokenization model for partial selection / annotation anchoring
// - More exact text-layer metadata (hashes, source, revision-ish timestamps)
// - Safer uniqueness/indexes for common read paths
// - Cleaner checks and export surface
// - Fixed schema export typo
//
// NOTE:
// - Auth/Identity tables live in ./authSchema.ts
// - Reader annotations live in ./annotationSchema.ts (user data, not canon)
// - Re-exported here so the rest of the app can import from one surface.

import { sql } from "drizzle-orm";
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

// Re-export auth/identity + user-data annotation tables from dedicated modules.
export * from "./authSchema";
export * from "./annotationSchema";

const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

/* ---------------------------------- Enums ---------------------------------- */

export const Testament = { OT: "OT", NT: "NT" } as const;
export type Testament = (typeof Testament)[keyof typeof Testament];

export const LicenseKind = {
    PUBLIC_DOMAIN: "PUBLIC_DOMAIN",
    LICENSED: "LICENSED",
    CUSTOM: "CUSTOM",
} as const;
export type LicenseKind = (typeof LicenseKind)[keyof typeof LicenseKind];

export const ParagraphStyle = {
    PROSE: "PROSE",
    POETRY: "POETRY",
    LIST: "LIST",
    QUOTE: "QUOTE",
    LETTER: "LETTER",
} as const;
export type ParagraphStyle = (typeof ParagraphStyle)[keyof typeof ParagraphStyle];

export const DocUnitKind = {
    SECTION: "SECTION",
    SPEECH: "SPEECH",
    SONG: "SONG",
    LETTER_PART: "LETTER_PART",
    NARRATIVE_BLOCK: "NARRATIVE_BLOCK",
} as const;
export type DocUnitKind = (typeof DocUnitKind)[keyof typeof DocUnitKind];

export const EntityKind = {
    PERSON: "PERSON",
    PLACE: "PLACE",
    GROUP: "GROUP",
    DYNASTY: "DYNASTY",
    EMPIRE: "EMPIRE",
    REGION: "REGION",
    ARTIFACT: "ARTIFACT",
    OFFICE: "OFFICE",
} as const;
export type EntityKind = (typeof EntityKind)[keyof typeof EntityKind];

export const RelationKind = {
    PARENT_OF: "PARENT_OF",
    CHILD_OF: "CHILD_OF",
    SPOUSE_OF: "SPOUSE_OF",
    SIBLING_OF: "SIBLING_OF",
    RULES_OVER: "RULES_OVER",
    MEMBER_OF: "MEMBER_OF",
    ALLY_OF: "ALLY_OF",
    ENEMY_OF: "ENEMY_OF",
    SUCCEEDS: "SUCCEEDS",
} as const;
export type RelationKind = (typeof RelationKind)[keyof typeof RelationKind];

export const GeoType = {
    POINT: "POINT",
    BBOX: "BBOX",
    REGION_POLYGON: "REGION_POLYGON",
} as const;
export type GeoType = (typeof GeoType)[keyof typeof GeoType];

export const CalendarKind = {
    BCE_CE: "BCE_CE",
    ANNO_MUNDI: "ANNO_MUNDI",
} as const;
export type CalendarKind = (typeof CalendarKind)[keyof typeof CalendarKind];

export const EraTag = {
    PRIMEVAL: "PRIMEVAL",
    PATRIARCHS: "PATRIARCHS",
    EXODUS_WILDERNESS: "EXODUS_WILDERNESS",
    CONQUEST_JUDGES: "CONQUEST_JUDGES",
    UNITED_MONARCHY: "UNITED_MONARCHY",
    DIVIDED_KINGDOM: "DIVIDED_KINGDOM",
    EXILE: "EXILE",
    SECOND_TEMPLE: "SECOND_TEMPLE",
    GOSPELS: "GOSPELS",
    APOSTOLIC: "APOSTOLIC",
} as const;
export type EraTag = (typeof EraTag)[keyof typeof EraTag];

export const AnchorKind = {
    SETTING: "SETTING",
    EVENT_WINDOW: "EVENT_WINDOW",
    REIGN: "REIGN",
    JOURNEY_WINDOW: "JOURNEY_WINDOW",
} as const;
export type AnchorKind = (typeof AnchorKind)[keyof typeof AnchorKind];

export const EventKind = {
    BIRTH: "BIRTH",
    DEATH: "DEATH",
    BATTLE: "BATTLE",
    COVENANT: "COVENANT",
    EXODUS: "EXODUS",
    MIGRATION: "MIGRATION",
    SPEECH: "SPEECH",
    MIRACLE: "MIRACLE",
    PROPHECY: "PROPHECY",
    CAPTIVITY: "CAPTIVITY",
    RETURN: "RETURN",
    CRUCIFIXION: "CRUCIFIXION",
    RESURRECTION: "RESURRECTION",
    MISSION_JOURNEY: "MISSION_JOURNEY",
    COUNCIL: "COUNCIL",
    LETTER_WRITTEN: "LETTER_WRITTEN",
    OTHER: "OTHER",
} as const;
export type EventKind = (typeof EventKind)[keyof typeof EventKind];

export const ParticipantRole = {
    SUBJECT: "SUBJECT",
    AGENT: "AGENT",
    WITNESS: "WITNESS",
    OPPONENT: "OPPONENT",
    RULER: "RULER",
    PEOPLE: "PEOPLE",
    OTHER: "OTHER",
} as const;
export type ParticipantRole = (typeof ParticipantRole)[keyof typeof ParticipantRole];

export const LinkTargetKind = {
    ENTITY: "ENTITY",
    EVENT: "EVENT",
    ROUTE: "ROUTE",
    PLACE_GEO: "PLACE_GEO",
} as const;
export type LinkTargetKind = (typeof LinkTargetKind)[keyof typeof LinkTargetKind];

export const LinkKind = {
    MENTIONS: "MENTIONS",
    PRIMARY_SUBJECT: "PRIMARY_SUBJECT",
    LOCATION: "LOCATION",
    SETTING: "SETTING",
    JOURNEY_STEP: "JOURNEY_STEP",
    PARALLEL_ACCOUNT: "PARALLEL_ACCOUNT",
    QUOTE_SOURCE: "QUOTE_SOURCE",
    QUOTE_TARGET: "QUOTE_TARGET",
} as const;
export type LinkKind = (typeof LinkKind)[keyof typeof LinkKind];

export const CrossrefKind = {
    PARALLEL: "PARALLEL",
    QUOTE: "QUOTE",
    ALLUSION: "ALLUSION",
    TOPICAL: "TOPICAL",
} as const;
export type CrossrefKind = (typeof CrossrefKind)[keyof typeof CrossrefKind];

export const ReaderEventType = {
    VIEW_VERSE: "VIEW_VERSE",
    VIEW_CHAPTER: "VIEW_CHAPTER",
    SCROLL_BACK: "SCROLL_BACK",
    COPY_TEXT: "COPY_TEXT",
    OPEN_ENTITY: "OPEN_ENTITY",
    OPEN_MAP: "OPEN_MAP",
    OPEN_TIMELINE: "OPEN_TIMELINE",
    SEARCH: "SEARCH",
} as const;
export type ReaderEventType = (typeof ReaderEventType)[keyof typeof ReaderEventType];

export const SourceKind = {
    IMPORT: "IMPORT",
    MANUAL: "MANUAL",
    DATASET: "DATASET",
} as const;
export type SourceKind = (typeof SourceKind)[keyof typeof SourceKind];

export const AuditAction = {
    INSERT: "INSERT",
    UPDATE: "UPDATE",
    DELETE: "DELETE",
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

/**
 * Text/token layer enums
 * These are canon-safe because they describe textual structure and offsets,
 * not commentary or interpretation.
 */
export const TokenKind = {
    WORD: "WORD",
    PUNCT: "PUNCT",
    SPACE: "SPACE",
    LINEBREAK: "LINEBREAK",
    MARKER: "MARKER",
    NUMBER: "NUMBER",
    SYMBOL: "SYMBOL",
} as const;
export type TokenKind = (typeof TokenKind)[keyof typeof TokenKind];

export const NormalizationForm = {
    NONE: "NONE",
    SIMPLE: "SIMPLE",
    SEARCH_V1: "SEARCH_V1",
} as const;
export type NormalizationForm = (typeof NormalizationForm)[keyof typeof NormalizationForm];

/* ------------------------- 1) Canonical Scripture Layer ---------------------- */

export const bpBook = sqliteTable(
    "bp_book",
    {
        bookId: text("book_id").primaryKey(), // GEN, EXO, ...
        ordinal: integer("ordinal").notNull(), // 1..66
        testament: text("testament").notNull(), // OT | NT
        name: text("name").notNull(),
        nameShort: text("name_short").notNull(),
        chapters: integer("chapters").notNull(),
        osised: text("osised"),
        abbrs: text("abbrs"), // JSON array string
    },
    (t) => ({
        ordinalUniq: uniqueIndex("bp_book_ordinal_uniq").on(t.ordinal),
        ordCheck: check("bp_book_ordinal_check", sql`${t.ordinal} >= 1`),
        chaptersCheck: check("bp_book_chapters_check", sql`${t.chapters} >= 1`),
        testamentCheck: check("bp_book_testament_check", sql`${t.testament} in ('OT','NT')`),
        bookIdCheck: check("bp_book_book_id_check", sql`length(${t.bookId}) between 2 and 8`),
        nameCheck: check("bp_book_name_check", sql`length(${t.name}) > 0`),
        shortNameCheck: check("bp_book_name_short_check", sql`length(${t.nameShort}) > 0`),
    }),
);

export const bpVerse = sqliteTable(
    "bp_verse",
    {
        verseKey: text("verse_key").primaryKey(), // BOOK.CHAPTER.VERSE (GEN.1.1)
        bookId: text("book_id").notNull(),
        chapter: integer("chapter").notNull(),
        verse: integer("verse").notNull(),
        verseOrd: integer("verse_ord").notNull(), // SQLite INTEGER is 64-bit
        chapterOrd: integer("chapter_ord"),

        isSuperscription: integer("is_superscription", { mode: "boolean" }).notNull().default(false),
        isDeuterocanon: integer("is_deuterocanon", { mode: "boolean" }).notNull().default(false),

        // Optional exact source ordering helpers for specialized exports/imports
        sourceBookOrdinal: integer("source_book_ordinal"),
        sourceChapterOrdinal: integer("source_chapter_ordinal"),
        sourceVerseOrdinal: integer("source_verse_ordinal"),
    },
    (t) => ({
        ordUniq: uniqueIndex("bp_verse_ord_uniq").on(t.verseOrd),
        byBcvUniq: uniqueIndex("bp_verse_bcv_uniq").on(t.bookId, t.chapter, t.verse),
        bookIdx: index("bp_verse_book_idx").on(t.bookId, t.chapter, t.verse),
        chapterOrdIdx: index("bp_verse_chapter_ord_idx").on(t.chapterOrd, t.verseOrd),
        chapterCheck: check("bp_verse_chapter_check", sql`${t.chapter} >= 1`),
        verseCheck: check("bp_verse_verse_check", sql`${t.verse} >= 1`),
        ordCheck: check("bp_verse_ord_check", sql`${t.verseOrd} >= 1`),
        sourceBookOrdCheck: check(
            "bp_verse_source_book_ordinal_check",
            sql`${t.sourceBookOrdinal} is null or ${t.sourceBookOrdinal} >= 1`,
        ),
        sourceChapterOrdCheck: check(
            "bp_verse_source_chapter_ordinal_check",
            sql`${t.sourceChapterOrdinal} is null or ${t.sourceChapterOrdinal} >= 1`,
        ),
        sourceVerseOrdCheck: check(
            "bp_verse_source_verse_ordinal_check",
            sql`${t.sourceVerseOrdinal} is null or ${t.sourceVerseOrdinal} >= 1`,
        ),
    }),
);

export const bpChapter = sqliteTable(
    "bp_chapter",
    {
        bookId: text("book_id").notNull(),
        chapter: integer("chapter").notNull(),
        chapterOrd: integer("chapter_ord"),
        startVerseOrd: integer("start_verse_ord").notNull(),
        endVerseOrd: integer("end_verse_ord").notNull(),
        verseCount: integer("verse_count").notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.bookId, t.chapter] }),
        chapterOrdUniq: uniqueIndex("bp_chapter_chapter_ord_uniq").on(t.chapterOrd),
        rangeIdx: index("bp_chapter_range_idx").on(t.bookId, t.startVerseOrd, t.endVerseOrd),
        chapterCheck: check("bp_chapter_chapter_check", sql`${t.chapter} >= 1`),
        chapterOrdCheck: check(
            "bp_chapter_chapter_ord_check",
            sql`${t.chapterOrd} is null or ${t.chapterOrd} >= 1`,
        ),
        countCheck: check("bp_chapter_verse_count_check", sql`${t.verseCount} >= 1`),
        spanCheck: check("bp_chapter_span_check", sql`${t.startVerseOrd} <= ${t.endVerseOrd}`),
    }),
);

/* --------------------------- 2) Translation / Text -------------------------- */

export const bpTranslation = sqliteTable(
    "bp_translation",
    {
        translationId: text("translation_id").primaryKey(), // KJV, ESV, BP1, ...
        name: text("name").notNull(),
        language: text("language").notNull(), // ISO-ish, e.g. en
        derivedFrom: text("derived_from"),

        licenseKind: text("license_kind").notNull(),
        licenseText: text("license_text"),
        sourceUrl: text("source_url"),

        publisher: text("publisher"),
        editionLabel: text("edition_label"),
        abbreviation: text("abbreviation"),

        normalizationForm: text("normalization_form").notNull().default("SIMPLE"),

        isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
        isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),

        createdAt: text("created_at").notNull().default(nowIso),
        updatedAt: text("updated_at").notNull().default(nowIso),
    },
    (t) => ({
        nameIdx: index("bp_translation_name_idx").on(t.name),
        publicIdx: index("bp_translation_public_idx").on(t.isPublic, t.isDefault),
        licenseKindCheck: check(
            "bp_translation_license_kind_check",
            sql`${t.licenseKind} in ('PUBLIC_DOMAIN','LICENSED','CUSTOM')`,
        ),
        normFormCheck: check(
            "bp_translation_normalization_form_check",
            sql`${t.normalizationForm} in ('NONE','SIMPLE','SEARCH_V1')`,
        ),
        idCheck: check("bp_translation_id_check", sql`length(${t.translationId}) > 0`),
        nameCheck: check("bp_translation_name_check", sql`length(${t.name}) > 0`),
        langCheck: check("bp_translation_language_check", sql`length(${t.language}) >= 2`),
    }),
);

export const bpVerseText = sqliteTable(
    "bp_verse_text",
    {
        translationId: text("translation_id").notNull(),
        verseKey: text("verse_key").notNull(),

        text: text("text").notNull(),
        textNorm: text("text_norm"),

        hash: text("hash"), // canonical verse text hash
        textLength: integer("text_length"), // character count
        tokenCount: integer("token_count"), // populated after tokenization
        wordCount: integer("word_count"), // populated after tokenization

        source: text("source"),
        sourceRevision: text("source_revision"),

        updatedAt: text("updated_at").notNull().default(nowIso),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.translationId, t.verseKey] }),
        idx: index("bp_verse_text_idx").on(t.translationId, t.verseKey),
        updatedIdx: index("bp_verse_text_updated_idx").on(t.updatedAt),
        hashIdx: index("bp_verse_text_hash_idx").on(t.hash),
        textCheck: check("bp_verse_text_text_check", sql`length(${t.text}) > 0`),
        lengthCheck: check("bp_verse_text_length_check", sql`${t.textLength} is null or ${t.textLength} >= 0`),
        tokenCountCheck: check("bp_verse_text_token_count_check", sql`${t.tokenCount} is null or ${t.tokenCount} >= 0`),
        wordCountCheck: check("bp_verse_text_word_count_check", sql`${t.wordCount} is null or ${t.wordCount} >= 0`),
    }),
);

/**
 * Rich tokenization layer for:
 * - partial highlighting
 * - exact copy/export of sub-verse selections
 * - stable annotation anchoring
 * - better search/lookup/debugging
 *
 * IMPORTANT:
 * - tokenIndex is the stable display-order token ordinal within a verse.
 * - charStart/charEnd are offsets into bp_verse_text.text (UTF-16 JS offsets if generated in TS).
 * - Tokens may include spaces/punctuation. Do NOT discard them if exact reconstruction matters.
 */
export const bpToken = sqliteTable(
    "bp_token",
    {
        translationId: text("translation_id").notNull(),
        verseKey: text("verse_key").notNull(),
        tokenIndex: integer("token_index").notNull(),

        token: text("token").notNull(),
        tokenNorm: text("token_norm").notNull(),
        tokenKind: text("token_kind").notNull().default("WORD"),

        charStart: integer("char_start").notNull(),
        charEnd: integer("char_end").notNull(), // exclusive

        isWordLike: integer("is_word_like", { mode: "boolean" }).notNull().default(true),
        breakAfter: integer("break_after", { mode: "boolean" }).notNull().default(false),

        // Optional grouping helpers
        surfaceGroup: integer("surface_group"),
        lineOrdinal: integer("line_ordinal"),

        hash: text("hash"),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.translationId, t.verseKey, t.tokenIndex] }),
        idx: index("bp_token_idx").on(t.translationId, t.verseKey, t.tokenIndex),
        normIdx: index("bp_token_norm_idx").on(t.tokenNorm),
        charIdx: index("bp_token_char_idx").on(t.translationId, t.verseKey, t.charStart, t.charEnd),
        kindIdx: index("bp_token_kind_idx").on(t.translationId, t.tokenKind),

        tokCheck: check("bp_token_token_check", sql`length(${t.token}) > 0`),
        normCheck: check("bp_token_norm_check", sql`length(${t.tokenNorm}) >= 0`),
        tokenIndexCheck: check("bp_token_token_index_check", sql`${t.tokenIndex} >= 0`),
        kindCheck: check(
            "bp_token_kind_check",
            sql`${t.tokenKind} in ('WORD','PUNCT','SPACE','LINEBREAK','MARKER','NUMBER','SYMBOL')`,
        ),
        charStartCheck: check("bp_token_char_start_check", sql`${t.charStart} >= 0`),
        charEndCheck: check("bp_token_char_end_check", sql`${t.charEnd} > ${t.charStart}`),
        surfaceGroupCheck: check(
            "bp_token_surface_group_check",
            sql`${t.surfaceGroup} is null or ${t.surfaceGroup} >= 0`,
        ),
        lineOrdinalCheck: check(
            "bp_token_line_ordinal_check",
            sql`${t.lineOrdinal} is null or ${t.lineOrdinal} >= 0`,
        ),
    }),
);

/**
 * Optional span map for quick lookup of common token spans inside a verse.
 * Useful later for fast partial range reconstruction, cached text selections,
 * and selection snapping without re-scanning token arrays every time.
 */
export const bpTokenSpan = sqliteTable(
    "bp_token_span",
    {
        translationId: text("translation_id").notNull(),
        verseKey: text("verse_key").notNull(),
        spanId: text("span_id").notNull(), // app-generated stable id

        startTokenIndex: integer("start_token_index").notNull(),
        endTokenIndex: integer("end_token_index").notNull(), // inclusive

        charStart: integer("char_start").notNull(),
        charEnd: integer("char_end").notNull(), // exclusive

        text: text("text"),
        hash: text("hash"),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.translationId, t.verseKey, t.spanId] }),
        idx: index("bp_token_span_idx").on(t.translationId, t.verseKey, t.startTokenIndex, t.endTokenIndex),
        charIdx: index("bp_token_span_char_idx").on(t.translationId, t.verseKey, t.charStart, t.charEnd),
        startCheck: check("bp_token_span_start_check", sql`${t.startTokenIndex} >= 0`),
        endCheck: check("bp_token_span_end_check", sql`${t.endTokenIndex} >= ${t.startTokenIndex}`),
        charStartCheck: check("bp_token_span_char_start_check", sql`${t.charStart} >= 0`),
        charEndCheck: check("bp_token_span_char_end_check", sql`${t.charEnd} > ${t.charStart}`),
    }),
);

/* ----------------------- 3) Range & Structural Layer ------------------------ */

export const bpRange = sqliteTable(
    "bp_range",
    {
        rangeId: text("range_id").primaryKey(), // uuid / cuid
        startVerseOrd: integer("start_verse_ord").notNull(),
        endVerseOrd: integer("end_verse_ord").notNull(),
        startVerseKey: text("start_verse_key").notNull(),
        endVerseKey: text("end_verse_key").notNull(),

        label: text("label"),

        verseCount: integer("verse_count"),
        chapterCount: integer("chapter_count"),

        createdAt: text("created_at").notNull().default(nowIso),
    },
    (t) => ({
        ordIdx: index("bp_range_ord_idx").on(t.startVerseOrd, t.endVerseOrd),
        startKeyIdx: index("bp_range_start_key_idx").on(t.startVerseKey, t.endVerseKey),
        spanCheck: check("bp_range_span_check", sql`${t.startVerseOrd} <= ${t.endVerseOrd}`),
        verseCountCheck: check("bp_range_verse_count_check", sql`${t.verseCount} is null or ${t.verseCount} >= 1`),
        chapterCountCheck: check("bp_range_chapter_count_check", sql`${t.chapterCount} is null or ${t.chapterCount} >= 1`),
    }),
);

export const bpPericope = sqliteTable(
    "bp_pericope",
    {
        pericopeId: text("pericope_id").primaryKey(),
        bookId: text("book_id").notNull(),
        rangeId: text("range_id").notNull(),
        title: text("title").notNull(),
        source: text("source").notNull(),
        confidence: real("confidence"),
        rank: integer("rank"),
        sourceRevision: text("source_revision"),
    },
    (t) => ({
        bookIdx: index("bp_pericope_book_idx").on(t.bookId, t.rank),
        rangeIdx: index("bp_pericope_range_idx").on(t.rangeId),
        rankCheck: check("bp_pericope_rank_check", sql`${t.rank} is null or ${t.rank} >= 0`),
        confCheck: check(
            "bp_pericope_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
        titleCheck: check("bp_pericope_title_check", sql`length(${t.title}) > 0`),
    }),
);

export const bpParagraph = sqliteTable(
    "bp_paragraph",
    {
        paragraphId: text("paragraph_id").primaryKey(),
        translationId: text("translation_id").notNull(),
        rangeId: text("range_id").notNull(),
        style: text("style").notNull(),
        indent: integer("indent").notNull().default(0),
        source: text("source").notNull(),
        sourceRevision: text("source_revision"),
        ordinal: integer("ordinal"),
    },
    (t) => ({
        rangeIdx: index("bp_paragraph_range_idx").on(t.translationId, t.rangeId),
        ordIdx: index("bp_paragraph_ord_idx").on(t.translationId, t.ordinal),
        styleCheck: check(
            "bp_paragraph_style_check",
            sql`${t.style} in ('PROSE','POETRY','LIST','QUOTE','LETTER')`,
        ),
        indentCheck: check("bp_paragraph_indent_check", sql`${t.indent} >= 0`),
        ordinalCheck: check("bp_paragraph_ordinal_check", sql`${t.ordinal} is null or ${t.ordinal} >= 0`),
    }),
);

export const bpDocUnit = sqliteTable(
    "bp_doc_unit",
    {
        unitId: text("unit_id").primaryKey(),
        kind: text("kind").notNull(),
        title: text("title").notNull(),
        rangeId: text("range_id").notNull(),
        source: text("source").notNull(),
        confidence: real("confidence"),
        ordinal: integer("ordinal"),
        parentUnitId: text("parent_unit_id"),
    },
    (t) => ({
        kindCheck: check(
            "bp_doc_unit_kind_check",
            sql`${t.kind} in ('SECTION','SPEECH','SONG','LETTER_PART','NARRATIVE_BLOCK')`,
        ),
        rangeIdx: index("bp_doc_unit_range_idx").on(t.rangeId),
        ordIdx: index("bp_doc_unit_ord_idx").on(t.ordinal),
        parentIdx: index("bp_doc_unit_parent_idx").on(t.parentUnitId),
        confCheck: check(
            "bp_doc_unit_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
        ordinalCheck: check("bp_doc_unit_ordinal_check", sql`${t.ordinal} is null or ${t.ordinal} >= 0`),
        notSelfCheck: check(
            "bp_doc_unit_not_self_check",
            sql`${t.parentUnitId} is null or ${t.parentUnitId} <> ${t.unitId}`,
        ),
    }),
);

/* --------------------------- 4) Entity Universe ----------------------------- */

export const bpEntity = sqliteTable(
    "bp_entity",
    {
        entityId: text("entity_id").primaryKey(),
        kind: text("kind").notNull(),
        canonicalName: text("canonical_name").notNull(),
        slug: text("slug").notNull(),
        summaryNeutral: text("summary_neutral"),
        confidence: real("confidence"),
        createdAt: text("created_at").notNull().default(nowIso),
        updatedAt: text("updated_at").notNull().default(nowIso),
    },
    (t) => ({
        slugUniq: uniqueIndex("bp_entity_slug_uniq").on(t.slug),
        nameIdx: index("bp_entity_name_idx").on(t.canonicalName),
        kindIdx: index("bp_entity_kind_idx").on(t.kind),
        kindCheck: check(
            "bp_entity_kind_check",
            sql`${t.kind} in ('PERSON','PLACE','GROUP','DYNASTY','EMPIRE','REGION','ARTIFACT','OFFICE')`,
        ),
        confCheck: check(
            "bp_entity_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
        nameCheck: check("bp_entity_name_check", sql`length(${t.canonicalName}) > 0`),
        slugCheck: check("bp_entity_slug_check", sql`length(${t.slug}) > 0`),
    }),
);

export const bpEntityName = sqliteTable(
    "bp_entity_name",
    {
        entityNameId: text("entity_name_id").primaryKey(),
        entityId: text("entity_id").notNull(),
        name: text("name").notNull(),
        nameNorm: text("name_norm").notNull(),
        language: text("language"),
        isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
        source: text("source"),
        confidence: real("confidence"),
    },
    (t) => ({
        normIdx: index("bp_entity_name_norm_idx").on(t.nameNorm),
        entityIdx: index("bp_entity_name_entity_idx").on(t.entityId, t.isPrimary),
        confCheck: check(
            "bp_entity_name_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
        nameCheck: check("bp_entity_name_name_check", sql`length(${t.name}) > 0`),
        nameNormCheck: check("bp_entity_name_name_norm_check", sql`length(${t.nameNorm}) >= 0`),
    }),
);

export const bpEntityRelation = sqliteTable(
    "bp_entity_relation",
    {
        relationId: text("relation_id").primaryKey(),
        fromEntityId: text("from_entity_id").notNull(),
        toEntityId: text("to_entity_id").notNull(),
        kind: text("kind").notNull(),
        timeSpanId: text("time_span_id"),
        source: text("source").notNull(),
        confidence: real("confidence"),
        noteNeutral: text("note_neutral"),
    },
    (t) => ({
        fromIdx: index("bp_entity_relation_from_idx").on(t.fromEntityId, t.kind),
        toIdx: index("bp_entity_relation_to_idx").on(t.toEntityId, t.kind),
        kindIdx: index("bp_entity_relation_kind_idx").on(t.kind),
        kindCheck: check(
            "bp_entity_relation_kind_check",
            sql`${t.kind} in ('PARENT_OF','CHILD_OF','SPOUSE_OF','SIBLING_OF','RULES_OVER','MEMBER_OF','ALLY_OF','ENEMY_OF','SUCCEEDS')`,
        ),
        notSelf: check("bp_entity_relation_not_self", sql`not (${t.fromEntityId} = ${t.toEntityId})`),
        confCheck: check(
            "bp_entity_relation_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
    }),
);

/* ----------------------------- 5) Geography -------------------------------- */

export const bpPlaceGeo = sqliteTable(
    "bp_place_geo",
    {
        placeGeoId: text("place_geo_id").primaryKey(),
        entityId: text("entity_id").notNull(), // bp_entity(kind=PLACE)
        geoType: text("geo_type").notNull(),

        lat: real("lat"),
        lng: real("lng"),

        bbox: text("bbox"), // JSON
        polygon: text("polygon"), // GeoJSON

        precisionM: real("precision_m"),
        source: text("source").notNull(),
        confidence: real("confidence"),
    },
    (t) => ({
        entityIdx: index("bp_place_geo_entity_idx").on(t.entityId),
        typeCheck: check("bp_place_geo_type_check", sql`${t.geoType} in ('POINT','BBOX','REGION_POLYGON')`),
        latCheck: check("bp_place_geo_lat_check", sql`${t.lat} is null or (${t.lat} >= -90 and ${t.lat} <= 90)`),
        lngCheck: check("bp_place_geo_lng_check", sql`${t.lng} is null or (${t.lng} >= -180 and ${t.lng} <= 180)`),
        precisionCheck: check(
            "bp_place_geo_precision_check",
            sql`${t.precisionM} is null or ${t.precisionM} >= 0`,
        ),
        confCheck: check(
            "bp_place_geo_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
    }),
);

export const bpRoute = sqliteTable(
    "bp_route",
    {
        routeId: text("route_id").primaryKey(),
        title: text("title").notNull(),
        source: text("source").notNull(),
        confidence: real("confidence"),
        summaryNeutral: text("summary_neutral"),
    },
    (t) => ({
        titleIdx: index("bp_route_title_idx").on(t.title),
        confCheck: check(
            "bp_route_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
        titleCheck: check("bp_route_title_check", sql`length(${t.title}) > 0`),
    }),
);

export const bpRouteStep = sqliteTable(
    "bp_route_step",
    {
        routeStepId: text("route_step_id").primaryKey(),
        routeId: text("route_id").notNull(),
        ordinal: integer("ordinal").notNull(),
        placeEntityId: text("place_entity_id").notNull(),
        rangeId: text("range_id"),
        noteNeutral: text("note_neutral"),
        distanceKm: real("distance_km"),
    },
    (t) => ({
        ordUniq: uniqueIndex("bp_route_step_ord_uniq").on(t.routeId, t.ordinal),
        routeIdx: index("bp_route_step_route_idx").on(t.routeId, t.ordinal),
        placeIdx: index("bp_route_step_place_idx").on(t.placeEntityId),
        ordCheck: check("bp_route_step_ord_check", sql`${t.ordinal} >= 1`),
        distanceCheck: check(
            "bp_route_step_distance_check",
            sql`${t.distanceKm} is null or ${t.distanceKm} >= 0`,
        ),
    }),
);

/* ----------------------- 6) Time / Chronology (Uncertain) ------------------- */

export const bpTimeSpan = sqliteTable(
    "bp_time_span",
    {
        timeSpanId: text("time_span_id").primaryKey(),

        startYear: integer("start_year"),
        endYear: integer("end_year"),

        startYearMin: integer("start_year_min"),
        startYearMax: integer("start_year_max"),
        endYearMin: integer("end_year_min"),
        endYearMax: integer("end_year_max"),

        calendar: text("calendar").notNull().default("BCE_CE"),
        eraTag: text("era_tag"),

        source: text("source").notNull(),
        confidence: real("confidence"),
    },
    (t) => ({
        calCheck: check("bp_time_span_calendar_check", sql`${t.calendar} in ('BCE_CE','ANNO_MUNDI')`),
        eraCheck: check(
            "bp_time_span_era_check",
            sql`${t.eraTag} is null or ${t.eraTag} in (
                'PRIMEVAL','PATRIARCHS','EXODUS_WILDERNESS','CONQUEST_JUDGES','UNITED_MONARCHY',
                'DIVIDED_KINGDOM','EXILE','SECOND_TEMPLE','GOSPELS','APOSTOLIC'
            )`,
        ),
        confCheck: check(
            "bp_time_span_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
    }),
);

export const bpTimelineAnchor = sqliteTable(
    "bp_timeline_anchor",
    {
        anchorId: text("anchor_id").primaryKey(),
        rangeId: text("range_id").notNull(),
        timeSpanId: text("time_span_id").notNull(),
        kind: text("kind").notNull(),
        source: text("source").notNull(),
        confidence: real("confidence"),
    },
    (t) => ({
        rangeIdx: index("bp_timeline_anchor_range_idx").on(t.rangeId),
        timeIdx: index("bp_timeline_anchor_time_idx").on(t.timeSpanId),
        kindIdx: index("bp_timeline_anchor_kind_idx").on(t.kind),
        kindCheck: check(
            "bp_timeline_anchor_kind_check",
            sql`${t.kind} in ('SETTING','EVENT_WINDOW','REIGN','JOURNEY_WINDOW')`,
        ),
        confCheck: check(
            "bp_timeline_anchor_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
    }),
);

/* ------------------------------ 7) Events ---------------------------------- */

export const bpEvent = sqliteTable(
    "bp_event",
    {
        eventId: text("event_id").primaryKey(),
        canonicalTitle: text("canonical_title").notNull(),
        kind: text("kind").notNull(),
        primaryRangeId: text("primary_range_id").notNull(),
        timeSpanId: text("time_span_id"),
        primaryPlaceId: text("primary_place_id"), // entity_id(kind=PLACE)
        source: text("source").notNull(),
        confidence: real("confidence"),
        summaryNeutral: text("summary_neutral"),
    },
    (t) => ({
        kindIdx: index("bp_event_kind_idx").on(t.kind),
        rangeIdx: index("bp_event_range_idx").on(t.primaryRangeId),
        placeIdx: index("bp_event_place_idx").on(t.primaryPlaceId),
        timeIdx: index("bp_event_time_idx").on(t.timeSpanId),
        kindCheck: check(
            "bp_event_kind_check",
            sql`${t.kind} in (
                'BIRTH','DEATH','BATTLE','COVENANT','EXODUS','MIGRATION','SPEECH','MIRACLE','PROPHECY',
                'CAPTIVITY','RETURN','CRUCIFIXION','RESURRECTION','MISSION_JOURNEY','COUNCIL','LETTER_WRITTEN','OTHER'
            )`,
        ),
        confCheck: check(
            "bp_event_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
        titleCheck: check("bp_event_title_check", sql`length(${t.canonicalTitle}) > 0`),
    }),
);

export const bpEventParticipant = sqliteTable(
    "bp_event_participant",
    {
        eventParticipantId: text("event_participant_id").primaryKey(),
        eventId: text("event_id").notNull(),
        entityId: text("entity_id").notNull(),
        role: text("role").notNull(),
        confidence: real("confidence"),
    },
    (t) => ({
        eventIdx: index("bp_event_participant_event_idx").on(t.eventId),
        entityIdx: index("bp_event_participant_entity_idx").on(t.entityId),
        roleIdx: index("bp_event_participant_role_idx").on(t.role),
        roleCheck: check(
            "bp_event_participant_role_check",
            sql`${t.role} in ('SUBJECT','AGENT','WITNESS','OPPONENT','RULER','PEOPLE','OTHER')`,
        ),
        confCheck: check(
            "bp_event_participant_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
    }),
);

/* -------------------- 8) Link Layer (Orientation Graph) --------------------- */

export const bpLink = sqliteTable(
    "bp_link",
    {
        linkId: text("link_id").primaryKey(),
        rangeId: text("range_id").notNull(),
        targetKind: text("target_kind").notNull(),
        targetId: text("target_id").notNull(),
        linkKind: text("link_kind").notNull(),
        weight: integer("weight").notNull().default(1),
        source: text("source").notNull(),
        confidence: real("confidence"),
    },
    (t) => ({
        rangeIdx: index("bp_link_range_idx").on(t.rangeId, t.linkKind),
        targetIdx: index("bp_link_target_idx").on(t.targetKind, t.targetId),
        kindIdx: index("bp_link_kind_idx").on(t.linkKind),
        targetKindCheck: check(
            "bp_link_target_kind_check",
            sql`${t.targetKind} in ('ENTITY','EVENT','ROUTE','PLACE_GEO')`,
        ),
        linkKindCheck: check(
            "bp_link_link_kind_check",
            sql`${t.linkKind} in (
                'MENTIONS','PRIMARY_SUBJECT','LOCATION','SETTING','JOURNEY_STEP',
                'PARALLEL_ACCOUNT','QUOTE_SOURCE','QUOTE_TARGET'
            )`,
        ),
        weightCheck: check("bp_link_weight_check", sql`${t.weight} >= 1`),
        confCheck: check(
            "bp_link_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
    }),
);

export const bpCrossref = sqliteTable(
    "bp_crossref",
    {
        crossrefId: text("crossref_id").primaryKey(),
        fromRangeId: text("from_range_id").notNull(),
        toRangeId: text("to_range_id").notNull(),
        kind: text("kind").notNull(),
        source: text("source").notNull(),
        confidence: real("confidence"),
        noteNeutral: text("note_neutral"),
    },
    (t) => ({
        fromIdx: index("bp_crossref_from_idx").on(t.fromRangeId, t.kind),
        toIdx: index("bp_crossref_to_idx").on(t.toRangeId, t.kind),
        kindIdx: index("bp_crossref_kind_idx").on(t.kind),
        kindCheck: check("bp_crossref_kind_check", sql`${t.kind} in ('PARALLEL','QUOTE','ALLUSION','TOPICAL')`),
        confCheck: check(
            "bp_crossref_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
        notSelfCheck: check(
            "bp_crossref_not_self_check",
            sql`not (${t.fromRangeId} = ${t.toRangeId} and ${t.kind} = 'PARALLEL')`,
        ),
    }),
);

/* ------------------------- 9) Search & Retrieval (Optional) ----------------- */

export const bpSearchQueryLog = sqliteTable(
    "bp_search_query_log",
    {
        queryId: text("query_id").primaryKey(),
        anonId: text("anon_id"),
        query: text("query").notNull(),
        queryNorm: text("query_norm").notNull(),
        translationId: text("translation_id"),
        hits: integer("hits").notNull().default(0),
        createdAt: text("created_at").notNull().default(nowIso),
    },
    (t) => ({
        normIdx: index("bp_search_query_log_norm_idx").on(t.queryNorm),
        createdIdx: index("bp_search_query_log_created_idx").on(t.createdAt),
        translationIdx: index("bp_search_query_log_translation_idx").on(t.translationId, t.createdAt),
        hitsCheck: check("bp_search_query_log_hits_check", sql`${t.hits} >= 0`),
        queryCheck: check("bp_search_query_log_query_check", sql`length(${t.query}) > 0`),
    }),
);

/* -------------------------- 10) Reader Telemetry (Optional) ----------------- */

export const bpReaderEvent = sqliteTable(
    "bp_reader_event",
    {
        readerEventId: text("reader_event_id").primaryKey(),
        anonId: text("anon_id").notNull(),
        eventType: text("event_type").notNull(),
        translationId: text("translation_id"),
        verseKey: text("verse_key"),
        rangeId: text("range_id"),
        entityId: text("entity_id"),
        durationMs: integer("duration_ms"),
        createdAt: text("created_at").notNull().default(nowIso),
    },
    (t) => ({
        anonIdx: index("bp_reader_event_anon_idx").on(t.anonId, t.createdAt),
        typeIdx: index("bp_reader_event_type_idx").on(t.eventType, t.createdAt),
        verseIdx: index("bp_reader_event_verse_idx").on(t.translationId, t.verseKey, t.createdAt),
        typeCheck: check(
            "bp_reader_event_type_check",
            sql`${t.eventType} in (
                'VIEW_VERSE','VIEW_CHAPTER','SCROLL_BACK','COPY_TEXT','OPEN_ENTITY','OPEN_MAP','OPEN_TIMELINE','SEARCH'
            )`,
        ),
        durCheck: check("bp_reader_event_duration_check", sql`${t.durationMs} is null or ${t.durationMs} >= 0`),
    }),
);

/* --------------------- 11) Provenance & Integrity (Optional) ---------------- */

export const bpSource = sqliteTable(
    "bp_source",
    {
        sourceId: text("source_id").primaryKey(),
        name: text("name").notNull(),
        kind: text("kind").notNull(),
        version: text("version"),
        url: text("url"),
        license: text("license"),
        notes: text("notes"),
    },
    (t) => ({
        nameIdx: index("bp_source_name_idx").on(t.name),
        kindCheck: check("bp_source_kind_check", sql`${t.kind} in ('IMPORT','MANUAL','DATASET')`),
        nameCheck: check("bp_source_name_check", sql`length(${t.name}) > 0`),
    }),
);

export const bpAudit = sqliteTable(
    "bp_audit",
    {
        auditId: text("audit_id").primaryKey(),
        entityKind: text("entity_kind").notNull(),
        entityId: text("entity_id").notNull(),
        action: text("action").notNull(),
        before: text("before"), // JSON
        after: text("after"), // JSON
        sourceId: text("source_id"),
        createdAt: text("created_at").notNull().default(nowIso),
    },
    (t) => ({
        entIdx: index("bp_audit_entity_idx").on(t.entityKind, t.entityId, t.createdAt),
        actionIdx: index("bp_audit_action_idx").on(t.action, t.createdAt),
        sourceIdx: index("bp_audit_source_idx").on(t.sourceId, t.createdAt),
        actionCheck: check("bp_audit_action_check", sql`${t.action} in ('INSERT','UPDATE','DELETE')`),
    }),
);

/* ------------------------------------ FTS ----------------------------------- */
/**
 * Optional FTS5 extras for verse text search.
 * Applied by migrate.ts (extras runner), not by Drizzle schema.
 *
 * Notes:
 * - Keeps translation-aware verse text search
 * - Adds optional token FTS for future word/phrase acceleration
 * - token FTS intentionally excludes SPACE/LINEBREAK rows
 */
export const FTS_MIGRATION_SQL = `
-- ---------------------------------------------------------------------------
-- Verse text FTS
-- ---------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS bp_verse_text_fts USING fts5(
  translation_id UNINDEXED,
  verse_key UNINDEXED,
  text,
  content='bp_verse_text',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS bp_verse_text_ai AFTER INSERT ON bp_verse_text BEGIN
  INSERT INTO bp_verse_text_fts(rowid, translation_id, verse_key, text)
  VALUES (new.rowid, new.translation_id, new.verse_key, new.text);
END;

CREATE TRIGGER IF NOT EXISTS bp_verse_text_ad AFTER DELETE ON bp_verse_text BEGIN
  INSERT INTO bp_verse_text_fts(bp_verse_text_fts, rowid, translation_id, verse_key, text)
  VALUES ('delete', old.rowid, old.translation_id, old.verse_key, old.text);
END;

CREATE TRIGGER IF NOT EXISTS bp_verse_text_au AFTER UPDATE ON bp_verse_text BEGIN
  INSERT INTO bp_verse_text_fts(bp_verse_text_fts, rowid, translation_id, verse_key, text)
  VALUES ('delete', old.rowid, old.translation_id, old.verse_key, old.text);

  INSERT INTO bp_verse_text_fts(rowid, translation_id, verse_key, text)
  VALUES (new.rowid, new.translation_id, new.verse_key, new.text);
END;

-- ---------------------------------------------------------------------------
-- Token FTS (optional but very useful for exact token/word search debugging,
-- selection tooling, and future word-level retrieval optimizations)
-- ---------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS bp_token_fts USING fts5(
  translation_id UNINDEXED,
  verse_key UNINDEXED,
  token_index UNINDEXED,
  token,
  token_norm,
  content=''
);

CREATE TRIGGER IF NOT EXISTS bp_token_ai AFTER INSERT ON bp_token
WHEN new.token_kind NOT IN ('SPACE', 'LINEBREAK')
BEGIN
  INSERT INTO bp_token_fts(translation_id, verse_key, token_index, token, token_norm)
  VALUES (new.translation_id, new.verse_key, new.token_index, new.token, new.token_norm);
END;

CREATE TRIGGER IF NOT EXISTS bp_token_ad AFTER DELETE ON bp_token
WHEN old.token_kind NOT IN ('SPACE', 'LINEBREAK')
BEGIN
  INSERT INTO bp_token_fts(bp_token_fts, rowid, translation_id, verse_key, token_index, token, token_norm)
  VALUES ('delete', old.rowid, old.translation_id, old.verse_key, old.token_index, old.token, old.token_norm);
END;

CREATE TRIGGER IF NOT EXISTS bp_token_au AFTER UPDATE ON bp_token
WHEN old.token_kind NOT IN ('SPACE', 'LINEBREAK')
BEGIN
  INSERT INTO bp_token_fts(bp_token_fts, rowid, translation_id, verse_key, token_index, token, token_norm)
  VALUES ('delete', old.rowid, old.translation_id, old.verse_key, old.token_index, old.token, old.token_norm);
END;

CREATE TRIGGER IF NOT EXISTS bp_token_au_insert AFTER UPDATE ON bp_token
WHEN new.token_kind NOT IN ('SPACE', 'LINEBREAK')
BEGIN
  INSERT INTO bp_token_fts(translation_id, verse_key, token_index, token, token_norm)
  VALUES (new.translation_id, new.verse_key, new.token_index, new.token, new.token_norm);
END;
`;

/* ---------------------------- Export convenience ---------------------------- */

export const schema = {
    // Canonical scripture
    bpBook,
    bpVerse,
    bpChapter,

    // Translation + text
    bpTranslation,
    bpVerseText,
    bpToken,
    bpTokenSpan,

    // Structural/range layer
    bpRange,
    bpPericope,
    bpParagraph,
    bpDocUnit,

    // Entity universe
    bpEntity,
    bpEntityName,
    bpEntityRelation,

    // Geography
    bpPlaceGeo,
    bpRoute,
    bpRouteStep,

    // Time / chronology
    bpTimeSpan,
    bpTimelineAnchor,

    // Events
    bpEvent,
    bpEventParticipant,

    // Orientation graph
    bpLink,
    bpCrossref,

    // Search / telemetry
    bpSearchQueryLog,
    bpReaderEvent,

    // Provenance / audit
    bpSource,
    bpAudit,
} as const;