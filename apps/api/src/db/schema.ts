// apps/api/src/db/schema.ts
// Biblia Populi — Canonical Data Universe Schema v1 (SQLite / Drizzle)
//
// Orientation-only canon.
// - Stable Scripture identity: verse_key + verse_ord
// - Text is swappable: translation overlays
// - All links target ranges (ordinals), never strings
// - Uncertainty is first-class (time + geo precision/confidence)
// - No interpretation layer in canon (no commentary, no devotional "summary", etc.)

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

export const CalendarKind = { BCE_CE: "BCE_CE", ANNO_MUNDI: "ANNO_MUNDI" } as const;
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

export const SourceKind = { IMPORT: "IMPORT", MANUAL: "MANUAL", DATASET: "DATASET" } as const;
export type SourceKind = (typeof SourceKind)[keyof typeof SourceKind];

export const AuditAction = { INSERT: "INSERT", UPDATE: "UPDATE", DELETE: "DELETE" } as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

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
        abbrs: text("abbrs"), // JSON array string (optional)
    },
    (t) => ({
        ordinalUniq: uniqueIndex("bp_book_ordinal_uniq").on(t.ordinal),
        ordCheck: check("bp_book_ordinal_check", sql`${t.ordinal} >= 1`),
        chaptersCheck: check("bp_book_chapters_check", sql`${t.chapters} >= 1`),
        testamentCheck: check("bp_book_testament_check", sql`${t.testament} in ('OT','NT')`),
        bookIdCheck: check("bp_book_book_id_check", sql`length(${t.bookId}) between 2 and 8`),
    }),
);

export const bpVerse = sqliteTable(
    "bp_verse",
    {
        verseKey: text("verse_key").primaryKey(), // BOOK.CHAPTER.VERSE (GEN.1.1)
        bookId: text("book_id").notNull(),
        chapter: integer("chapter").notNull(),
        verse: integer("verse").notNull(),
        verseOrd: integer("verse_ord").notNull(), // BIGINT in PG; SQLite uses INTEGER (64-bit)
        chapterOrd: integer("chapter_ord"),
        isSuperscription: integer("is_superscription", { mode: "boolean" }).notNull().default(false),
        isDeuterocanon: integer("is_deuterocanon", { mode: "boolean" }).notNull().default(false),
    },
    (t) => ({
        ordUniq: uniqueIndex("bp_verse_ord_uniq").on(t.verseOrd),
        byBcvUniq: uniqueIndex("bp_verse_bcv_uniq").on(t.bookId, t.chapter, t.verse),
        bookIdx: index("bp_verse_book_idx").on(t.bookId, t.chapter, t.verse),
        chapterCheck: check("bp_verse_chapter_check", sql`${t.chapter} >= 1`),
        verseCheck: check("bp_verse_verse_check", sql`${t.verse} >= 1`),
        ordCheck: check("bp_verse_ord_check", sql`${t.verseOrd} >= 1`),
        // keep verse_key format enforcement in app validator; SQLite CHECK regex is awkward.
    }),
);

export const bpChapter = sqliteTable(
    "bp_chapter",
    {
        bookId: text("book_id").notNull(),
        chapter: integer("chapter").notNull(),
        startVerseOrd: integer("start_verse_ord").notNull(),
        endVerseOrd: integer("end_verse_ord").notNull(),
        verseCount: integer("verse_count").notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.bookId, t.chapter] }),
        rangeIdx: index("bp_chapter_range_idx").on(t.bookId, t.startVerseOrd, t.endVerseOrd),
        chapterCheck: check("bp_chapter_chapter_check", sql`${t.chapter} >= 1`),
        countCheck: check("bp_chapter_verse_count_check", sql`${t.verseCount} >= 1`),
        spanCheck: check("bp_chapter_span_check", sql`${t.startVerseOrd} <= ${t.endVerseOrd}`),
    }),
);

/* --------------------------- 2) Translation / Text -------------------------- */

export const bpTranslation = sqliteTable(
    "bp_translation",
    {
        translationId: text("translation_id").primaryKey(), // KJV, BP1, ...
        name: text("name").notNull(),
        language: text("language").notNull(), // ISO (en)
        derivedFrom: text("derived_from"),
        licenseKind: text("license_kind").notNull(),
        licenseText: text("license_text"),
        sourceUrl: text("source_url"),
        isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
        createdAt: text("created_at").notNull().default(nowIso),
    },
    (t) => ({
        licenseKindCheck: check(
            "bp_translation_license_kind_check",
            sql`${t.licenseKind} in ('PUBLIC_DOMAIN','LICENSED','CUSTOM')`,
        ),
        idCheck: check("bp_translation_id_check", sql`length(${t.translationId}) > 0`),
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
        updatedAt: text("updated_at").notNull().default(nowIso),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.translationId, t.verseKey] }),
        idx: index("bp_verse_text_idx").on(t.translationId, t.verseKey),
        textCheck: check("bp_verse_text_text_check", sql`length(${t.text}) > 0`),
    }),
);

// Optional tokens (for future highlighting/search; safe since it’s not interpretive)
export const bpToken = sqliteTable(
    "bp_token",
    {
        translationId: text("translation_id").notNull(),
        verseKey: text("verse_key").notNull(),
        tokenIndex: integer("token_index").notNull(),
        token: text("token").notNull(),
        tokenNorm: text("token_norm").notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.translationId, t.verseKey, t.tokenIndex] }),
        normIdx: index("bp_token_norm_idx").on(t.tokenNorm),
        idx: index("bp_token_idx").on(t.translationId, t.verseKey),
        tokCheck: check("bp_token_token_check", sql`length(${t.token}) > 0`),
    }),
);

/* ----------------------- 3) Range & Structural Layer ------------------------ */

export const bpRange = sqliteTable(
    "bp_range",
    {
        rangeId: text("range_id").primaryKey(), // uuid
        startVerseOrd: integer("start_verse_ord").notNull(),
        endVerseOrd: integer("end_verse_ord").notNull(),
        startVerseKey: text("start_verse_key").notNull(),
        endVerseKey: text("end_verse_key").notNull(),
        label: text("label"),
        createdAt: text("created_at").notNull().default(nowIso),
    },
    (t) => ({
        ordIdx: index("bp_range_ord_idx").on(t.startVerseOrd, t.endVerseOrd),
        spanCheck: check("bp_range_span_check", sql`${t.startVerseOrd} <= ${t.endVerseOrd}`),
    }),
);

export const bpPericope = sqliteTable(
    "bp_pericope",
    {
        pericopeId: text("pericope_id").primaryKey(), // uuid
        bookId: text("book_id").notNull(),
        rangeId: text("range_id").notNull(),
        title: text("title").notNull(),
        source: text("source").notNull(),
        confidence: real("confidence"),
        rank: integer("rank"),
    },
    (t) => ({
        bookIdx: index("bp_pericope_book_idx").on(t.bookId),
        rangeIdx: index("bp_pericope_range_idx").on(t.rangeId),
        confCheck: check(
            "bp_pericope_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
    }),
);

export const bpParagraph = sqliteTable(
    "bp_paragraph",
    {
        paragraphId: text("paragraph_id").primaryKey(), // uuid
        translationId: text("translation_id").notNull(),
        rangeId: text("range_id").notNull(),
        style: text("style").notNull(),
        indent: integer("indent").notNull().default(0),
        source: text("source").notNull(),
    },
    (t) => ({
        rangeIdx: index("bp_paragraph_range_idx").on(t.translationId, t.rangeId),
        styleCheck: check(
            "bp_paragraph_style_check",
            sql`${t.style} in ('PROSE','POETRY','LIST','QUOTE','LETTER')`,
        ),
        indentCheck: check("bp_paragraph_indent_check", sql`${t.indent} >= 0`),
    }),
);

export const bpDocUnit = sqliteTable(
    "bp_doc_unit",
    {
        unitId: text("unit_id").primaryKey(), // uuid
        kind: text("kind").notNull(),
        title: text("title").notNull(),
        rangeId: text("range_id").notNull(),
        source: text("source").notNull(),
        confidence: real("confidence"),
    },
    (t) => ({
        kindCheck: check(
            "bp_doc_unit_kind_check",
            sql`${t.kind} in ('SECTION','SPEECH','SONG','LETTER_PART','NARRATIVE_BLOCK')`,
        ),
        rangeIdx: index("bp_doc_unit_range_idx").on(t.rangeId),
        confCheck: check(
            "bp_doc_unit_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
    }),
);

/* --------------------------- 4) Entity Universe ----------------------------- */

export const bpEntity = sqliteTable(
    "bp_entity",
    {
        entityId: text("entity_id").primaryKey(), // uuid
        kind: text("kind").notNull(),
        canonicalName: text("canonical_name").notNull(),
        slug: text("slug").notNull(),
        summaryNeutral: text("summary_neutral"),
        confidence: real("confidence"),
        createdAt: text("created_at").notNull().default(nowIso),
    },
    (t) => ({
        slugUniq: uniqueIndex("bp_entity_slug_uniq").on(t.slug),
        kindCheck: check(
            "bp_entity_kind_check",
            sql`${t.kind} in ('PERSON','PLACE','GROUP','DYNASTY','EMPIRE','REGION','ARTIFACT','OFFICE')`,
        ),
        confCheck: check(
            "bp_entity_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
        nameCheck: check("bp_entity_name_check", sql`length(${t.canonicalName}) > 0`),
    }),
);

export const bpEntityName = sqliteTable(
    "bp_entity_name",
    {
        entityNameId: text("entity_name_id").primaryKey(), // uuid
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
        entityIdx: index("bp_entity_name_entity_idx").on(t.entityId),
        confCheck: check(
            "bp_entity_name_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
    }),
);

export const bpEntityRelation = sqliteTable(
    "bp_entity_relation",
    {
        relationId: text("relation_id").primaryKey(), // uuid
        fromEntityId: text("from_entity_id").notNull(),
        toEntityId: text("to_entity_id").notNull(),
        kind: text("kind").notNull(),
        timeSpanId: text("time_span_id"),
        source: text("source").notNull(),
        confidence: real("confidence"),
        noteNeutral: text("note_neutral"),
    },
    (t) => ({
        fromIdx: index("bp_entity_relation_from_idx").on(t.fromEntityId),
        toIdx: index("bp_entity_relation_to_idx").on(t.toEntityId),
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
        placeGeoId: text("place_geo_id").primaryKey(), // uuid
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
        confCheck: check(
            "bp_place_geo_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
        // enforce required fields per geo_type in app validator (SQLite CHECK gets gnarly).
    }),
);

export const bpRoute = sqliteTable(
    "bp_route",
    {
        routeId: text("route_id").primaryKey(), // uuid
        title: text("title").notNull(),
        source: text("source").notNull(),
        confidence: real("confidence"),
    },
    (t) => ({
        confCheck: check(
            "bp_route_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
    }),
);

export const bpRouteStep = sqliteTable(
    "bp_route_step",
    {
        routeStepId: text("route_step_id").primaryKey(), // uuid
        routeId: text("route_id").notNull(),
        ordinal: integer("ordinal").notNull(),
        placeEntityId: text("place_entity_id").notNull(),
        rangeId: text("range_id"),
        noteNeutral: text("note_neutral"),
    },
    (t) => ({
        ordUniq: uniqueIndex("bp_route_step_ord_uniq").on(t.routeId, t.ordinal),
        routeIdx: index("bp_route_step_route_idx").on(t.routeId),
        ordCheck: check("bp_route_step_ord_check", sql`${t.ordinal} >= 1`),
    }),
);

/* ----------------------- 6) Time / Chronology (Uncertain) ------------------- */

export const bpTimeSpan = sqliteTable(
    "bp_time_span",
    {
        timeSpanId: text("time_span_id").primaryKey(), // uuid
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
        anchorId: text("anchor_id").primaryKey(), // uuid
        rangeId: text("range_id").notNull(),
        timeSpanId: text("time_span_id").notNull(),
        kind: text("kind").notNull(),
        source: text("source").notNull(),
        confidence: real("confidence"),
    },
    (t) => ({
        rangeIdx: index("bp_timeline_anchor_range_idx").on(t.rangeId),
        timeIdx: index("bp_timeline_anchor_time_idx").on(t.timeSpanId),
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
        eventId: text("event_id").primaryKey(), // uuid
        canonicalTitle: text("canonical_title").notNull(),
        kind: text("kind").notNull(),
        primaryRangeId: text("primary_range_id").notNull(),
        timeSpanId: text("time_span_id"),
        primaryPlaceId: text("primary_place_id"), // entity_id (place)
        source: text("source").notNull(),
        confidence: real("confidence"),
    },
    (t) => ({
        kindCheck: check(
            "bp_event_kind_check",
            sql`${t.kind} in (
    'BIRTH','DEATH','BATTLE','COVENANT','EXODUS','MIGRATION','SPEECH','MIRACLE','PROPHECY',
        'CAPTIVITY','RETURN','CRUCIFIXION','RESURRECTION','MISSION_JOURNEY','COUNCIL','LETTER_WRITTEN','OTHER'
)`,
        ),
        rangeIdx: index("bp_event_range_idx").on(t.primaryRangeId),
        confCheck: check(
            "bp_event_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
    }),
);

export const bpEventParticipant = sqliteTable(
    "bp_event_participant",
    {
        eventParticipantId: text("event_participant_id").primaryKey(), // uuid
        eventId: text("event_id").notNull(),
        entityId: text("entity_id").notNull(),
        role: text("role").notNull(),
        confidence: real("confidence"),
    },
    (t) => ({
        eventIdx: index("bp_event_participant_event_idx").on(t.eventId),
        entityIdx: index("bp_event_participant_entity_idx").on(t.entityId),
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
        linkId: text("link_id").primaryKey(), // uuid
        rangeId: text("range_id").notNull(),
        targetKind: text("target_kind").notNull(),
        targetId: text("target_id").notNull(),
        linkKind: text("link_kind").notNull(),
        weight: integer("weight").notNull().default(1),
        source: text("source").notNull(),
        confidence: real("confidence"),
    },
    (t) => ({
        rangeIdx: index("bp_link_range_idx").on(t.rangeId),
        targetIdx: index("bp_link_target_idx").on(t.targetKind, t.targetId),
        kindIdx: index("bp_link_kind_idx").on(t.linkKind),
        targetKindCheck: check("bp_link_target_kind_check", sql`${t.targetKind} in ('ENTITY','EVENT','ROUTE','PLACE_GEO')`),
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
        crossrefId: text("crossref_id").primaryKey(), // uuid
        fromRangeId: text("from_range_id").notNull(),
        toRangeId: text("to_range_id").notNull(),
        kind: text("kind").notNull(),
        source: text("source").notNull(),
        confidence: real("confidence"),
    },
    (t) => ({
        fromIdx: index("bp_crossref_from_idx").on(t.fromRangeId),
        toIdx: index("bp_crossref_to_idx").on(t.toRangeId),
        kindCheck: check("bp_crossref_kind_check", sql`${t.kind} in ('PARALLEL','QUOTE','ALLUSION','TOPICAL')`),
        confCheck: check(
            "bp_crossref_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
    }),
);

/* ------------------------- 9) Search & Retrieval (Optional) ----------------- */

export const bpSearchQueryLog = sqliteTable(
    "bp_search_query_log",
    {
        queryId: text("query_id").primaryKey(), // uuid
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
        hitsCheck: check("bp_search_query_log_hits_check", sql`${t.hits} >= 0`),
    }),
);

/* -------------------------- 10) Reader Telemetry (Optional) ----------------- */

export const bpReaderEvent = sqliteTable(
    "bp_reader_event",
    {
        readerEventId: text("reader_event_id").primaryKey(), // uuid
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
        sourceId: text("source_id").primaryKey(), // uuid
        name: text("name").notNull(),
        kind: text("kind").notNull(),
        version: text("version"),
        url: text("url"),
        license: text("license"),
        notes: text("notes"),
    },
    (t) => ({
        kindCheck: check("bp_source_kind_check", sql`${t.kind} in ('IMPORT','MANUAL','DATASET')`),
    }),
);

export const bpAudit = sqliteTable(
    "bp_audit",
    {
        auditId: text("audit_id").primaryKey(), // uuid
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
        actionCheck: check("bp_audit_action_check", sql`${t.action} in ('INSERT','UPDATE','DELETE')`),
    }),
);

/* ------------------------------------ FTS ----------------------------------- */
/**
 * Optional FTS5 extras for verse text search.
 * Applied by migrate.ts (extras runner), not by Drizzle schema.
 */
export const FTS_MIGRATION_SQL = `
-- FTS5 over bp_verse_text.text (translation-aware)
CREATE VIRTUAL TABLE IF NOT EXISTS bp_verse_text_fts USING fts5(
  translation_id UNINDEXED,
  verse_key UNINDEXED,
  text,
  content='bp_verse_text',
  content_rowid='rowid'
);

-- Sync triggers (recommended)
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
`;

/* ---------------------------- Export convenience ---------------------------- */

export const schema = {
    bpBook,
    bpVerse,
    bpChapter,

    bpTranslation,
    bpVerseText,
    bpToken,

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