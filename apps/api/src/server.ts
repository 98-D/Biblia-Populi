// apps/api/src/server.ts
// Biblia Populi — Production API server (Bun + Hono + Drizzle + bun:sqlite)
//
// Goals:
// - Fast, calm, minimal API for the reader app
// - Reading-first endpoints:
//    - /health
//    - /meta (current translation + revision)
//    - /books
//    - /chapters/:bookId
//    - /chapter/:bookId/:chapter (verses + marks + mentions + footnotes)
//    - /search?q=...
//    - /people/:id, /places/:id, /events/:id
// - Strict JSON responses, stable shapes
// - No framework magic; easy to extend
//
// Notes:
// - This file assumes:
//    - apps/api/src/db/client.ts exports `db` (Drizzle client) and `sqlite`
//    - apps/api/src/db/schema.ts exports tables and `FTS_MIGRATION_SQL` (used by migrate.ts)
// - If you’re developing locally, use bun --watch src/server.ts
//
// Env vars:
// - PORT (default 3000)
// - BP_DB_PATH (optional; default apps/api/data/biblia.sqlite)
// - BP_CANON_ID (default "protestant_66")
// - BP_TRANSLATION_ID (default "biblia_populi")
// - BP_REVISION_PURPOSE (default "reading")

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { compress } from "hono/compress";
import { etag } from "hono/etag";
import { z } from "zod";
import { and, asc, eq, like, sql as dsql } from "drizzle-orm";

import { db, sqlite } from "./db/client";
import {
    canonBook,
    chapter as chapterTable,
    translationDefaultRevision,
    verseText,
    verseMark,
    verseMention,
    footnote,
    person,
    place,
    event,
} from "./db/schema";

/* --------------------------------- Config --------------------------------- */

const PORT = Number(process.env.PORT ?? "3000");
const CANON_ID = (process.env.BP_CANON_ID ?? "protestant_66").trim();
const TRANSLATION_ID = (process.env.BP_TRANSLATION_ID ?? "biblia_populi").trim();
const REVISION_PURPOSE = (process.env.BP_REVISION_PURPOSE ?? "reading").trim(); // reading|editing

/* --------------------------------- Helpers -------------------------------- */

function jsonOk<T>(c: any, data: T, extraHeaders?: Record<string, string>) {
    if (extraHeaders) {
        for (const [k, v] of Object.entries(extraHeaders)) c.header(k, v);
    }
    return c.json({ ok: true as const, data });
}

function jsonErr(c: any, status: number, code: string, message: string) {
    return c.json({ ok: false as const, error: { code, message } }, status);
}

function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
}

async function getActiveRevisionId(): Promise<string | null> {
    const rows = await db
        .select({
            translationRevisionId: translationDefaultRevision.translationRevisionId,
        })
        .from(translationDefaultRevision)
        .where(
            and(
                eq(translationDefaultRevision.translationId, TRANSLATION_ID),
                eq(translationDefaultRevision.canonId, CANON_ID),
                eq(translationDefaultRevision.purpose, REVISION_PURPOSE),
            ),
        )
        .limit(1);

    return rows[0]?.translationRevisionId ?? null;
}

const RefBookIdSchema = z
    .string()
    .min(2)
    .max(8)
    .regex(/^[A-Z0-9_]+$/);

const ChapterNumSchema = z.coerce.number().int().min(1).max(200);
const VerseNumSchema = z.coerce.number().int().min(1).max(300);

function cacheNoStore(c: any) {
    c.header("Cache-Control", "no-store");
}

function cachePublic(c: any, seconds: number) {
    c.header("Cache-Control", `public, max-age=${seconds}`);
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

// Meta: active revision
app.get("/meta", async (c) => {
    cacheNoStore(c);
    const rev = await getActiveRevisionId();
    if (!rev) return jsonErr(c, 404, "NO_ACTIVE_REVISION", "No active translation revision configured.");
    return jsonOk(c, {
        canonId: CANON_ID,
        translationId: TRANSLATION_ID,
        revisionPurpose: REVISION_PURPOSE,
        translationRevisionId: rev,
    });
});

// Books in canon
app.get("/books", async (c) => {
    cachePublic(c, 60);
    const books = await db
        .select({
            bookId: canonBook.bookId,
            ordinal: canonBook.ordinal,
            name: canonBook.name,
            nameShort: canonBook.nameShort,
            testament: canonBook.testament,
            chaptersCount: canonBook.chaptersCount,
        })
        .from(canonBook)
        .where(eq(canonBook.canonId, CANON_ID))
        .orderBy(asc(canonBook.ordinal));

    return jsonOk(c, { canonId: CANON_ID, books });
});

// Chapters meta for a book (optional titles)
app.get("/chapters/:bookId", async (c) => {
    cachePublic(c, 60);

    const bookId = RefBookIdSchema.safeParse(c.req.param("bookId"));
    if (!bookId.success) return jsonErr(c, 400, "BAD_BOOK", "Invalid bookId.");

    const chapters = await db
        .select({
            chapter: chapterTable.chapter,
            title: chapterTable.title,
            summary: chapterTable.summary,
        })
        .from(chapterTable)
        .where(and(eq(chapterTable.canonId, CANON_ID), eq(chapterTable.bookId, bookId.data)))
        .orderBy(asc(chapterTable.chapter));

    return jsonOk(c, { canonId: CANON_ID, bookId: bookId.data, chapters });
});

// Fetch a chapter: verse text + marks + mentions + footnotes
app.get("/chapter/:bookId/:chapter", async (c) => {
    cachePublic(c, 30);

    const bookIdP = RefBookIdSchema.safeParse(c.req.param("bookId"));
    if (!bookIdP.success) return jsonErr(c, 400, "BAD_BOOK", "Invalid bookId.");

    const chapterP = ChapterNumSchema.safeParse(c.req.param("chapter"));
    if (!chapterP.success) return jsonErr(c, 400, "BAD_CHAPTER", "Invalid chapter number.");

    const translationRevisionId = await getActiveRevisionId();
    if (!translationRevisionId)
        return jsonErr(c, 404, "NO_ACTIVE_REVISION", "No active translation revision configured.");

    const bookId = bookIdP.data;
    const chapterNum = chapterP.data;

    const verses = await db
        .select({
            chapter: verseText.chapter,
            verse: verseText.verse,
            text: verseText.text,
            updatedAt: verseText.updatedAt,
        })
        .from(verseText)
        .where(
            and(
                eq(verseText.translationRevisionId, translationRevisionId),
                eq(verseText.canonId, CANON_ID),
                eq(verseText.bookId, bookId),
                eq(verseText.chapter, chapterNum),
            ),
        )
        .orderBy(asc(verseText.verse));

    const marks = await db
        .select({
            id: verseMark.id,
            chapter: verseMark.chapter,
            verse: verseMark.verse,
            kind: verseMark.kind,
            ord: verseMark.ord,
            payload: verseMark.payload,
        })
        .from(verseMark)
        .where(
            and(
                eq(verseMark.translationRevisionId, translationRevisionId),
                eq(verseMark.canonId, CANON_ID),
                eq(verseMark.bookId, bookId),
                eq(verseMark.chapter, chapterNum),
            ),
        )
        .orderBy(asc(verseMark.verse), asc(verseMark.ord));

    const mentions = await db
        .select({
            id: verseMention.id,
            chapter: verseMention.chapter,
            verse: verseMention.verse,
            entityType: verseMention.entityType,
            entityId: verseMention.entityId,
            start: verseMention.start,
            end: verseMention.end,
            surface: verseMention.surface,
            ord: verseMention.ord,
        })
        .from(verseMention)
        .where(
            and(
                eq(verseMention.translationRevisionId, translationRevisionId),
                eq(verseMention.canonId, CANON_ID),
                eq(verseMention.bookId, bookId),
                eq(verseMention.chapter, chapterNum),
            ),
        )
        .orderBy(asc(verseMention.verse), asc(verseMention.start), asc(verseMention.end), asc(verseMention.ord));

    const footnotes = await db
        .select({
            id: footnote.id,
            chapter: footnote.chapter,
            verse: footnote.verse,
            marker: footnote.marker,
            content: footnote.content,
            ord: footnote.ord,
        })
        .from(footnote)
        .where(
            and(
                eq(footnote.translationRevisionId, translationRevisionId),
                eq(footnote.canonId, CANON_ID),
                eq(footnote.bookId, bookId),
                eq(footnote.chapter, chapterNum),
            ),
        )
        .orderBy(asc(footnote.verse), asc(footnote.ord));

    return jsonOk(c, {
        canonId: CANON_ID,
        translationId: TRANSLATION_ID,
        translationRevisionId,
        bookId,
        chapter: chapterNum,
        verses,
        marks,
        mentions,
        footnotes,
    });
});

// Entity endpoints (for drawer)
app.get("/people/:id", async (c) => {
    cachePublic(c, 60);
    const id = c.req.param("id");

    const rows = await db
        .select({
            id: person.id,
            displayName: person.displayName,
            sortName: person.sortName,
            sex: person.sex,
            title: person.title,
            summary: person.summary,
            bio: person.bio,
            era: person.era,
            imageAssetId: person.imageAssetId,
        })
        .from(person)
        .where(eq(person.id, id))
        .limit(1);

    return jsonOk(c, rows[0] ?? null);
});

app.get("/places/:id", async (c) => {
    cachePublic(c, 60);
    const id = c.req.param("id");

    const rows = await db
        .select({
            id: place.id,
            name: place.name,
            kind: place.kind,
            lat: place.lat,
            lon: place.lon,
            geojson: place.geojson,
            summary: place.summary,
            description: place.description,
            era: place.era,
            imageAssetId: place.imageAssetId,
        })
        .from(place)
        .where(eq(place.id, id))
        .limit(1);

    return jsonOk(c, rows[0] ?? null);
});

app.get("/events/:id", async (c) => {
    cachePublic(c, 60);
    const id = c.req.param("id");

    const rows = await db
        .select({
            id: event.id,
            title: event.title,
            summary: event.summary,
            placeId: event.placeId,
            era: event.era,
            timeHint: event.timeHint,
        })
        .from(event)
        .where(eq(event.id, id))
        .limit(1);

    return jsonOk(c, rows[0] ?? null);
});

// Search (FTS5 preferred; fallback to LIKE if FTS not installed)
app.get("/search", async (c) => {
    cachePublic(c, 10);

    const q = (c.req.query("q") ?? "").trim();
    if (!q) return jsonOk(c, { q, results: [] as any[] });

    const limit = clamp(Number(c.req.query("limit") ?? "30"), 1, 100);

    const translationRevisionId = await getActiveRevisionId();
    if (!translationRevisionId)
        return jsonErr(c, 404, "NO_ACTIVE_REVISION", "No active translation revision configured.");

    // Prefer FTS virtual table if present
    // We'll probe once per request (cheap).
    const hasFts =
        (sqlite
            .query(
                `SELECT 1 FROM sqlite_master WHERE type='table' AND name='verse_text_fts' LIMIT 1`,
            )
            .get() as any) != null;

    if (hasFts) {
        // FTS query returns rowid; we join back to verse_text rowid via the content table
        // but since our content is verse_text, rowid maps directly.
        //
        // Use parameter binding to avoid injection.
        const rows = sqlite
            .query(
                `
        SELECT
          canon_id as canonId,
          book_id as bookId,
          chapter as chapter,
          verse as verse,
          snippet(verse_text_fts, 5, '‹', '›', '…', 24) as snippet
        FROM verse_text_fts
        WHERE verse_text_fts MATCH ?
          AND translation_revision_id = ?
          AND canon_id = ?
        LIMIT ?;
      `,
            )
            .all(q, translationRevisionId, CANON_ID, limit) as Array<{
            canonId: string;
            bookId: string;
            chapter: number;
            verse: number;
            snippet: string;
        }>;

        return jsonOk(c, { q, mode: "fts" as const, results: rows });
    }

    // Fallback: LIKE
    const rows = await db
        .select({
            canonId: verseText.canonId,
            bookId: verseText.bookId,
            chapter: verseText.chapter,
            verse: verseText.verse,
            text: verseText.text,
        })
        .from(verseText)
        .where(
            and(
                eq(verseText.translationRevisionId, translationRevisionId),
                eq(verseText.canonId, CANON_ID),
                like(verseText.text, `%${q}%`),
            ),
        )
        .limit(limit);

    const results = rows.map((r) => ({
        canonId: r.canonId,
        bookId: r.bookId,
        chapter: r.chapter,
        verse: r.verse,
        snippet: r.text.length > 180 ? r.text.slice(0, 177) + "…" : r.text,
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
console.log(`[api] canon=${CANON_ID} translation=${TRANSLATION_ID} purpose=${REVISION_PURPOSE}`);