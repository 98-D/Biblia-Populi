// apps/api/src/server.ts
// Biblia Populi — Production API server (Bun + Hono + Drizzle + bun:sqlite)
//
// Upgraded to match the **current bp_* schema** (orientation-only):
// - No canon_id
// - No translation revisions
// - Verse identity is bp_verse (verse_key + verse_ord)
// - Text is bp_verse_text keyed by (translation_id, verse_key)
// - Entities are bp_entity (+ bp_entity_name / bp_entity_relation)
// - Events are bp_event (+ bp_event_participant)
// - Optional search uses FTS5 table: bp_verse_text_fts (created by migrate.ts extras)
//
// Endpoints (stable, reading-first):
//   GET  /health
//   GET  /meta
//   GET  /books
//   GET  /chapters/:bookId
//   GET  /chapter/:bookId/:chapter
//   GET  /search?q=...
//   GET  /people/:id
//   GET  /places/:id
//   GET  /events/:id
//
// Notes:
// - /chapter returns { verses, ranges, links, crossrefs } and keeps legacy fields
//   { marks, mentions, footnotes } as empty arrays for transition safety.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { compress } from "hono/compress";
import { etag } from "hono/etag";
import { z } from "zod";
import { and, asc, eq, like, sql as dsql, inArray } from "drizzle-orm";

import { db, sqlite } from "./db/client";
import {
    bpBook,
    bpChapter,
    bpVerse,
    bpVerseText,
    bpTranslation,
    bpRange,
    bpLink,
    bpCrossref,
    bpEntity,
    bpEntityName,
    bpEntityRelation,
    bpPlaceGeo,
    bpEvent,
    bpEventParticipant,
} from "./db/schema";

/* --------------------------------- Config --------------------------------- */

const PORT = Number(process.env.PORT ?? "3000");

// Prefer explicit env, else fall back to DB default translation (bp_translation.is_default)
const ENV_TRANSLATION_ID = (process.env.BP_TRANSLATION_ID ?? "").trim();

/* --------------------------------- Helpers -------------------------------- */

type JsonOk<T> = Readonly<{ ok: true; data: T }>;
type JsonErr = Readonly<{ ok: false; error: { code: string; message: string } }>;

function jsonOk<T>(c: any, data: T, extraHeaders?: Record<string, string>) {
    if (extraHeaders) {
        for (const [k, v] of Object.entries(extraHeaders)) c.header(k, v);
    }
    const body: JsonOk<T> = { ok: true, data };
    return c.json(body);
}

function jsonErr(c: any, status: number, code: string, message: string) {
    const body: JsonErr = { ok: false, error: { code, message } };
    return c.json(body, status);
}

function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
}

function cacheNoStore(c: any) {
    c.header("Cache-Control", "no-store");
}

function cachePublic(c: any, seconds: number) {
    c.header("Cache-Control", `public, max-age=${seconds}`);
}

const RefBookIdSchema = z
    .string()
    .min(2)
    .max(8)
    .regex(/^[A-Z0-9_]+$/);

const ChapterNumSchema = z.coerce.number().int().min(1).max(200);

const SearchQuerySchema = z.string().trim().min(1).max(200);

let _resolvedTranslationId: string | null = null;

async function resolveTranslationId(): Promise<string | null> {
    if (_resolvedTranslationId) return _resolvedTranslationId;

    if (ENV_TRANSLATION_ID) {
        _resolvedTranslationId = ENV_TRANSLATION_ID;
        return _resolvedTranslationId;
    }

    const rows = await db
        .select({ translationId: bpTranslation.translationId })
        .from(bpTranslation)
        .where(eq(bpTranslation.isDefault, true))
        .limit(1);

    _resolvedTranslationId = rows[0]?.translationId ?? null;
    return _resolvedTranslationId;
}

function hasFts(): boolean {
    const row = sqlite
        .query(`SELECT 1 AS one FROM sqlite_master WHERE type='table' AND name='bp_verse_text_fts' LIMIT 1;`)
        .get() as { one?: number } | undefined;

    return row != null;
}

type ChapterBounds = Readonly<{
    startVerseOrd: number;
    endVerseOrd: number;
    verseCount?: number;
    source: "bp_chapter" | "computed";
}>;

async function getChapterBounds(bookId: string, chapter: number): Promise<ChapterBounds | null> {
    // Prefer bp_chapter if present
    const byChapter = await db
        .select({
            startVerseOrd: bpChapter.startVerseOrd,
            endVerseOrd: bpChapter.endVerseOrd,
            verseCount: bpChapter.verseCount,
        })
        .from(bpChapter)
        .where(and(eq(bpChapter.bookId, bookId), eq(bpChapter.chapter, chapter)))
        .limit(1);

    if (byChapter[0]) {
        return {
            startVerseOrd: byChapter[0].startVerseOrd,
            endVerseOrd: byChapter[0].endVerseOrd,
            verseCount: byChapter[0].verseCount,
            source: "bp_chapter",
        };
    }

    // Fallback: compute from bp_verse
    const agg = await db
        .select({
            startVerseOrd: dsql<number>`min(${bpVerse.verseOrd})`.as("start_verse_ord"),
            endVerseOrd: dsql<number>`max(${bpVerse.verseOrd})`.as("end_verse_ord"),
            verseCount: dsql<number>`count(*)`.as("verse_count"),
        })
        .from(bpVerse)
        .where(and(eq(bpVerse.bookId, bookId), eq(bpVerse.chapter, chapter)))
        .limit(1);

    const row = agg[0];
    if (!row || row.startVerseOrd == null || row.endVerseOrd == null) return null;

    return {
        startVerseOrd: Number(row.startVerseOrd),
        endVerseOrd: Number(row.endVerseOrd),
        verseCount: Number(row.verseCount ?? 0),
        source: "computed",
    };
}

/* ----------------------------------- App ---------------------------------- */

const app = new Hono();

// Middleware (production-friendly)
app.use("*", logger());
app.use("*", compress());
app.use("*", etag());
app.use(
    "*",
    cors({
        origin: "*",
        allowHeaders: ["Content-Type"],
        allowMethods: ["GET", "POST", "OPTIONS"],
    }),
);

// Health
app.get("/health", (c) => {
    cacheNoStore(c);
    return c.text("ok");
});

// Meta: translation + search capability
app.get("/meta", async (c) => {
    cacheNoStore(c);

    const translationId = await resolveTranslationId();
    if (!translationId) {
        return jsonErr(
            c,
            404,
            "NO_TRANSLATION",
            "No translation configured. Seed bp_translation (is_default=1) or set BP_TRANSLATION_ID.",
        );
    }

    const t = await db
        .select({
            translationId: bpTranslation.translationId,
            name: bpTranslation.name,
            language: bpTranslation.language,
            derivedFrom: bpTranslation.derivedFrom,
            licenseKind: bpTranslation.licenseKind,
            licenseText: bpTranslation.licenseText,
            sourceUrl: bpTranslation.sourceUrl,
            isDefault: bpTranslation.isDefault,
            createdAt: bpTranslation.createdAt,
        })
        .from(bpTranslation)
        .where(eq(bpTranslation.translationId, translationId))
        .limit(1);

    return jsonOk(c, {
        translation: t[0] ?? { translationId },
        ftsEnabled: hasFts(),
    });
});

// Books (canonical order)
app.get("/books", async (c) => {
    cachePublic(c, 60);

    const books = await db
        .select({
            bookId: bpBook.bookId,
            ordinal: bpBook.ordinal,
            testament: bpBook.testament,
            name: bpBook.name,
            nameShort: bpBook.nameShort,
            chapters: bpBook.chapters,
            osised: bpBook.osised,
            abbrs: bpBook.abbrs,
        })
        .from(bpBook)
        .orderBy(asc(bpBook.ordinal));

    return jsonOk(c, { books });
});

// Chapters meta for a book
app.get("/chapters/:bookId", async (c) => {
    cachePublic(c, 60);

    const bookIdP = RefBookIdSchema.safeParse(c.req.param("bookId"));
    if (!bookIdP.success) return jsonErr(c, 400, "BAD_BOOK", "Invalid bookId.");

    const bookId = bookIdP.data;

    // Prefer bp_chapter rows if present for this book
    const rows = await db
        .select({
            chapter: bpChapter.chapter,
            startVerseOrd: bpChapter.startVerseOrd,
            endVerseOrd: bpChapter.endVerseOrd,
            verseCount: bpChapter.verseCount,
        })
        .from(bpChapter)
        .where(eq(bpChapter.bookId, bookId))
        .orderBy(asc(bpChapter.chapter));

    if (rows.length > 0) {
        return jsonOk(c, { bookId, chapters: rows });
    }

    // Fallback: compute distinct chapters from bp_verse
    const chapters = await db
        .select({
            chapter: bpVerse.chapter,
            startVerseOrd: dsql<number>`min(${bpVerse.verseOrd})`.as("start_verse_ord"),
            endVerseOrd: dsql<number>`max(${bpVerse.verseOrd})`.as("end_verse_ord"),
            verseCount: dsql<number>`count(*)`.as("verse_count"),
        })
        .from(bpVerse)
        .where(eq(bpVerse.bookId, bookId))
        .groupBy(bpVerse.chapter)
        .orderBy(asc(bpVerse.chapter));

    return jsonOk(c, {
        bookId,
        chapters: chapters.map((r) => ({
            chapter: Number(r.chapter),
            startVerseOrd: Number(r.startVerseOrd),
            endVerseOrd: Number(r.endVerseOrd),
            verseCount: Number(r.verseCount),
        })),
    });
});

// Fetch a chapter: verse text + (optional) ranges/links/crossrefs
app.get("/chapter/:bookId/:chapter", async (c) => {
    cachePublic(c, 30);

    const bookIdP = RefBookIdSchema.safeParse(c.req.param("bookId"));
    if (!bookIdP.success) return jsonErr(c, 400, "BAD_BOOK", "Invalid bookId.");

    const chapterP = ChapterNumSchema.safeParse(c.req.param("chapter"));
    if (!chapterP.success) return jsonErr(c, 400, "BAD_CHAPTER", "Invalid chapter number.");

    const translationId = await resolveTranslationId();
    if (!translationId) {
        return jsonErr(
            c,
            404,
            "NO_TRANSLATION",
            "No translation configured. Seed bp_translation (is_default=1) or set BP_TRANSLATION_ID.",
        );
    }

    const bookId = bookIdP.data;
    const chapterNum = chapterP.data;

    const bounds = await getChapterBounds(bookId, chapterNum);
    if (!bounds) return jsonErr(c, 404, "CHAPTER_NOT_FOUND", "Chapter not found in bp_verse.");

    // Verses (join bp_verse -> bp_verse_text)
    const verses = await db
        .select({
            verseKey: bpVerse.verseKey,
            verseOrd: bpVerse.verseOrd,
            chapter: bpVerse.chapter,
            verse: bpVerse.verse,
            text: bpVerseText.text,
            updatedAt: bpVerseText.updatedAt,
        })
        .from(bpVerse)
        .leftJoin(
            bpVerseText,
            and(eq(bpVerseText.verseKey, bpVerse.verseKey), eq(bpVerseText.translationId, translationId)),
        )
        .where(and(eq(bpVerse.bookId, bookId), eq(bpVerse.chapter, chapterNum)))
        .orderBy(asc(bpVerse.verse));

    // Optional: ranges intersecting this chapter (for orientation graph)
    const ranges = await db
        .select({
            rangeId: bpRange.rangeId,
            startVerseOrd: bpRange.startVerseOrd,
            endVerseOrd: bpRange.endVerseOrd,
            startVerseKey: bpRange.startVerseKey,
            endVerseKey: bpRange.endVerseKey,
            label: bpRange.label,
        })
        .from(bpRange)
        .where(and(dsql`${bpRange.startVerseOrd} <= ${bounds.endVerseOrd}`, dsql`${bpRange.endVerseOrd} >= ${bounds.startVerseOrd}`))
        .orderBy(asc(bpRange.startVerseOrd), asc(bpRange.endVerseOrd));

    const rangeIds = ranges.map((r) => r.rangeId);

    const links =
        rangeIds.length === 0
            ? []
            : await db
                .select({
                    linkId: bpLink.linkId,
                    rangeId: bpLink.rangeId,
                    targetKind: bpLink.targetKind,
                    targetId: bpLink.targetId,
                    linkKind: bpLink.linkKind,
                    weight: bpLink.weight,
                    source: bpLink.source,
                    confidence: bpLink.confidence,
                })
                .from(bpLink)
                .where(inArray(bpLink.rangeId, rangeIds))
                .orderBy(asc(bpLink.rangeId), asc(bpLink.linkKind));

    const crossrefs =
        rangeIds.length === 0
            ? []
            : await db
                .select({
                    crossrefId: bpCrossref.crossrefId,
                    fromRangeId: bpCrossref.fromRangeId,
                    toRangeId: bpCrossref.toRangeId,
                    kind: bpCrossref.kind,
                    source: bpCrossref.source,
                    confidence: bpCrossref.confidence,
                })
                .from(bpCrossref)
                .where(inArray(bpCrossref.fromRangeId, rangeIds))
                .orderBy(asc(bpCrossref.fromRangeId));

    return jsonOk(c, {
        translationId,
        bookId,
        chapter: chapterNum,
        chapterBounds: bounds,
        verses,

        // Upgraded orientation surfaces:
        ranges,
        links,
        crossrefs,

        // Legacy placeholders (old client expectations; safe-empty):
        marks: [] as unknown[],
        mentions: [] as unknown[],
        footnotes: [] as unknown[],
    });
});

// Entity endpoints (drawer)

// PERSON
app.get("/people/:id", async (c) => {
    cachePublic(c, 60);
    const id = c.req.param("id");

    const ent = await db
        .select({
            entityId: bpEntity.entityId,
            kind: bpEntity.kind,
            canonicalName: bpEntity.canonicalName,
            slug: bpEntity.slug,
            summaryNeutral: bpEntity.summaryNeutral,
            confidence: bpEntity.confidence,
            createdAt: bpEntity.createdAt,
        })
        .from(bpEntity)
        .where(and(eq(bpEntity.entityId, id), eq(bpEntity.kind, "PERSON")))
        .limit(1);

    if (!ent[0]) return jsonOk(c, null);

    const names = await db
        .select({
            entityNameId: bpEntityName.entityNameId,
            name: bpEntityName.name,
            language: bpEntityName.language,
            isPrimary: bpEntityName.isPrimary,
            source: bpEntityName.source,
            confidence: bpEntityName.confidence,
        })
        .from(bpEntityName)
        .where(eq(bpEntityName.entityId, id))
        .orderBy(asc(bpEntityName.name));

    const relFrom = await db
        .select({
            relationId: bpEntityRelation.relationId,
            fromEntityId: bpEntityRelation.fromEntityId,
            toEntityId: bpEntityRelation.toEntityId,
            kind: bpEntityRelation.kind,
            timeSpanId: bpEntityRelation.timeSpanId,
            source: bpEntityRelation.source,
            confidence: bpEntityRelation.confidence,
            noteNeutral: bpEntityRelation.noteNeutral,
        })
        .from(bpEntityRelation)
        .where(eq(bpEntityRelation.fromEntityId, id));

    const relTo = await db
        .select({
            relationId: bpEntityRelation.relationId,
            fromEntityId: bpEntityRelation.fromEntityId,
            toEntityId: bpEntityRelation.toEntityId,
            kind: bpEntityRelation.kind,
            timeSpanId: bpEntityRelation.timeSpanId,
            source: bpEntityRelation.source,
            confidence: bpEntityRelation.confidence,
            noteNeutral: bpEntityRelation.noteNeutral,
        })
        .from(bpEntityRelation)
        .where(eq(bpEntityRelation.toEntityId, id));

    return jsonOk(c, {
        entity: ent[0],
        names,
        relations: { from: relFrom, to: relTo },
    });
});

// PLACE (+ geo)
app.get("/places/:id", async (c) => {
    cachePublic(c, 60);
    const id = c.req.param("id");

    const ent = await db
        .select({
            entityId: bpEntity.entityId,
            kind: bpEntity.kind,
            canonicalName: bpEntity.canonicalName,
            slug: bpEntity.slug,
            summaryNeutral: bpEntity.summaryNeutral,
            confidence: bpEntity.confidence,
            createdAt: bpEntity.createdAt,
        })
        .from(bpEntity)
        .where(and(eq(bpEntity.entityId, id), eq(bpEntity.kind, "PLACE")))
        .limit(1);

    if (!ent[0]) return jsonOk(c, null);

    const names = await db
        .select({
            entityNameId: bpEntityName.entityNameId,
            name: bpEntityName.name,
            language: bpEntityName.language,
            isPrimary: bpEntityName.isPrimary,
            source: bpEntityName.source,
            confidence: bpEntityName.confidence,
        })
        .from(bpEntityName)
        .where(eq(bpEntityName.entityId, id))
        .orderBy(asc(bpEntityName.name));

    const geos = await db
        .select({
            placeGeoId: bpPlaceGeo.placeGeoId,
            geoType: bpPlaceGeo.geoType,
            lat: bpPlaceGeo.lat,
            lng: bpPlaceGeo.lng,
            bbox: bpPlaceGeo.bbox,
            polygon: bpPlaceGeo.polygon,
            precisionM: bpPlaceGeo.precisionM,
            source: bpPlaceGeo.source,
            confidence: bpPlaceGeo.confidence,
        })
        .from(bpPlaceGeo)
        .where(eq(bpPlaceGeo.entityId, id));

    return jsonOk(c, { entity: ent[0], names, geos });
});

// EVENT (+ participants)
app.get("/events/:id", async (c) => {
    cachePublic(c, 60);
    const id = c.req.param("id");

    const ev = await db
        .select({
            eventId: bpEvent.eventId,
            canonicalTitle: bpEvent.canonicalTitle,
            kind: bpEvent.kind,
            primaryRangeId: bpEvent.primaryRangeId,
            timeSpanId: bpEvent.timeSpanId,
            primaryPlaceId: bpEvent.primaryPlaceId,
            source: bpEvent.source,
            confidence: bpEvent.confidence,
        })
        .from(bpEvent)
        .where(eq(bpEvent.eventId, id))
        .limit(1);

    if (!ev[0]) return jsonOk(c, null);

    const participants = await db
        .select({
            eventParticipantId: bpEventParticipant.eventParticipantId,
            entityId: bpEventParticipant.entityId,
            role: bpEventParticipant.role,
            confidence: bpEventParticipant.confidence,
        })
        .from(bpEventParticipant)
        .where(eq(bpEventParticipant.eventId, id));

    return jsonOk(c, { event: ev[0], participants });
});

// Search (FTS5 preferred; fallback to LIKE)
app.get("/search", async (c) => {
    cachePublic(c, 10);

    const qRaw = (c.req.query("q") ?? "").trim();
    const qP = SearchQuerySchema.safeParse(qRaw);
    if (!qP.success) return jsonOk(c, { q: qRaw, mode: "none" as const, results: [] as unknown[] });

    const q = qP.data;
    const limit = clamp(Number(c.req.query("limit") ?? "30"), 1, 100);

    const translationId = await resolveTranslationId();
    if (!translationId) {
        return jsonErr(
            c,
            404,
            "NO_TRANSLATION",
            "No translation configured. Seed bp_translation (is_default=1) or set BP_TRANSLATION_ID.",
        );
    }

    if (hasFts()) {
        // Join FTS rowid -> bp_verse_text.rowid -> bp_verse by verse_key
        // snippet column index: 2 (text)
        const rows = sqlite
            .query(
                `
        SELECT
          v.book_id  AS bookId,
          v.chapter  AS chapter,
          v.verse    AS verse,
          v.verse_key AS verseKey,
          v.verse_ord AS verseOrd,
          snippet(bp_verse_text_fts, 2, '‹', '›', '…', 24) AS snippet
        FROM bp_verse_text_fts
        JOIN bp_verse_text t ON t.rowid = bp_verse_text_fts.rowid
        JOIN bp_verse v ON v.verse_key = t.verse_key
        WHERE bp_verse_text_fts MATCH ?
          AND t.translation_id = ?
        ORDER BY bm25(bp_verse_text_fts)
        LIMIT ?;
      `,
            )
            .all(q, translationId, limit) as Array<{
            bookId: string;
            chapter: number;
            verse: number;
            verseKey: string;
            verseOrd: number;
            snippet: string;
        }>;

        return jsonOk(c, { q, mode: "fts" as const, results: rows });
    }

    // LIKE fallback
    const likeQ = `%${q}%`;
    const rows = await db
        .select({
            verseKey: bpVerse.verseKey,
            bookId: bpVerse.bookId,
            chapter: bpVerse.chapter,
            verse: bpVerse.verse,
            verseOrd: bpVerse.verseOrd,
            text: bpVerseText.text,
        })
        .from(bpVerseText)
        .innerJoin(bpVerse, eq(bpVerse.verseKey, bpVerseText.verseKey))
        .where(and(eq(bpVerseText.translationId, translationId), like(bpVerseText.text, likeQ)))
        .limit(limit);

    const results = rows.map((r) => ({
        bookId: r.bookId,
        chapter: r.chapter,
        verse: r.verse,
        verseKey: r.verseKey,
        verseOrd: r.verseOrd,
        snippet: r.text.length > 200 ? r.text.slice(0, 197) + "…" : r.text,
    }));

    return jsonOk(c, { q, mode: "like" as const, results });
});

/* --------------------------------- 404 ---------------------------------- */

app.notFound((c) => jsonErr(c, 404, "NOT_FOUND", "Route not found."));

/* --------------------------------- Start ---------------------------------- */

export default {
    port: PORT,
    fetch: app.fetch,
};

console.log(`[api] listening on http://localhost:${PORT}`);
console.log(`[api] translation=${ENV_TRANSLATION_ID || "(db default)"} fts=${hasFts() ? "on" : "off"}`);