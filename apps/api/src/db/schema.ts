// apps/api/src/db/schema.ts
// Biblia Populi — Drizzle (SQLite) schema (upgraded + chrono/geo engine)
//
// Adds (chrono/geo engine):
// - source_doc: structured citation records (Scripture, gazetteer, atlas, etc.)
// - chrono_span: time windows (approx/uncertain) attached to person/place/event/journey
// - chrono_relation: temporal relationships between entities (before/after/during/overlaps)
// - place_geo: multi-geometry per place (point/bbox/polygon/line) with confidence + provenance
// - journey_path: optional polyline(s) per journey for map rendering
//
// Notes:
// - FTS5 is still created via migration SQL (see FTS_MIGRATION_SQL).
// - SQLite "enum" is modeled as TEXT + CHECK constraints.
// - Foreign keys are intentionally not declared (keep coupling light); enforce with app logic.
// - Ensure PRAGMA foreign_keys=ON in client.ts anyway for future FK additions.

import {
    sqliteTable,
    text,
    integer,
    real,
    primaryKey,
    index,
    uniqueIndex,
    check,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/* --------------------------------- Helpers -------------------------------- */

export const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

export const EntityType = {
    person: "person",
    place: "place",
    event: "event",
    journey: "journey",
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];

export const RevisionStatus = {
    draft: "draft",
    published: "published",
    archived: "archived",
} as const;
export type RevisionStatus = (typeof RevisionStatus)[keyof typeof RevisionStatus];

export const Testament = {
    OT: "OT",
    NT: "NT",
    DC: "DC",
} as const;
export type Testament = (typeof Testament)[keyof typeof Testament];

export const Sex = {
    male: "male",
    female: "female",
} as const;
export type Sex = (typeof Sex)[keyof typeof Sex];

export const RelationshipKind = {
    parent: "parent",
    child: "child",
    spouse: "spouse",
    sibling: "sibling",
    teacher_of: "teacher_of",
    disciple_of: "disciple_of",
    king_of: "king_of",
    prophet_to: "prophet_to",
    enemy_of: "enemy_of",
    covenant_with: "covenant_with",
} as const;
export type RelationshipKind = (typeof RelationshipKind)[keyof typeof RelationshipKind];

export const PlaceLinkKind = {
    born_in: "born_in",
    died_in: "died_in",
    lived_in: "lived_in",
    traveled_to: "traveled_to",
    ministered_in: "ministered_in",
    exiled_to: "exiled_to",
    battle_at: "battle_at",
    imprisoned_in: "imprisoned_in",
} as const;
export type PlaceLinkKind = (typeof PlaceLinkKind)[keyof typeof PlaceLinkKind];

export const MarkKind = {
    heading: "heading",
    subheading: "subheading",
    paragraph_break: "paragraph_break",
    poetry_line: "poetry_line",
    speaker: "speaker",
    red_letter: "red_letter",
    selah: "selah",
} as const;
export type MarkKind = (typeof MarkKind)[keyof typeof MarkKind];

export const HighlightColor = {
    gray: "gray",
    yellow: "yellow",
    green: "green",
    blue: "blue",
    purple: "purple",
    red: "red",
} as const;
export type HighlightColor = (typeof HighlightColor)[keyof typeof HighlightColor];

export const AssetKind = {
    image: "image",
    icon: "icon",
    svg: "svg",
} as const;
export type AssetKind = (typeof AssetKind)[keyof typeof AssetKind];

export const PlaceKind = {
    city: "city",
    region: "region",
    river: "river",
    mountain: "mountain",
    sea: "sea",
    desert: "desert",
    route: "route",
    other: "other",
} as const;
export type PlaceKind = (typeof PlaceKind)[keyof typeof PlaceKind];

/* ------------------------------- Chrono / Geo ------------------------------ */

export const SourceKind = {
    scripture: "scripture",
    gazetteer: "gazetteer",
    atlas: "atlas",
    academic: "academic",
    tradition: "tradition",
    other: "other",
} as const;
export type SourceKind = (typeof SourceKind)[keyof typeof SourceKind];

export const GeoShapeKind = {
    point: "point",
    bbox: "bbox",
    polygon: "polygon",
    polyline: "polyline",
} as const;
export type GeoShapeKind = (typeof GeoShapeKind)[keyof typeof GeoShapeKind];

export const ChronoKind = {
    life: "life",
    reign: "reign",
    ministry: "ministry",
    journey: "journey",
    event_window: "event_window",
    composition: "composition",
    other: "other",
} as const;
export type ChronoKind = (typeof ChronoKind)[keyof typeof ChronoKind];

export const ChronoPrecision = {
    exact: "exact",
    approx: "approx",
    uncertain: "uncertain",
} as const;
export type ChronoPrecision = (typeof ChronoPrecision)[keyof typeof ChronoPrecision];

export const ChronoRelationKind = {
    before: "before",
    after: "after",
    during: "during",
    overlaps: "overlaps",
    same_time: "same_time",
    unknown: "unknown",
} as const;
export type ChronoRelationKind = (typeof ChronoRelationKind)[keyof typeof ChronoRelationKind];

/* ------------------------------- Canon / Books ------------------------------ */
/**
 * canon_book: defines books for a given canon (66-book protestant, 73 catholic, etc.)
 * book_id is a stable code: GEN, EXO, MAT, ROM, ...
 */
export const canonBook = sqliteTable(
    "canon_book",
    {
        canonId: text("canon_id").notNull(), // e.g. "protestant_66"
        bookId: text("book_id").notNull(), // e.g. "GEN"
        ordinal: integer("ordinal").notNull(), // 1..N
        name: text("name").notNull(), // "Genesis"
        nameShort: text("name_short").notNull(), // "Gen"
        testament: text("testament").notNull(), // OT | NT | DC
        chaptersCount: integer("chapters_count").notNull(),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.canonId, t.bookId] }),
        ordIdx: uniqueIndex("canon_book_unique_ordinal").on(t.canonId, t.ordinal),
        testIdx: index("canon_book_testament_idx").on(t.canonId, t.testament),
        chapterCountCheck: check("canon_book_chapters_count_check", sql`${t.chaptersCount} > 0`),
        ordCheck: check("canon_book_ordinal_check", sql`${t.ordinal} > 0`),
        testamentCheck: check("canon_book_testament_check", sql`${t.testament} in ('OT','NT','DC')`),
        bookIdCheck: check("canon_book_book_id_check", sql`length(${t.bookId}) between 2 and 8`),
    }),
);

/**
 * chapter: optional, but useful for per-chapter headings/metadata.
 */
export const chapter = sqliteTable(
    "chapter",
    {
        canonId: text("canon_id").notNull(),
        bookId: text("book_id").notNull(),
        chapter: integer("chapter").notNull(),
        title: text("title"),
        summary: text("summary"),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.canonId, t.bookId, t.chapter] }),
        chapterCheck: check("chapter_chapter_check", sql`${t.chapter} > 0`),
    }),
);

/**
 * verse: defines the address space + ensures verse validity for a canon.
 * verseOrdinal provides fast range queries.
 */
export const verse = sqliteTable(
    "verse",
    {
        canonId: text("canon_id").notNull(),
        bookId: text("book_id").notNull(),
        chapter: integer("chapter").notNull(),
        verse: integer("verse").notNull(),
        verseOrdinal: integer("verse_ordinal").notNull(), // global order within canon (1..total_verses)
    },
    (t) => ({
        pk: primaryKey({ columns: [t.canonId, t.bookId, t.chapter, t.verse] }),
        ordIdx: uniqueIndex("verse_unique_ordinal").on(t.canonId, t.verseOrdinal),
        bookIdx: index("verse_book_idx").on(t.canonId, t.bookId, t.chapter, t.verse),
        chapterCheck: check("verse_chapter_check", sql`${t.chapter} > 0`),
        verseCheck: check("verse_verse_check", sql`${t.verse} > 0`),
        ordinalCheck: check("verse_ordinal_check", sql`${t.verseOrdinal} > 0`),
    }),
);

/* -------------------------- Translations / Revisions ------------------------- */

export const translation = sqliteTable(
    "translation",
    {
        translationId: text("translation_id").primaryKey(), // e.g. "biblia_populi"
        name: text("name").notNull(), // "Biblia Populi"
        language: text("language").notNull(), // "en"
        description: text("description"),
        createdAt: text("created_at").notNull().default(nowIso),
    },
    (t) => ({
        langIdx: index("translation_language_idx").on(t.language),
        idCheck: check("translation_id_check", sql`length(${t.translationId}) > 0`),
    }),
);

export const translationRevision = sqliteTable(
    "translation_revision",
    {
        translationRevisionId: text("translation_revision_id").primaryKey(), // uuid
        translationId: text("translation_id").notNull(),
        label: text("label").notNull(), // "draft", "v0.1", "2026-03-10"
        status: text("status").notNull(), // draft|published|archived
        basedOnRevisionId: text("based_on_revision_id"),
        createdAt: text("created_at").notNull().default(nowIso),
        publishedAt: text("published_at"),
    },
    (t) => ({
        byTranslationIdx: index("translation_revision_translation_idx").on(t.translationId, t.status),
        statusCheck: check(
            "translation_revision_status_check",
            sql`${t.status} in ('draft','published','archived')`,
        ),
        labelCheck: check("translation_revision_label_check", sql`length(${t.label}) > 0`),
    }),
);

/**
 * translation_default_revision:
 * Helper for the current active revision (per translation + canon + purpose).
 */
export const translationDefaultRevision = sqliteTable(
    "translation_default_revision",
    {
        translationId: text("translation_id").notNull(),
        canonId: text("canon_id").notNull(),
        purpose: text("purpose").notNull(), // "reading" | "editing"
        translationRevisionId: text("translation_revision_id").notNull(),
        updatedAt: text("updated_at").notNull().default(nowIso),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.translationId, t.canonId, t.purpose] }),
        purposeCheck: check(
            "translation_default_revision_purpose_check",
            sql`${t.purpose} in ('reading','editing')`,
        ),
    }),
);

/* ----------------------------- Verse Text Layer ----------------------------- */

export const verseText = sqliteTable(
    "verse_text",
    {
        translationRevisionId: text("translation_revision_id").notNull(),
        canonId: text("canon_id").notNull(),
        bookId: text("book_id").notNull(),
        chapter: integer("chapter").notNull(),
        verse: integer("verse").notNull(),
        text: text("text").notNull(),
        updatedAt: text("updated_at").notNull().default(nowIso),
    },
    (t) => ({
        pk: primaryKey({
            columns: [t.translationRevisionId, t.canonId, t.bookId, t.chapter, t.verse],
        }),
        bookReadIdx: index("verse_text_book_read_idx").on(
            t.translationRevisionId,
            t.canonId,
            t.bookId,
            t.chapter,
            t.verse,
        ),
        revisionIdx: index("verse_text_revision_idx").on(t.translationRevisionId),
        textNonEmpty: check("verse_text_nonempty_check", sql`length(${t.text}) > 0`),
        chapterCheck: check("verse_text_chapter_check", sql`${t.chapter} > 0`),
        verseCheck: check("verse_text_verse_check", sql`${t.verse} > 0`),
    }),
);

export const verseMark = sqliteTable(
    "verse_mark",
    {
        id: text("id").primaryKey(), // uuid
        translationRevisionId: text("translation_revision_id").notNull(),
        canonId: text("canon_id").notNull(),
        bookId: text("book_id").notNull(),
        chapter: integer("chapter").notNull(),
        verse: integer("verse").notNull(),
        kind: text("kind").notNull(),
        ord: integer("ord").notNull(),
        payload: text("payload"), // JSON string optional
    },
    (t) => ({
        verseIdx: index("verse_mark_verse_idx").on(
            t.translationRevisionId,
            t.canonId,
            t.bookId,
            t.chapter,
            t.verse,
            t.ord,
        ),
        kindCheck: check(
            "verse_mark_kind_check",
            sql`${t.kind} in ('heading','subheading','paragraph_break','poetry_line','speaker','red_letter','selah')`,
        ),
        ordCheck: check("verse_mark_ord_check", sql`${t.ord} >= 0`),
    }),
);

export const footnote = sqliteTable(
    "footnote",
    {
        id: text("id").primaryKey(), // uuid
        translationRevisionId: text("translation_revision_id").notNull(),
        canonId: text("canon_id").notNull(),
        bookId: text("book_id").notNull(),
        chapter: integer("chapter").notNull(),
        verse: integer("verse").notNull(),
        marker: text("marker"),
        content: text("content").notNull(),
        ord: integer("ord").notNull().default(0),
    },
    (t) => ({
        verseIdx: index("footnote_verse_idx").on(
            t.translationRevisionId,
            t.canonId,
            t.bookId,
            t.chapter,
            t.verse,
            t.ord,
        ),
        contentCheck: check("footnote_nonempty_check", sql`length(${t.content}) > 0`),
    }),
);

/**
 * cross_ref: links a verse to another verse.
 */
export const crossRef = sqliteTable(
    "cross_ref",
    {
        id: text("id").primaryKey(), // uuid
        // from
        canonId: text("canon_id").notNull(),
        bookId: text("book_id").notNull(),
        chapter: integer("chapter").notNull(),
        verse: integer("verse").notNull(),
        // to
        toCanonId: text("to_canon_id").notNull(),
        toBookId: text("to_book_id").notNull(),
        toChapter: integer("to_chapter").notNull(),
        toVerse: integer("to_verse").notNull(),
        kind: text("kind").notNull().default("see_also"),
        note: text("note"),
        ord: integer("ord").notNull().default(0),
    },
    (t) => ({
        fromIdx: index("cross_ref_from_idx").on(t.canonId, t.bookId, t.chapter, t.verse, t.ord),
        toIdx: index("cross_ref_to_idx").on(t.toCanonId, t.toBookId, t.toChapter, t.toVerse),
        kindCheck: check("cross_ref_kind_check", sql`length(${t.kind}) > 0`),
        spanCheck: check(
            "cross_ref_span_check",
            sql`${t.chapter} > 0 and ${t.verse} > 0 and ${t.toChapter} > 0 and ${t.toVerse} > 0`,
        ),
    }),
);

/* --------------------------- Mentions (Clickable) --------------------------- */

export const verseMention = sqliteTable(
    "verse_mention",
    {
        id: text("id").primaryKey(), // uuid
        translationRevisionId: text("translation_revision_id").notNull(),
        canonId: text("canon_id").notNull(),
        bookId: text("book_id").notNull(),
        chapter: integer("chapter").notNull(),
        verse: integer("verse").notNull(),

        entityType: text("entity_type").notNull(), // person|place|event
        entityId: text("entity_id").notNull(),

        start: integer("start").notNull(), // inclusive
        end: integer("end").notNull(), // exclusive
        surface: text("surface").notNull(),

        ord: integer("ord").notNull().default(0),
        note: text("note"),
    },
    (t) => ({
        verseIdx: index("verse_mention_verse_idx").on(
            t.translationRevisionId,
            t.canonId,
            t.bookId,
            t.chapter,
            t.verse,
            t.start,
            t.end,
        ),
        entityIdx: index("verse_mention_entity_idx").on(t.entityType, t.entityId),
        typeCheck: check("verse_mention_type_check", sql`${t.entityType} in ('person','place','event')`),
        spanCheck: check("verse_mention_span_check", sql`${t.start} >= 0 and ${t.end} > ${t.start}`),
        surfaceCheck: check("verse_mention_surface_check", sql`length(${t.surface}) > 0`),
    }),
);

/* ------------------------------- People / Places ---------------------------- */

export const asset = sqliteTable(
    "asset",
    {
        id: text("id").primaryKey(), // uuid
        kind: text("kind").notNull(), // image|icon|svg
        mime: text("mime").notNull(),
        path: text("path"),
        data: text("data"),
        createdAt: text("created_at").notNull().default(nowIso),
    },
    (t) => ({
        kindCheck: check("asset_kind_check", sql`${t.kind} in ('image','icon','svg')`),
        mimeCheck: check("asset_mime_check", sql`length(${t.mime}) > 0`),
        hasOne: check("asset_has_path_or_data_check", sql`${t.path} is not null or ${t.data} is not null`),
    }),
);

export const person = sqliteTable(
    "person",
    {
        id: text("id").primaryKey(), // "p_abraham"
        displayName: text("display_name").notNull(),
        sortName: text("sort_name"),
        sex: text("sex"), // male|female|null
        title: text("title"),
        summary: text("summary"),
        bio: text("bio"),
        era: text("era"),
        imageAssetId: text("image_asset_id"),
        createdAt: text("created_at").notNull().default(nowIso),
        updatedAt: text("updated_at").notNull().default(nowIso),
    },
    (t) => ({
        nameIdx: index("person_display_name_idx").on(t.displayName),
        sortIdx: index("person_sort_name_idx").on(t.sortName),
        sexCheck: check("person_sex_check", sql`${t.sex} is null or ${t.sex} in ('male','female')`),
    }),
);

export const personAlias = sqliteTable(
    "person_alias",
    {
        id: text("id").primaryKey(), // uuid
        personId: text("person_id").notNull(),
        alias: text("alias").notNull(),
        lang: text("lang"),
        ord: integer("ord").notNull().default(0),
    },
    (t) => ({
        aliasIdx: index("person_alias_alias_idx").on(t.alias),
        personIdx: index("person_alias_person_idx").on(t.personId, t.ord),
        uniq: uniqueIndex("person_alias_unique").on(t.personId, t.alias),
        aliasCheck: check("person_alias_nonempty_check", sql`length(${t.alias}) > 0`),
    }),
);

export const personRelationship = sqliteTable(
    "person_relationship",
    {
        id: text("id").primaryKey(), // uuid
        fromPersonId: text("from_person_id").notNull(),
        toPersonId: text("to_person_id").notNull(),
        kind: text("kind").notNull(),
        confidence: real("confidence"),
        note: text("note"),
    },
    (t) => ({
        fromIdx: index("person_relationship_from_idx").on(t.fromPersonId, t.kind),
        toIdx: index("person_relationship_to_idx").on(t.toPersonId, t.kind),
        kindCheck: check(
            "person_relationship_kind_check",
            sql`${t.kind} in ('parent','child','spouse','sibling','teacher_of','disciple_of','king_of','prophet_to','enemy_of','covenant_with')`,
        ),
        confCheck: check(
            "person_relationship_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
        notSelf: check("person_relationship_not_self_check", sql`${t.fromPersonId} != ${t.toPersonId}`),
    }),
);

export const place = sqliteTable(
    "place",
    {
        id: text("id").primaryKey(), // "pl_jerusalem"
        name: text("name").notNull(),
        kind: text("kind").notNull().default("other"), // city|region|...
        // "primary" point (optional); richer geometry lives in place_geo.
        lat: real("lat"),
        lon: real("lon"),
        geojson: text("geojson"), // optional legacy/quick geometry
        summary: text("summary"),
        description: text("description"),
        era: text("era"),
        imageAssetId: text("image_asset_id"),
        createdAt: text("created_at").notNull().default(nowIso),
        updatedAt: text("updated_at").notNull().default(nowIso),
    },
    (t) => ({
        nameIdx: index("place_name_idx").on(t.name),
        coordIdx: index("place_coord_idx").on(t.lat, t.lon),
        kindCheck: check(
            "place_kind_check",
            sql`${t.kind} in ('city','region','river','mountain','sea','desert','route','other')`,
        ),
        latCheck: check("place_lat_check", sql`${t.lat} is null or (${t.lat} >= -90 and ${t.lat} <= 90)`),
        lonCheck: check("place_lon_check", sql`${t.lon} is null or (${t.lon} >= -180 and ${t.lon} <= 180)`),
    }),
);

export const placeAlias = sqliteTable(
    "place_alias",
    {
        id: text("id").primaryKey(),
        placeId: text("place_id").notNull(),
        alias: text("alias").notNull(),
        lang: text("lang"),
        ord: integer("ord").notNull().default(0),
    },
    (t) => ({
        aliasIdx: index("place_alias_alias_idx").on(t.alias),
        placeIdx: index("place_alias_place_idx").on(t.placeId, t.ord),
        uniq: uniqueIndex("place_alias_unique").on(t.placeId, t.alias),
        aliasCheck: check("place_alias_nonempty_check", sql`length(${t.alias}) > 0`),
    }),
);

export const personPlace = sqliteTable(
    "person_place",
    {
        id: text("id").primaryKey(),
        personId: text("person_id").notNull(),
        placeId: text("place_id").notNull(),
        kind: text("kind").notNull(),
        timeHint: text("time_hint"),
        sourceRef: text("source_ref"), // may store JSON or "GEN 12:1-9"
        note: text("note"),
        ord: integer("ord").notNull().default(0),
    },
    (t) => ({
        personIdx: index("person_place_person_idx").on(t.personId, t.kind, t.ord),
        placeIdx: index("person_place_place_idx").on(t.placeId, t.kind),
        kindCheck: check(
            "person_place_kind_check",
            sql`${t.kind} in ('born_in','died_in','lived_in','traveled_to','ministered_in','exiled_to','battle_at','imprisoned_in')`,
        ),
    }),
);

/* ------------------------------ Journeys / Routes --------------------------- */

export const journey = sqliteTable(
    "journey",
    {
        id: text("id").primaryKey(),
        personId: text("person_id"),
        label: text("label").notNull(),
        summary: text("summary"),
        era: text("era"),
        ord: integer("ord").notNull().default(0),
    },
    (t) => ({
        personIdx: index("journey_person_idx").on(t.personId, t.ord),
        labelIdx: index("journey_label_idx").on(t.label),
        labelCheck: check("journey_label_check", sql`length(${t.label}) > 0`),
    }),
);

export const journeyStop = sqliteTable(
    "journey_stop",
    {
        id: text("id").primaryKey(),
        journeyId: text("journey_id").notNull(),
        seq: integer("seq").notNull(),
        placeId: text("place_id").notNull(),
        note: text("note"),
        canonId: text("canon_id"),
        bookId: text("book_id"),
        chapter: integer("chapter"),
        verse: integer("verse"),
    },
    (t) => ({
        uniq: uniqueIndex("journey_stop_unique_seq").on(t.journeyId, t.seq),
        journeyIdx: index("journey_stop_journey_idx").on(t.journeyId, t.seq),
        placeIdx: index("journey_stop_place_idx").on(t.placeId),
        seqCheck: check("journey_stop_seq_check", sql`${t.seq} >= 0`),
        refCheck: check(
            "journey_stop_ref_check",
            sql`(${t.chapter} is null and ${t.verse} is null) or (${t.chapter} > 0 and ${t.verse} > 0)`,
        ),
    }),
);

/**
 * journey_path: optional geometry for rendering a journey as one or more lines.
 * Keep it simple: GeoJSON LineString/MultiLineString in WGS84, plus provenance + confidence.
 */
export const journeyPath = sqliteTable(
    "journey_path",
    {
        id: text("id").primaryKey(), // uuid
        journeyId: text("journey_id").notNull(),
        seq: integer("seq").notNull().default(0),
        geojson: text("geojson").notNull(),
        sourceDocId: text("source_doc_id"),
        sourceRef: text("source_ref"), // optional scripture ref / note
        confidence: real("confidence"),
        note: text("note"),
        createdAt: text("created_at").notNull().default(nowIso),
        updatedAt: text("updated_at").notNull().default(nowIso),
    },
    (t) => ({
        uniq: uniqueIndex("journey_path_unique_seq").on(t.journeyId, t.seq),
        journeyIdx: index("journey_path_journey_idx").on(t.journeyId, t.seq),
        geojsonCheck: check("journey_path_geojson_check", sql`length(${t.geojson}) > 0`),
        confCheck: check(
            "journey_path_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
    }),
);

/* ----------------------------------- Events -------------------------------- */

export const event = sqliteTable(
    "event",
    {
        id: text("id").primaryKey(), // "ev_*"
        title: text("title").notNull(),
        summary: text("summary"),
        placeId: text("place_id"),
        era: text("era"),
        timeHint: text("time_hint"),
        createdAt: text("created_at").notNull().default(nowIso),
        updatedAt: text("updated_at").notNull().default(nowIso),
    },
    (t) => ({
        titleIdx: index("event_title_idx").on(t.title),
        placeIdx: index("event_place_idx").on(t.placeId),
        titleCheck: check("event_title_check", sql`length(${t.title}) > 0`),
    }),
);

export const eventParticipant = sqliteTable(
    "event_participant",
    {
        id: text("id").primaryKey(),
        eventId: text("event_id").notNull(),
        personId: text("person_id").notNull(),
        role: text("role"),
        ord: integer("ord").notNull().default(0),
    },
    (t) => ({
        eventIdx: index("event_participant_event_idx").on(t.eventId, t.ord),
        personIdx: index("event_participant_person_idx").on(t.personId),
        uniq: uniqueIndex("event_participant_unique").on(t.eventId, t.personId, t.role),
    }),
);

export const eventRef = sqliteTable(
    "event_ref",
    {
        id: text("id").primaryKey(),
        eventId: text("event_id").notNull(),
        canonId: text("canon_id").notNull(),
        bookId: text("book_id").notNull(),
        startChapter: integer("start_chapter").notNull(),
        startVerse: integer("start_verse").notNull(),
        endChapter: integer("end_chapter").notNull(),
        endVerse: integer("end_verse").notNull(),
        ord: integer("ord").notNull().default(0),
    },
    (t) => ({
        eventIdx: index("event_ref_event_idx").on(t.eventId, t.ord),
        rangeIdx: index("event_ref_range_idx").on(t.canonId, t.bookId, t.startChapter, t.startVerse),
        spanCheck: check(
            "event_ref_span_check",
            sql`${t.startChapter} > 0 and ${t.startVerse} > 0 and ${t.endChapter} > 0 and ${t.endVerse} > 0`,
        ),
    }),
);

/* -------------------------- Traceability (Scripture-grounded) -------------------------- */
/**
 * entity_source: attach Scripture references to claims in bios/summaries.
 */
export const entitySource = sqliteTable(
    "entity_source",
    {
        id: text("id").primaryKey(), // uuid
        entityType: text("entity_type").notNull(), // person|place|event
        entityId: text("entity_id").notNull(),
        canonId: text("canon_id").notNull(),
        bookId: text("book_id").notNull(),
        startChapter: integer("start_chapter").notNull(),
        startVerse: integer("start_verse").notNull(),
        endChapter: integer("end_chapter").notNull(),
        endVerse: integer("end_verse").notNull(),
        note: text("note"),
        ord: integer("ord").notNull().default(0),
    },
    (t) => ({
        entityIdx: index("entity_source_entity_idx").on(t.entityType, t.entityId, t.ord),
        rangeIdx: index("entity_source_range_idx").on(t.canonId, t.bookId, t.startChapter, t.startVerse),
        typeCheck: check("entity_source_type_check", sql`${t.entityType} in ('person','place','event')`),
        spanCheck: check(
            "entity_source_span_check",
            sql`${t.startChapter} > 0 and ${t.startVerse} > 0 and ${t.endChapter} > 0 and ${t.endVerse} > 0`,
        ),
    }),
);

/* ------------------------------- Source Documents --------------------------- */
/**
 * source_doc: structured citations for non-scripture provenance (gazetteers, atlases, papers),
 * and can also hold “Scripture” as a first-class source if you want consistent referencing.
 */
export const sourceDoc = sqliteTable(
    "source_doc",
    {
        id: text("id").primaryKey(), // uuid or stable slug
        kind: text("kind").notNull(), // scripture|gazetteer|atlas|academic|tradition|other
        title: text("title").notNull(),
        author: text("author"),
        year: integer("year"),
        url: text("url"),
        license: text("license"),
        citation: text("citation"), // free-form short citation string
        note: text("note"),
        createdAt: text("created_at").notNull().default(nowIso),
        updatedAt: text("updated_at").notNull().default(nowIso),
    },
    (t) => ({
        kindIdx: index("source_doc_kind_idx").on(t.kind),
        titleIdx: index("source_doc_title_idx").on(t.title),
        kindCheck: check(
            "source_doc_kind_check",
            sql`${t.kind} in ('scripture','gazetteer','atlas','academic','tradition','other')`,
        ),
        titleCheck: check("source_doc_title_check", sql`length(${t.title}) > 0`),
        yearCheck: check("source_doc_year_check", sql`${t.year} is null or (${t.year} >= 0 and ${t.year} <= 3000)`),
    }),
);

/* ------------------------------- Geo Engine -------------------------------- */
/**
 * place_geo:
 * - multiple geometry candidates per place (point/bbox/polygon/polyline)
 * - confidence + provenance (source_doc + optional scripture ref)
 * - bbox fields make map extents fast without parsing GeoJSON
 */
export const placeGeo = sqliteTable(
    "place_geo",
    {
        id: text("id").primaryKey(), // uuid
        placeId: text("place_id").notNull(),
        kind: text("kind").notNull(), // point|bbox|polygon|polyline

        // point (optional)
        lat: real("lat"),
        lon: real("lon"),

        // bbox (optional, but recommended when kind=bbox/polygon/polyline)
        minLat: real("min_lat"),
        minLon: real("min_lon"),
        maxLat: real("max_lat"),
        maxLon: real("max_lon"),

        // full geometry (GeoJSON). For point-only you can omit geojson.
        geojson: text("geojson"),

        // provenance
        sourceDocId: text("source_doc_id"),
        sourceRef: text("source_ref"), // "GEN 12:1-9" or JSON
        confidence: real("confidence"),
        note: text("note"),
        ord: integer("ord").notNull().default(0),

        createdAt: text("created_at").notNull().default(nowIso),
        updatedAt: text("updated_at").notNull().default(nowIso),
    },
    (t) => ({
        placeIdx: index("place_geo_place_idx").on(t.placeId, t.ord),
        kindIdx: index("place_geo_kind_idx").on(t.placeId, t.kind),
        bboxIdx: index("place_geo_bbox_idx").on(t.minLat, t.minLon, t.maxLat, t.maxLon),

        kindCheck: check(
            "place_geo_kind_check",
            sql`${t.kind} in ('point','bbox','polygon','polyline')`,
        ),
        latCheck: check("place_geo_lat_check", sql`${t.lat} is null or (${t.lat} >= -90 and ${t.lat} <= 90)`),
        lonCheck: check("place_geo_lon_check", sql`${t.lon} is null or (${t.lon} >= -180 and ${t.lon} <= 180)`),

        bboxCheck: check(
            "place_geo_bbox_check",
            sql`(${t.minLat} is null and ${t.minLon} is null and ${t.maxLat} is null and ${t.maxLon} is null)
          or (${t.minLat} <= ${t.maxLat} and ${t.minLon} <= ${t.maxLon})`,
        ),
        confCheck: check(
            "place_geo_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
        ordCheck: check("place_geo_ord_check", sql`${t.ord} >= 0`),
    }),
);

/* ------------------------------ Chrono Engine ------------------------------ */
/**
 * chrono_span: attach a time window to any entity.
 * Uses signed years for BCE/CE (e.g., -1200, -5, 30).
 * Granularity can be "year-only" (month/day null) or more precise.
 */
export const chronoSpan = sqliteTable(
    "chrono_span",
    {
        id: text("id").primaryKey(), // uuid
        entityType: text("entity_type").notNull(), // person|place|event|journey
        entityId: text("entity_id").notNull(),

        kind: text("kind").notNull(), // life|reign|ministry|journey|event_window|composition|other
        precision: text("precision").notNull().default("uncertain"), // exact|approx|uncertain

        startYear: integer("start_year"),
        startMonth: integer("start_month"),
        startDay: integer("start_day"),

        endYear: integer("end_year"),
        endMonth: integer("end_month"),
        endDay: integer("end_day"),

        // provenance
        sourceDocId: text("source_doc_id"),
        sourceRef: text("source_ref"), // scripture ref / note / JSON
        confidence: real("confidence"),
        note: text("note"),
        ord: integer("ord").notNull().default(0),

        createdAt: text("created_at").notNull().default(nowIso),
        updatedAt: text("updated_at").notNull().default(nowIso),
    },
    (t) => ({
        entityIdx: index("chrono_span_entity_idx").on(t.entityType, t.entityId, t.kind, t.ord),
        kindIdx: index("chrono_span_kind_idx").on(t.kind),
        rangeIdx: index("chrono_span_range_idx").on(t.startYear, t.endYear),

        typeCheck: check(
            "chrono_span_entity_type_check",
            sql`${t.entityType} in ('person','place','event','journey')`,
        ),
        kindCheck: check(
            "chrono_span_kind_check",
            sql`${t.kind} in ('life','reign','ministry','journey','event_window','composition','other')`,
        ),
        precisionCheck: check(
            "chrono_span_precision_check",
            sql`${t.precision} in ('exact','approx','uncertain')`,
        ),

        // month/day sanity (allow null)
        startMonthCheck: check(
            "chrono_span_start_month_check",
            sql`${t.startMonth} is null or (${t.startMonth} >= 1 and ${t.startMonth} <= 12)`,
        ),
        endMonthCheck: check(
            "chrono_span_end_month_check",
            sql`${t.endMonth} is null or (${t.endMonth} >= 1 and ${t.endMonth} <= 12)`,
        ),
        startDayCheck: check(
            "chrono_span_start_day_check",
            sql`${t.startDay} is null or (${t.startDay} >= 1 and ${t.startDay} <= 31)`,
        ),
        endDayCheck: check(
            "chrono_span_end_day_check",
            sql`${t.endDay} is null or (${t.endDay} >= 1 and ${t.endDay} <= 31)`,
        ),

        // confidence
        confCheck: check(
            "chrono_span_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
        ordCheck: check("chrono_span_ord_check", sql`${t.ord} >= 0`),
    }),
);

/**
 * chrono_relation: express time relationships without committing to absolute years.
 * Example: "Exodus occurs after Joseph's death", "Paul's ministry overlaps with ...".
 */
export const chronoRelation = sqliteTable(
    "chrono_relation",
    {
        id: text("id").primaryKey(), // uuid
        fromEntityType: text("from_entity_type").notNull(),
        fromEntityId: text("from_entity_id").notNull(),
        toEntityType: text("to_entity_type").notNull(),
        toEntityId: text("to_entity_id").notNull(),

        kind: text("kind").notNull(), // before|after|during|overlaps|same_time|unknown
        confidence: real("confidence"),
        note: text("note"),

        sourceDocId: text("source_doc_id"),
        sourceRef: text("source_ref"),
        createdAt: text("created_at").notNull().default(nowIso),
    },
    (t) => ({
        fromIdx: index("chrono_relation_from_idx").on(t.fromEntityType, t.fromEntityId, t.kind),
        toIdx: index("chrono_relation_to_idx").on(t.toEntityType, t.toEntityId, t.kind),
        kindCheck: check(
            "chrono_relation_kind_check",
            sql`${t.kind} in ('before','after','during','overlaps','same_time','unknown')`,
        ),
        confCheck: check(
            "chrono_relation_conf_check",
            sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
        ),
        notSelfCheck: check(
            "chrono_relation_not_self_check",
            sql`not (${t.fromEntityType} = ${t.toEntityType} and ${t.fromEntityId} = ${t.toEntityId})`,
        ),
    }),
);

/* ----------------------------------- Tags ---------------------------------- */

export const tag = sqliteTable(
    "tag",
    {
        id: text("id").primaryKey(), // uuid
        slug: text("slug").notNull(), // "patriarch", "prophet", "king", ...
        label: text("label").notNull(), // "Patriarch"
        kind: text("kind").notNull().default("general"), // general|role|era|topic
        ord: integer("ord").notNull().default(0),
    },
    (t) => ({
        slugUniq: uniqueIndex("tag_unique_slug").on(t.slug),
        kindCheck: check("tag_kind_check", sql`${t.kind} in ('general','role','era','topic')`),
        slugCheck: check("tag_slug_check", sql`length(${t.slug}) > 0`),
        labelCheck: check("tag_label_check", sql`length(${t.label}) > 0`),
    }),
);

export const personTag = sqliteTable(
    "person_tag",
    {
        personId: text("person_id").notNull(),
        tagId: text("tag_id").notNull(),
        ord: integer("ord").notNull().default(0),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.personId, t.tagId] }),
        idx: index("person_tag_person_idx").on(t.personId, t.ord),
    }),
);

export const placeTag = sqliteTable(
    "place_tag",
    {
        placeId: text("place_id").notNull(),
        tagId: text("tag_id").notNull(),
        ord: integer("ord").notNull().default(0),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.placeId, t.tagId] }),
        idx: index("place_tag_place_idx").on(t.placeId, t.ord),
    }),
);

/* ------------------------------ User Layer (Local) -------------------------- */

export const user = sqliteTable("user", {
    id: text("id").primaryKey(), // "local" or uuid
    displayName: text("display_name"),
    createdAt: text("created_at").notNull().default(nowIso),
});

export const bookmark = sqliteTable(
    "bookmark",
    {
        id: text("id").primaryKey(),
        userId: text("user_id").notNull(),
        canonId: text("canon_id").notNull(),
        bookId: text("book_id").notNull(),
        chapter: integer("chapter").notNull(),
        verse: integer("verse").notNull(),
        label: text("label"),
        createdAt: text("created_at").notNull().default(nowIso),
    },
    (t) => ({
        userIdx: index("bookmark_user_idx").on(t.userId, t.createdAt),
        refIdx: index("bookmark_ref_idx").on(t.userId, t.canonId, t.bookId, t.chapter, t.verse),
        chapterCheck: check("bookmark_chapter_check", sql`${t.chapter} > 0`),
        verseCheck: check("bookmark_verse_check", sql`${t.verse} > 0`),
    }),
);

export const highlight = sqliteTable(
    "highlight",
    {
        id: text("id").primaryKey(),
        userId: text("user_id").notNull(),
        canonId: text("canon_id").notNull(),
        bookId: text("book_id").notNull(),
        chapter: integer("chapter").notNull(),
        verse: integer("verse").notNull(),
        start: integer("start"),
        end: integer("end"),
        color: text("color").notNull(),
        note: text("note"),
        createdAt: text("created_at").notNull().default(nowIso),
        updatedAt: text("updated_at").notNull().default(nowIso),
    },
    (t) => ({
        userIdx: index("highlight_user_idx").on(t.userId, t.createdAt),
        refIdx: index("highlight_ref_idx").on(t.userId, t.canonId, t.bookId, t.chapter, t.verse),
        colorCheck: check(
            "highlight_color_check",
            sql`${t.color} in ('gray','yellow','green','blue','purple','red')`,
        ),
        spanCheck: check(
            "highlight_span_check",
            sql`(${t.start} is null and ${t.end} is null) or (${t.start} >= 0 and ${t.end} > ${t.start})`,
        ),
    }),
);

export const note = sqliteTable(
    "note",
    {
        id: text("id").primaryKey(),
        userId: text("user_id").notNull(),
        canonId: text("canon_id"),
        bookId: text("book_id"),
        chapter: integer("chapter"),
        verse: integer("verse"),
        entityType: text("entity_type"),
        entityId: text("entity_id"),
        title: text("title"),
        body: text("body").notNull(),
        createdAt: text("created_at").notNull().default(nowIso),
        updatedAt: text("updated_at").notNull().default(nowIso),
    },
    (t) => ({
        userIdx: index("note_user_idx").on(t.userId, t.createdAt),
        verseIdx: index("note_verse_idx").on(t.userId, t.canonId, t.bookId, t.chapter, t.verse),
        entityIdx: index("note_entity_idx").on(t.userId, t.entityType, t.entityId),
        typeCheck: check(
            "note_entity_type_check",
            sql`${t.entityType} is null or ${t.entityType} in ('person','place','event')`,
        ),
        bodyCheck: check("note_body_nonempty_check", sql`length(${t.body}) > 0`),
    }),
);

export const readingProgress = sqliteTable(
    "reading_progress",
    {
        userId: text("user_id").notNull(),
        canonId: text("canon_id").notNull(),
        bookId: text("book_id").notNull(),
        chapter: integer("chapter").notNull(),
        verse: integer("verse").notNull(),
        updatedAt: text("updated_at").notNull().default(nowIso),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.userId, t.canonId, t.bookId] }),
        chapterCheck: check("reading_progress_chapter_check", sql`${t.chapter} > 0`),
        verseCheck: check("reading_progress_verse_check", sql`${t.verse} > 0`),
    }),
);

/**
 * settings: local app preferences (theme, preferred canon, font scale, etc.)
 */
export const settings = sqliteTable(
    "settings",
    {
        userId: text("user_id").notNull(),
        key: text("key").notNull(),
        value: text("value").notNull(), // store JSON
        updatedAt: text("updated_at").notNull().default(nowIso),
    },
    (t) => ({
        pk: primaryKey({ columns: [t.userId, t.key] }),
        keyCheck: check("settings_key_check", sql`length(${t.key}) > 0`),
        valueCheck: check("settings_value_check", sql`length(${t.value}) > 0`),
    }),
);

/**
 * drawer_history: optional UX helper to keep back/forward inside the drawer.
 */
export const drawerHistory = sqliteTable(
    "drawer_history",
    {
        id: text("id").primaryKey(), // uuid
        userId: text("user_id").notNull(),
        createdAt: text("created_at").notNull().default(nowIso),
        entityType: text("entity_type").notNull(),
        entityId: text("entity_id").notNull(),
        canonId: text("canon_id"),
        bookId: text("book_id"),
        chapter: integer("chapter"),
        verse: integer("verse"),
    },
    (t) => ({
        userIdx: index("drawer_history_user_idx").on(t.userId, t.createdAt),
        entityIdx: index("drawer_history_entity_idx").on(t.entityType, t.entityId),
        typeCheck: check(
            "drawer_history_type_check",
            sql`${t.entityType} in ('person','place','event')`,
        ),
        refCheck: check(
            "drawer_history_ref_check",
            sql`(${t.chapter} is null and ${t.verse} is null) or (${t.chapter} > 0 and ${t.verse} > 0)`,
        ),
    }),
);

/* ------------------------------------ FTS ----------------------------------- */

export const FTS_MIGRATION_SQL = `
-- FTS5 for verse text search
CREATE VIRTUAL TABLE IF NOT EXISTS verse_text_fts USING fts5(
  translation_revision_id UNINDEXED,
  canon_id UNINDEXED,
  book_id UNINDEXED,
  chapter UNINDEXED,
  verse UNINDEXED,
  text,
  content='verse_text',
  content_rowid='rowid'
);

-- Sync triggers (optional but recommended)
CREATE TRIGGER IF NOT EXISTS verse_text_ai AFTER INSERT ON verse_text BEGIN
  INSERT INTO verse_text_fts(rowid, translation_revision_id, canon_id, book_id, chapter, verse, text)
  VALUES (new.rowid, new.translation_revision_id, new.canon_id, new.book_id, new.chapter, new.verse, new.text);
END;

CREATE TRIGGER IF NOT EXISTS verse_text_ad AFTER DELETE ON verse_text BEGIN
  INSERT INTO verse_text_fts(verse_text_fts, rowid, translation_revision_id, canon_id, book_id, chapter, verse, text)
  VALUES ('delete', old.rowid, old.translation_revision_id, old.canon_id, old.book_id, old.chapter, old.verse, old.text);
END;

CREATE TRIGGER IF NOT EXISTS verse_text_au AFTER UPDATE ON verse_text BEGIN
  INSERT INTO verse_text_fts(verse_text_fts, rowid, translation_revision_id, canon_id, book_id, chapter, verse, text)
  VALUES ('delete', old.rowid, old.translation_revision_id, old.canon_id, old.book_id, old.chapter, old.verse, old.text);

  INSERT INTO verse_text_fts(rowid, translation_revision_id, canon_id, book_id, chapter, verse, text)
  VALUES (new.rowid, new.translation_revision_id, new.canon_id, new.book_id, new.chapter, new.verse, new.text);
END;
`;

/* ----------------------------- Export convenience --------------------------- */

export const schema = {
    canonBook,
    chapter,
    verse,

    translation,
    translationRevision,
    translationDefaultRevision,

    verseText,
    verseMark,
    footnote,
    crossRef,
    verseMention,

    asset,
    person,
    personAlias,
    personRelationship,
    place,
    placeAlias,
    personPlace,

    journey,
    journeyStop,
    journeyPath,

    event,
    eventParticipant,
    eventRef,

    entitySource,

    // chrono/geo engine
    sourceDoc,
    placeGeo,
    chronoSpan,
    chronoRelation,

    tag,
    personTag,
    placeTag,

    user,
    bookmark,
    highlight,
    note,
    readingProgress,
    settings,
    drawerHistory,
};