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
// Hardened notes:
// - Avoid bound params inside CHECK DDL for SQLite.
// - Keep reusable CHECK helpers inline-safe with sql.raw literals only.
// - Re-export auth + annotation schema from here as the app's single DB surface.
// - Avoid symbol collisions with annotation schema exports (e.g. AnchorKind).

import { sql, type SQL } from "drizzle-orm";
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

/* --------------------------------- Helpers --------------------------------- */

function intLiteral(n: number): SQL {
    if (!Number.isInteger(n)) {
        throw new Error(`[schema] expected integer literal, got ${n}`);
    }
    return sql.raw(String(n));
}

function stringLiteral(value: string): SQL {
    return sql.raw(`'${value.replace(/'/g, "''")}'`);
}

function inStringSet(col: unknown, values: readonly string[]): SQL {
    return sql`${col as any} in (${sql.join(values.map(stringLiteral), sql.raw(", "))})`;
}

const lenGt0 = (col: unknown) => sql`length(${col as any}) > 0`;
const lenGe = (col: unknown, n: number) => sql`length(${col as any}) >= ${intLiteral(n)}`;
const lenBetween = (col: unknown, min: number, max: number) =>
    sql`length(${col as any}) between ${intLiteral(min)} and ${intLiteral(max)}`;
const intGe = (col: unknown, n: number) => sql`${col as any} >= ${intLiteral(n)}`;
const intMaybeGe = (col: unknown, n: number) => sql`${col as any} is null or ${col as any} >= ${intLiteral(n)}`;
const realMaybeGe = (col: unknown, n: number) => {
    if (!Number.isFinite(n)) {
        throw new Error(`[schema] expected finite numeric literal, got ${n}`);
    }
    return sql`${col as any} is null or ${col as any} >= ${sql.raw(String(n))}`;
};
const confidence01 = (col: unknown) => sql`${col as any} is null or (${col as any} >= 0 and ${col as any} <= 1)`;

/* ---------------------------------- Enums ---------------------------------- */

export const Testament = { OT: "OT", NT: "NT" } as const;
export type Testament = (typeof Testament)[keyof typeof Testament];
const TESTAMENT_VALUES = Object.values(Testament);

export const LicenseKind = {
    PUBLIC_DOMAIN: "PUBLIC_DOMAIN",
    LICENSED: "LICENSED",
    CUSTOM: "CUSTOM",
} as const;
export type LicenseKind = (typeof LicenseKind)[keyof typeof LicenseKind];
const LICENSE_KIND_VALUES = Object.values(LicenseKind);

export const ParagraphStyle = {
    PROSE: "PROSE",
    POETRY: "POETRY",
    LIST: "LIST",
    QUOTE: "QUOTE",
    LETTER: "LETTER",
} as const;
export type ParagraphStyle = (typeof ParagraphStyle)[keyof typeof ParagraphStyle];
const PARAGRAPH_STYLE_VALUES = Object.values(ParagraphStyle);

export const DocUnitKind = {
    SECTION: "SECTION",
    SPEECH: "SPEECH",
    SONG: "SONG",
    LETTER_PART: "LETTER_PART",
    NARRATIVE_BLOCK: "NARRATIVE_BLOCK",
} as const;
export type DocUnitKind = (typeof DocUnitKind)[keyof typeof DocUnitKind];
const DOC_UNIT_KIND_VALUES = Object.values(DocUnitKind);

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
const ENTITY_KIND_VALUES = Object.values(EntityKind);

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
const RELATION_KIND_VALUES = Object.values(RelationKind);

export const GeoType = {
    POINT: "POINT",
    BBOX: "BBOX",
    REGION_POLYGON: "REGION_POLYGON",
} as const;
export type GeoType = (typeof GeoType)[keyof typeof GeoType];
const GEO_TYPE_VALUES = Object.values(GeoType);

export const CalendarKind = {
    BCE_CE: "BCE_CE",
    ANNO_MUNDI: "ANNO_MUNDI",
} as const;
export type CalendarKind = (typeof CalendarKind)[keyof typeof CalendarKind];
const CALENDAR_KIND_VALUES = Object.values(CalendarKind);

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
const ERA_TAG_VALUES = Object.values(EraTag);

// Important: do not export plain AnchorKind here because annotationSchema already exports AnchorKind.
export const TimelineAnchorKind = {
    SETTING: "SETTING",
    EVENT_WINDOW: "EVENT_WINDOW",
    REIGN: "REIGN",
    JOURNEY_WINDOW: "JOURNEY_WINDOW",
} as const;
export type TimelineAnchorKind = (typeof TimelineAnchorKind)[keyof typeof TimelineAnchorKind];
const TIMELINE_ANCHOR_KIND_VALUES = Object.values(TimelineAnchorKind);

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
const EVENT_KIND_VALUES = Object.values(EventKind);

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
const PARTICIPANT_ROLE_VALUES = Object.values(ParticipantRole);

export const LinkTargetKind = {
    ENTITY: "ENTITY",
    EVENT: "EVENT",
    ROUTE: "ROUTE",
    PLACE_GEO: "PLACE_GEO",
} as const;
export type LinkTargetKind = (typeof LinkTargetKind)[keyof typeof LinkTargetKind];
const LINK_TARGET_KIND_VALUES = Object.values(LinkTargetKind);

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
const LINK_KIND_VALUES = Object.values(LinkKind);

export const CrossrefKind = {
    PARALLEL: "PARALLEL",
    QUOTE: "QUOTE",
    ALLUSION: "ALLUSION",
    TOPICAL: "TOPICAL",
} as const;
export type CrossrefKind = (typeof CrossrefKind)[keyof typeof CrossrefKind];
const CROSSREF_KIND_VALUES = Object.values(CrossrefKind);

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
const READER_EVENT_TYPE_VALUES = Object.values(ReaderEventType);

export const SourceKind = {
    IMPORT: "IMPORT",
    MANUAL: "MANUAL",
    DATASET: "DATASET",
} as const;
export type SourceKind = (typeof SourceKind)[keyof typeof SourceKind];
const SOURCE_KIND_VALUES = Object.values(SourceKind);

export const AuditAction = {
    INSERT: "INSERT",
    UPDATE: "UPDATE",
    DELETE: "DELETE",
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
const AUDIT_ACTION_VALUES = Object.values(AuditAction);

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
const TOKEN_KIND_VALUES = Object.values(TokenKind);

export const NormalizationForm = {
    NONE: "NONE",
    SIMPLE: "SIMPLE",
    SEARCH_V1: "SEARCH_V1",
} as const;
export type NormalizationForm = (typeof NormalizationForm)[keyof typeof NormalizationForm];
const NORMALIZATION_FORM_VALUES = Object.values(NormalizationForm);

/* ------------------------- 1) Canonical Scripture Layer ---------------------- */

export const bpBook = sqliteTable(
    "bp_book",
    {
        bookId: text("book_id").primaryKey(),
        ordinal: integer("ordinal").notNull(),
        testament: text("testament").notNull(),
        name: text("name").notNull(),
        nameShort: text("name_short").notNull(),
        chapters: integer("chapters").notNull(),
        osised: text("osised"),
        abbrs: text("abbrs"),
    },
    (t) => ({
        ordinalUniq: uniqueIndex("bp_book_ordinal_uniq").on(t.ordinal),
        ordCheck: check("bp_book_ordinal_check", intGe(t.ordinal, 1)),
        chaptersCheck: check("bp_book_chapters_check", intGe(t.chapters, 1)),
        testamentCheck: check("bp_book_testament_check", inStringSet(t.testament, TESTAMENT_VALUES)),
        bookIdCheck: check("bp_book_book_id_check", lenBetween(t.bookId, 2, 8)),
        nameCheck: check("bp_book_name_check", lenGt0(t.name)),
        shortNameCheck: check("bp_book_name_short_check", lenGt0(t.nameShort)),
    }),
);

export const bpVerse = sqliteTable(
    "bp_verse",
    {
        verseKey: text("verse_key").primaryKey(),
        bookId: text("book_id").notNull(),
        chapter: integer("chapter").notNull(),
        verse: integer("verse").notNull(),
        verseOrd: integer("verse_ord").notNull(),
        chapterOrd: integer("chapter_ord"),

        isSuperscription: integer("is_superscription", { mode: "boolean" }).notNull().default(false),
        isDeuterocanon: integer("is_deuterocanon", { mode: "boolean" }).notNull().default(false),

        sourceBookOrdinal: integer("source_book_ordinal"),
        sourceChapterOrdinal: integer("source_chapter_ordinal"),
        sourceVerseOrdinal: integer("source_verse_ordinal"),
    },
    (t) => ({
        ordUniq: uniqueIndex("bp_verse_ord_uniq").on(t.verseOrd),
        byBcvUniq: uniqueIndex("bp_verse_bcv_uniq").on(t.bookId, t.chapter, t.verse),
        bookIdx: index("bp_verse_book_idx").on(t.bookId, t.chapter, t.verse),
        chapterOrdIdx: index("bp_verse_chapter_ord_idx").on(t.chapterOrd, t.verseOrd),
        chapterCheck: check("bp_verse_chapter_check", intGe(t.chapter, 1)),
        verseCheck: check("bp_verse_verse_check", intGe(t.verse, 1)),
        ordCheck: check("bp_verse_ord_check", intGe(t.verseOrd, 1)),
        sourceBookOrdCheck: check("bp_verse_source_book_ordinal_check", intMaybeGe(t.sourceBookOrdinal, 1)),
        sourceChapterOrdCheck: check("bp_verse_source_chapter_ordinal_check", intMaybeGe(t.sourceChapterOrdinal, 1)),
        sourceVerseOrdCheck: check("bp_verse_source_verse_ordinal_check", intMaybeGe(t.sourceVerseOrdinal, 1)),
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
        chapterCheck: check("bp_chapter_chapter_check", intGe(t.chapter, 1)),
        chapterOrdCheck: check("bp_chapter_chapter_ord_check", intMaybeGe(t.chapterOrd, 1)),
        countCheck: check("bp_chapter_verse_count_check", intGe(t.verseCount, 1)),
        spanCheck: check("bp_chapter_span_check", sql`${t.startVerseOrd} <= ${t.endVerseOrd}`),
    }),
);

/* --------------------------- 2) Translation / Text -------------------------- */

export const bpTranslation = sqliteTable(
    "bp_translation",
    {
        translationId: text("translation_id").primaryKey(),
        name: text("name").notNull(),
        language: text("language").notNull(),
        derivedFrom: text("derived_from"),

        licenseKind: text("license_kind").notNull(),
        licenseText: text("license_text"),
        sourceUrl: text("source_url"),

        publisher: text("publisher"),
        editionLabel: text("edition_label"),
        abbreviation: text("abbreviation"),

        normalizationForm: text("normalization_form").notNull().default(NormalizationForm.SIMPLE),

        isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
        isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),

        createdAt: text("created_at").notNull().default(nowIso),
        updatedAt: text("updated_at").notNull().default(nowIso),
    },
    (t) => ({
        nameIdx: index("bp_translation_name_idx").on(t.name),
        publicIdx: index("bp_translation_public_idx").on(t.isPublic, t.isDefault),
        licenseKindCheck: check("bp_translation_license_kind_check", inStringSet(t.licenseKind, LICENSE_KIND_VALUES)),
        normFormCheck: check("bp_translation_normalization_form_check", inStringSet(t.normalizationForm, NORMALIZATION_FORM_VALUES)),
        idCheck: check("bp_translation_id_check", lenGt0(t.translationId)),
        nameCheck: check("bp_translation_name_check", lenGt0(t.name)),
        langCheck: check("bp_translation_language_check", lenGe(t.language, 2)),
    }),
);

export const bpVerseText = sqliteTable(
    "bp_verse_text",
    {
        translationId: text("translation_id").notNull(),
        verseKey: text("verse_key").notNull(),

        text: text("text").notNull(),
        textNorm: text("text_norm"),

        hash: text("hash"),
        textLength: integer("text_length"),
        tokenCount: integer("token_count"),
        wordCount: integer("word_count"),

        source: text("source"),
        sourceRevision: text("source_revision"),

        updatedAt: text("updated_at").notNull().default(nowIso),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.translationId, t.verseKey] }),
        idx: index("bp_verse_text_idx").on(t.translationId, t.verseKey),
        updatedIdx: index("bp_verse_text_updated_idx").on(t.updatedAt),
        hashIdx: index("bp_verse_text_hash_idx").on(t.hash),
        textCheck: check("bp_verse_text_text_check", lenGt0(t.text)),
        lengthCheck: check("bp_verse_text_length_check", intMaybeGe(t.textLength, 0)),
        tokenCountCheck: check("bp_verse_text_token_count_check", intMaybeGe(t.tokenCount, 0)),
        wordCountCheck: check("bp_verse_text_word_count_check", intMaybeGe(t.wordCount, 0)),
    }),
);

export const bpToken = sqliteTable(
    "bp_token",
    {
        translationId: text("translation_id").notNull(),
        verseKey: text("verse_key").notNull(),
        tokenIndex: integer("token_index").notNull(),

        token: text("token").notNull(),
        tokenNorm: text("token_norm").notNull(),
        tokenKind: text("token_kind").notNull().default(TokenKind.WORD),

        charStart: integer("char_start").notNull(),
        charEnd: integer("char_end").notNull(),

        isWordLike: integer("is_word_like", { mode: "boolean" }).notNull().default(true),
        breakAfter: integer("break_after", { mode: "boolean" }).notNull().default(false),

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

        tokCheck: check("bp_token_token_check", lenGt0(t.token)),
        normCheck: check("bp_token_norm_check", sql`length(${t.tokenNorm}) >= 0`),
        tokenIndexCheck: check("bp_token_token_index_check", intGe(t.tokenIndex, 0)),
        kindCheck: check("bp_token_kind_check", inStringSet(t.tokenKind, TOKEN_KIND_VALUES)),
        charStartCheck: check("bp_token_char_start_check", intGe(t.charStart, 0)),
        charEndCheck: check("bp_token_char_end_check", sql`${t.charEnd} > ${t.charStart}`),
        surfaceGroupCheck: check("bp_token_surface_group_check", intMaybeGe(t.surfaceGroup, 0)),
        lineOrdinalCheck: check("bp_token_line_ordinal_check", intMaybeGe(t.lineOrdinal, 0)),
    }),
);

export const bpTokenSpan = sqliteTable(
    "bp_token_span",
    {
        translationId: text("translation_id").notNull(),
        verseKey: text("verse_key").notNull(),
        spanId: text("span_id").notNull(),

        startTokenIndex: integer("start_token_index").notNull(),
        endTokenIndex: integer("end_token_index").notNull(),

        charStart: integer("char_start").notNull(),
        charEnd: integer("char_end").notNull(),

        text: text("text"),
        hash: text("hash"),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.translationId, t.verseKey, t.spanId] }),
        idx: index("bp_token_span_idx").on(t.translationId, t.verseKey, t.startTokenIndex, t.endTokenIndex),
        charIdx: index("bp_token_span_char_idx").on(t.translationId, t.verseKey, t.charStart, t.charEnd),
        startCheck: check("bp_token_span_start_check", intGe(t.startTokenIndex, 0)),
        endCheck: check("bp_token_span_end_check", sql`${t.endTokenIndex} >= ${t.startTokenIndex}`),
        charStartCheck: check("bp_token_span_char_start_check", intGe(t.charStart, 0)),
        charEndCheck: check("bp_token_span_char_end_check", sql`${t.charEnd} > ${t.charStart}`),
    }),
);

/* ----------------------- 3) Range & Structural Layer ------------------------ */

export const bpRange = sqliteTable(
    "bp_range",
    {
        rangeId: text("range_id").primaryKey(),
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
        verseCountCheck: check("bp_range_verse_count_check", intMaybeGe(t.verseCount, 1)),
        chapterCountCheck: check("bp_range_chapter_count_check", intMaybeGe(t.chapterCount, 1)),
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
        rankCheck: check("bp_pericope_rank_check", intMaybeGe(t.rank, 0)),
        confCheck: check("bp_pericope_conf_check", confidence01(t.confidence)),
        titleCheck: check("bp_pericope_title_check", lenGt0(t.title)),
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
        styleCheck: check("bp_paragraph_style_check", inStringSet(t.style, PARAGRAPH_STYLE_VALUES)),
        indentCheck: check("bp_paragraph_indent_check", intGe(t.indent, 0)),
        ordinalCheck: check("bp_paragraph_ordinal_check", intMaybeGe(t.ordinal, 0)),
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
        kindCheck: check("bp_doc_unit_kind_check", inStringSet(t.kind, DOC_UNIT_KIND_VALUES)),
        rangeIdx: index("bp_doc_unit_range_idx").on(t.rangeId),
        ordIdx: index("bp_doc_unit_ord_idx").on(t.ordinal),
        parentIdx: index("bp_doc_unit_parent_idx").on(t.parentUnitId),
        confCheck: check("bp_doc_unit_conf_check", confidence01(t.confidence)),
        ordinalCheck: check("bp_doc_unit_ordinal_check", intMaybeGe(t.ordinal, 0)),
        notSelfCheck: check("bp_doc_unit_not_self_check", sql`${t.parentUnitId} is null or ${t.parentUnitId} <> ${t.unitId}`),
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
        kindCheck: check("bp_entity_kind_check", inStringSet(t.kind, ENTITY_KIND_VALUES)),
        confCheck: check("bp_entity_conf_check", confidence01(t.confidence)),
        nameCheck: check("bp_entity_name_check", lenGt0(t.canonicalName)),
        slugCheck: check("bp_entity_slug_check", lenGt0(t.slug)),
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
        confCheck: check("bp_entity_name_conf_check", confidence01(t.confidence)),
        nameCheck: check("bp_entity_name_name_check", lenGt0(t.name)),
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
        kindCheck: check("bp_entity_relation_kind_check", inStringSet(t.kind, RELATION_KIND_VALUES)),
        notSelf: check("bp_entity_relation_not_self", sql`not (${t.fromEntityId} = ${t.toEntityId})`),
        confCheck: check("bp_entity_relation_conf_check", confidence01(t.confidence)),
    }),
);

/* ----------------------------- 5) Geography -------------------------------- */

export const bpPlaceGeo = sqliteTable(
    "bp_place_geo",
    {
        placeGeoId: text("place_geo_id").primaryKey(),
        entityId: text("entity_id").notNull(),
        geoType: text("geo_type").notNull(),

        lat: real("lat"),
        lng: real("lng"),

        bbox: text("bbox"),
        polygon: text("polygon"),

        precisionM: real("precision_m"),
        source: text("source").notNull(),
        confidence: real("confidence"),
    },
    (t) => ({
        entityIdx: index("bp_place_geo_entity_idx").on(t.entityId),
        typeCheck: check("bp_place_geo_type_check", inStringSet(t.geoType, GEO_TYPE_VALUES)),
        latCheck: check("bp_place_geo_lat_check", sql`${t.lat} is null or (${t.lat} >= -90 and ${t.lat} <= 90)`),
        lngCheck: check("bp_place_geo_lng_check", sql`${t.lng} is null or (${t.lng} >= -180 and ${t.lng} <= 180)`),
        precisionCheck: check("bp_place_geo_precision_check", realMaybeGe(t.precisionM, 0)),
        confCheck: check("bp_place_geo_conf_check", confidence01(t.confidence)),
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
        confCheck: check("bp_route_conf_check", confidence01(t.confidence)),
        titleCheck: check("bp_route_title_check", lenGt0(t.title)),
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
        ordCheck: check("bp_route_step_ord_check", intGe(t.ordinal, 1)),
        distanceCheck: check("bp_route_step_distance_check", realMaybeGe(t.distanceKm, 0)),
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

        calendar: text("calendar").notNull().default(CalendarKind.BCE_CE),
        eraTag: text("era_tag"),

        source: text("source").notNull(),
        confidence: real("confidence"),
    },
    (t) => ({
        calCheck: check("bp_time_span_calendar_check", inStringSet(t.calendar, CALENDAR_KIND_VALUES)),
        eraCheck: check("bp_time_span_era_check", sql`${t.eraTag} is null or ${inStringSet(t.eraTag, ERA_TAG_VALUES)}`),
        confCheck: check("bp_time_span_conf_check", confidence01(t.confidence)),
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
        kindCheck: check("bp_timeline_anchor_kind_check", inStringSet(t.kind, TIMELINE_ANCHOR_KIND_VALUES)),
        confCheck: check("bp_timeline_anchor_conf_check", confidence01(t.confidence)),
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
        primaryPlaceId: text("primary_place_id"),
        source: text("source").notNull(),
        confidence: real("confidence"),
        summaryNeutral: text("summary_neutral"),
    },
    (t) => ({
        kindIdx: index("bp_event_kind_idx").on(t.kind),
        rangeIdx: index("bp_event_range_idx").on(t.primaryRangeId),
        placeIdx: index("bp_event_place_idx").on(t.primaryPlaceId),
        timeIdx: index("bp_event_time_idx").on(t.timeSpanId),
        kindCheck: check("bp_event_kind_check", inStringSet(t.kind, EVENT_KIND_VALUES)),
        confCheck: check("bp_event_conf_check", confidence01(t.confidence)),
        titleCheck: check("bp_event_title_check", lenGt0(t.canonicalTitle)),
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
        roleCheck: check("bp_event_participant_role_check", inStringSet(t.role, PARTICIPANT_ROLE_VALUES)),
        confCheck: check("bp_event_participant_conf_check", confidence01(t.confidence)),
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
        targetKindCheck: check("bp_link_target_kind_check", inStringSet(t.targetKind, LINK_TARGET_KIND_VALUES)),
        linkKindCheck: check("bp_link_link_kind_check", inStringSet(t.linkKind, LINK_KIND_VALUES)),
        weightCheck: check("bp_link_weight_check", intGe(t.weight, 1)),
        confCheck: check("bp_link_conf_check", confidence01(t.confidence)),
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
        kindCheck: check("bp_crossref_kind_check", inStringSet(t.kind, CROSSREF_KIND_VALUES)),
        confCheck: check("bp_crossref_conf_check", confidence01(t.confidence)),
        notSelfCheck: check("bp_crossref_not_self_check", sql`not (${t.fromRangeId} = ${t.toRangeId} and ${t.kind} = 'PARALLEL')`),
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
        hitsCheck: check("bp_search_query_log_hits_check", intGe(t.hits, 0)),
        queryCheck: check("bp_search_query_log_query_check", lenGt0(t.query)),
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
        typeCheck: check("bp_reader_event_type_check", inStringSet(t.eventType, READER_EVENT_TYPE_VALUES)),
        durCheck: check("bp_reader_event_duration_check", intMaybeGe(t.durationMs, 0)),
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
        kindCheck: check("bp_source_kind_check", inStringSet(t.kind, SOURCE_KIND_VALUES)),
        nameCheck: check("bp_source_name_check", lenGt0(t.name)),
    }),
);

export const bpAudit = sqliteTable(
    "bp_audit",
    {
        auditId: text("audit_id").primaryKey(),
        entityKind: text("entity_kind").notNull(),
        entityId: text("entity_id").notNull(),
        action: text("action").notNull(),
        before: text("before"),
        after: text("after"),
        sourceId: text("source_id"),
        createdAt: text("created_at").notNull().default(nowIso),
    },
    (t) => ({
        entIdx: index("bp_audit_entity_idx").on(t.entityKind, t.entityId, t.createdAt),
        actionIdx: index("bp_audit_action_idx").on(t.action, t.createdAt),
        sourceIdx: index("bp_audit_source_idx").on(t.sourceId, t.createdAt),
        actionCheck: check("bp_audit_action_check", inStringSet(t.action, AUDIT_ACTION_VALUES)),
    }),
);

/* ------------------------------------ FTS ----------------------------------- */

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
-- Token FTS
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
    bpBook,
    bpVerse,
    bpChapter,

    bpTranslation,
    bpVerseText,
    bpToken,
    bpTokenSpan,

    bpRange,
    bpPericope,
    bpParagraph,
    bpDocUnit,

    bpEntity,
    bpEntityName,
    bpEntityRelation,

    bpPlaceGeo,
    bpRoute,
    bpRouteStep,

    bpTimeSpan,
    bpTimelineAnchor,

    bpEvent,
    bpEventParticipant,

    bpLink,
    bpCrossref,

    bpSearchQueryLog,
    bpReaderEvent,

    bpSource,
    bpAudit,
} as const;