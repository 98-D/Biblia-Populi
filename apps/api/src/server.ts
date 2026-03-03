// apps/api/src/server.ts
// Biblia Populi — Production API server (Bun + Hono + Drizzle + bun:sqlite)
//
// Upgraded for reading-first + infinite scroll primitives:
//
// Endpoints:
//   GET  /health
//   GET  /meta
//   GET  /spine                       -> global verse_ord bounds + count (for virtualization)
//   GET  /slice?fromOrd=1&limit=240   -> contiguous verse_ord window (cross-book; perfect for infinite scroll)
//   GET  /loc?bookId=GEN&chapter=1&verse=1 -> resolve a reference to verse_ord (chapter-only supported)
//   GET  /books
//   GET  /chapters/:bookId
//   GET  /chapter/:bookId/:chapter    -> legacy chapter payload (still supported)
//   GET  /search?q=...
//   GET  /people/:id
//   GET  /places/:id
//   GET  /events/:id
//
// Notes:
// - verse_ord in bp_verse is the global canonical scroll axis.
// - /slice is designed for @tanstack/react-virtual: index = verseOrd - 1.
// - /chapter still returns { ranges, links, crossrefs } + legacy placeholders.

import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { compress } from "hono/compress";
import { etag } from "hono/etag";
import { z } from "zod";
import { and, asc, desc, eq, like, sql as dsql, inArray } from "drizzle-orm";

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

// CORS (dev-friendly default). In practice, Vite proxy means CORS is rarely used in dev.
const CORS_ORIGIN = (process.env.BP_CORS_ORIGIN ?? "*").trim();

/* --------------------------------- Helpers -------------------------------- */

type ApiOk<T> = Readonly<{ ok: true; data: T }>;
type ApiErr = Readonly<{ ok: false; error: { code: string; message: string } }>;

function jsonOk<T>(c: Context, data: T, extraHeaders?: Record<string, string>) {
    if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders)) c.header(k, v);
    const body: ApiOk<T> = { ok: true, data };
    // Cast keeps Hono happy without triggering TS deep-instantiation on huge payload types.
    return c.json(body as any);
}

function jsonErr(c: Context, status: number, code: string, message: string) {
    const body: ApiErr = { ok: false, error: { code, message } };
    // @ts-ignore
    return c.json(body as any, status);
}

function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
}

function cacheNoStore(c: Context) {
    c.header("Cache-Control", "no-store");
}

function cachePublic(c: Context, seconds: number) {
    c.header("Cache-Control", `public, max-age=${seconds}`);
}

const RefBookIdSchema = z.string().min(2).max(8).regex(/^[A-Z0-9_]+$/);
const ChapterNumSchema = z.coerce.number().int().min(1).max(200);
const VerseNumSchema = z.coerce.number().int().min(1).max(200);

const SearchQuerySchema = z.string().trim().min(1).max(200);
const SliceFromSchema = z.coerce.number().int().min(1).max(1_000_000);
const SliceLimitSchema = z.coerce.number().int().min(1).max(2_000);

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

let _hasFts: boolean | null = null;
function hasFts(): boolean {
    if (_hasFts != null) return _hasFts;

    const row = sqlite
        .query(`SELECT 1 AS one FROM sqlite_master WHERE type='table' AND name='bp_verse_text_fts' LIMIT 1;`)
        .get() as { one?: number } | undefined;

    _hasFts = row != null;
    return _hasFts;
}

type SpineStats = Readonly<{ verseOrdMin: number; verseOrdMax: number; verseCount: number }>;
let _spineStats: SpineStats | null = null;

function getSpineStats(): SpineStats {
    if (_spineStats) return _spineStats;

    const row = sqlite
        .query(
            `
                SELECT
                    MIN(verse_ord) AS mn,
                    MAX(verse_ord) AS mx,
                    COUNT(*)       AS c
                FROM bp_verse;
            `,
        )
        .get() as { mn?: number; mx?: number; c?: number } | undefined;

    const mn = Number(row?.mn ?? 0);
    const mx = Number(row?.mx ?? 0);
    const c = Number(row?.c ?? 0);

    _spineStats = Object.freeze({
        verseOrdMin: Number.isFinite(mn) && mn > 0 ? Math.trunc(mn) : 1,
        verseOrdMax: Number.isFinite(mx) && mx > 0 ? Math.trunc(mx) : 0,
        verseCount: Number.isFinite(c) && c >= 0 ? Math.trunc(c) : 0,
    });

    return _spineStats;
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

async function fetchEntityBase(kind: "PERSON" | "PLACE", id: string) {
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
        .where(and(eq(bpEntity.entityId, id), eq(bpEntity.kind, kind)))
        .limit(1);

    if (!ent[0]) return null;

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

    return { entity: ent[0], names };
}

/* ----------------------------------- App ---------------------------------- */

const app = new Hono();

app.use("*", logger());
app.use("*", compress());
app.use("*", etag());
app.use(
    "*",
    cors({
        origin: CORS_ORIGIN,
        allowHeaders: ["Content-Type"],
        allowMethods: ["GET", "OPTIONS"],
    }),
);

app.onError((err, c) => {
    // eslint-disable-next-line no-console
    console.error("[api] error:", err);
    return jsonErr(c, 500, "INTERNAL", "Internal server error.");
});

/* ---------------------------------- Routes -------------------------------- */

// Health
app.get("/health", (c) => {
    cacheNoStore(c);
    return c.text("ok");
});

// Meta: translation + fts + spine stats
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
        spine: getSpineStats(),
    });
});

// Global spine stats (for virtualization / infinite scroll)
app.get("/spine", (c) => {
    cachePublic(c, 30);
    return jsonOk(c, getSpineStats());
});

// Contiguous verse window (cross-book), keyed by global verse_ord.
app.get("/slice", async (c) => {
    cachePublic(c, 10);

    const translationId = await resolveTranslationId();
    if (!translationId) {
        return jsonErr(
            c,
            404,
            "NO_TRANSLATION",
            "No translation configured. Seed bp_translation (is_default=1) or set BP_TRANSLATION_ID.",
        );
    }

    const fromP = SliceFromSchema.safeParse(c.req.query("fromOrd") ?? "1");
    if (!fromP.success) return jsonErr(c, 400, "BAD_FROM", "Invalid fromOrd.");

    const limitP = SliceLimitSchema.safeParse(c.req.query("limit") ?? "240");
    if (!limitP.success) return jsonErr(c, 400, "BAD_LIMIT", "Invalid limit.");

    const spine = getSpineStats();
    if (spine.verseOrdMax <= 0) {
        return jsonOk(c, {
            translationId,
            fromOrd: fromP.data,
            limit: limitP.data,
            verses: [],
            done: true,
            nextFromOrd: null,
            spine,
        });
    }

    const fromOrd = clamp(fromP.data, spine.verseOrdMin, spine.verseOrdMax);
    const limit = clamp(limitP.data, 1, 2000);

    // Use raw sqlite here: avoids Drizzle TS type-instantiation blowups on joins.
    const verses = sqlite
        .query(
            `
      SELECT
        v.verse_key  AS verseKey,
        v.verse_ord  AS verseOrd,
        v.book_id    AS bookId,
        v.chapter    AS chapter,
        v.verse      AS verse,
        t.text       AS text,
        t.updated_at AS updatedAt
      FROM bp_verse v
      LEFT JOIN bp_verse_text t
        ON t.verse_key = v.verse_key
       AND t.translation_id = ?
      WHERE v.verse_ord >= ?
      ORDER BY v.verse_ord
      LIMIT ?;
    `,
        )
        .all(translationId, fromOrd, limit) as Array<{
        verseKey: string;
        verseOrd: number;
        bookId: string;
        chapter: number;
        verse: number;
        text: string | null;
        updatedAt: string | null;
    }>;

    const lastOrd = verses.length ? Number(verses[verses.length - 1]!.verseOrd) : fromOrd - 1;
    const done = lastOrd >= spine.verseOrdMax || verses.length === 0;
    const nextFromOrd = done ? null : lastOrd + 1;

    return jsonOk(c, { translationId, fromOrd, limit, verses, done, nextFromOrd, spine });
});

// Resolve a reference to verse_ord (supports chapter-only).
app.get("/loc", async (c) => {
    cachePublic(c, 60);

    const bookIdP = RefBookIdSchema.safeParse((c.req.query("bookId") ?? "").trim());
    if (!bookIdP.success) return jsonErr(c, 400, "BAD_BOOK", "Invalid bookId.");

    const chapterP = ChapterNumSchema.safeParse(c.req.query("chapter") ?? "");
    if (!chapterP.success) return jsonErr(c, 400, "BAD_CHAPTER", "Invalid chapter.");

    const verseRaw = (c.req.query("verse") ?? "").trim();
    const verseP = verseRaw ? VerseNumSchema.safeParse(verseRaw) : null;
    if (verseP && !verseP.success) return jsonErr(c, 400, "BAD_VERSE", "Invalid verse.");

    const bookId = bookIdP.data;
    const chapter = chapterP.data;

    if (verseP?.success) {
        const verse = verseP.data;

        const row = sqlite
            .query(
                `
        SELECT
          verse_key AS verseKey,
          verse_ord AS verseOrd,
          book_id   AS bookId,
          chapter   AS chapter,
          verse     AS verse
        FROM bp_verse
        WHERE book_id = ?
          AND chapter = ?
          AND verse = ?
        LIMIT 1;
      `,
            )
            .get(bookId, chapter, verse) as
            | { verseKey: string; verseOrd: number; bookId: string; chapter: number; verse: number }
            | undefined;

        return jsonOk(c, row ?? null);
    }

    // Chapter-only -> first verse in chapter
    const first = sqlite
        .query(
            `
      SELECT
        verse_key AS verseKey,
        verse_ord AS verseOrd,
        book_id   AS bookId,
        chapter   AS chapter,
        verse     AS verse
      FROM bp_verse
      WHERE book_id = ?
        AND chapter = ?
      ORDER BY verse
      LIMIT 1;
    `,
        )
        .get(bookId, chapter) as
        | { verseKey: string; verseOrd: number; bookId: string; chapter: number; verse: number }
        | undefined;

    return jsonOk(c, first ?? null);
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

    return jsonOk(c, { bookId, chapters: rows });
});

// Legacy chapter payload (still useful for orientation graph later)
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
        .leftJoin(bpVerseText, and(eq(bpVerseText.verseKey, bpVerse.verseKey), eq(bpVerseText.translationId, translationId)))
        .where(and(eq(bpVerse.bookId, bookId), eq(bpVerse.chapter, chapterNum)))
        .orderBy(asc(bpVerse.verse));

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
        .where(
            and(
                dsql`${bpRange.startVerseOrd} <= ${bounds.endVerseOrd}`,
                dsql`${bpRange.endVerseOrd} >= ${bounds.startVerseOrd}`,
            ),
        )
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
        ranges,
        links,
        crossrefs,
        marks: [] as unknown[],
        mentions: [] as unknown[],
        footnotes: [] as unknown[],
    });
});

// PERSON drawer
app.get("/people/:id", async (c) => {
    cachePublic(c, 60);
    const id = c.req.param("id");

    const base = await fetchEntityBase("PERSON", id);
    if (!base) return jsonOk(c, null);

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

    return jsonOk(c, { ...base, relations: { from: relFrom, to: relTo } });
});

// PLACE drawer (+ geo)
app.get("/places/:id", async (c) => {
    cachePublic(c, 60);
    const id = c.req.param("id");

    const base = await fetchEntityBase("PLACE", id);
    if (!base) return jsonOk(c, null);

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

    return jsonOk(c, { ...base, geos });
});

// EVENT drawer (+ participants)
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
        const rows = sqlite
            .query(
                `
        SELECT
          v.book_id    AS bookId,
          v.chapter    AS chapter,
          v.verse      AS verse,
          v.verse_key  AS verseKey,
          v.verse_ord  AS verseOrd,
          snippet(bp_verse_text_fts, 2, '‹', '›', '…', 24) AS snippet
        FROM bp_verse_text_fts
        JOIN bp_verse_text t ON t.rowid = bp_verse_text_fts.rowid
        JOIN bp_verse v      ON v.verse_key = t.verse_key
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
        .orderBy(desc(bpVerse.verseOrd))
        .limit(limit);

    const results = rows.map((r) => ({
        bookId: r.bookId,
        chapter: r.chapter,
        verse: r.verse,
        verseKey: r.verseKey,
        verseOrd: r.verseOrd,
        snippet: (r.text ?? "").length > 200 ? (r.text ?? "").slice(0, 197) + "…" : (r.text ?? ""),
    }));

    return jsonOk(c, { q, mode: "like" as const, results });
});

app.notFound((c) => jsonErr(c, 404, "NOT_FOUND", "Route not found."));

export default {
    port: PORT,
    fetch: app.fetch,
};

const spine = getSpineStats();
// eslint-disable-next-line no-console
console.log(`[api] listening on http://localhost:${PORT}`);
// eslint-disable-next-line no-console
console.log(
    `[api] translation=${ENV_TRANSLATION_ID || "(db default)"} fts=${hasFts() ? "on" : "off"} verses=${spine.verseCount} ordMax=${spine.verseOrdMax}`,
);