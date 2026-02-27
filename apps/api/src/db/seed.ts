// apps/api/src/db/seed.ts
// Biblia Populi — Seed (Bun + Drizzle + bun:sqlite)
//
// What it seeds (idempotent):
// - Canon books for protestant_66 (66 books, ordinals + chapter counts)
// - A default translation (biblia_populi)
// - A default revision (published) + sets translation_default_revision (reading + editing)
// - Local user row ("local")
// - Minimal sample text (Genesis 1:1–5) so the app can render immediately
//
// Usage:
//   bun run db:seed
//
// Recommended scripts (apps/api/package.json):
//   "db:migrate": "bun src/db/migrate.ts"
//   "db:seed": "bun src/db/seed.ts"

import { openDb } from "./client";
import {
    canonBook,
    chapter as chapterTable,
    translation,
    translationRevision,
    translationDefaultRevision,
    verseText,
    user as userTable,
} from "./schema";
import { eq, and } from "drizzle-orm";

const CANON_ID = (process.env.BP_CANON_ID ?? "protestant_66").trim();
const TRANSLATION_ID = (process.env.BP_TRANSLATION_ID ?? "biblia_populi").trim();

/* --------------------------------- Logging -------------------------------- */

function log(...args: unknown[]) {
    // eslint-disable-next-line no-console
    console.log("[db:seed]", ...args);
}

function fatal(...args: unknown[]): never {
    // eslint-disable-next-line no-console
    console.error("[db:seed]", ...args);
    process.exit(1);
}

/* --------------------------------- Data ----------------------------------- */

type CanonBookSeed = {
    bookId: string;
    ordinal: number;
    name: string;
    nameShort: string;
    testament: "OT" | "NT";
    chaptersCount: number;
};

const PROTESTANT_66: CanonBookSeed[] = [
    // OT
    { bookId: "GEN", ordinal: 1, name: "Genesis", nameShort: "Gen", testament: "OT", chaptersCount: 50 },
    { bookId: "EXO", ordinal: 2, name: "Exodus", nameShort: "Exod", testament: "OT", chaptersCount: 40 },
    { bookId: "LEV", ordinal: 3, name: "Leviticus", nameShort: "Lev", testament: "OT", chaptersCount: 27 },
    { bookId: "NUM", ordinal: 4, name: "Numbers", nameShort: "Num", testament: "OT", chaptersCount: 36 },
    { bookId: "DEU", ordinal: 5, name: "Deuteronomy", nameShort: "Deut", testament: "OT", chaptersCount: 34 },
    { bookId: "JOS", ordinal: 6, name: "Joshua", nameShort: "Josh", testament: "OT", chaptersCount: 24 },
    { bookId: "JDG", ordinal: 7, name: "Judges", nameShort: "Judg", testament: "OT", chaptersCount: 21 },
    { bookId: "RUT", ordinal: 8, name: "Ruth", nameShort: "Ruth", testament: "OT", chaptersCount: 4 },
    { bookId: "1SA", ordinal: 9, name: "1 Samuel", nameShort: "1 Sam", testament: "OT", chaptersCount: 31 },
    { bookId: "2SA", ordinal: 10, name: "2 Samuel", nameShort: "2 Sam", testament: "OT", chaptersCount: 24 },
    { bookId: "1KI", ordinal: 11, name: "1 Kings", nameShort: "1 Kgs", testament: "OT", chaptersCount: 22 },
    { bookId: "2KI", ordinal: 12, name: "2 Kings", nameShort: "2 Kgs", testament: "OT", chaptersCount: 25 },
    { bookId: "1CH", ordinal: 13, name: "1 Chronicles", nameShort: "1 Chr", testament: "OT", chaptersCount: 29 },
    { bookId: "2CH", ordinal: 14, name: "2 Chronicles", nameShort: "2 Chr", testament: "OT", chaptersCount: 36 },
    { bookId: "EZR", ordinal: 15, name: "Ezra", nameShort: "Ezra", testament: "OT", chaptersCount: 10 },
    { bookId: "NEH", ordinal: 16, name: "Nehemiah", nameShort: "Neh", testament: "OT", chaptersCount: 13 },
    { bookId: "EST", ordinal: 17, name: "Esther", nameShort: "Esth", testament: "OT", chaptersCount: 10 },
    { bookId: "JOB", ordinal: 18, name: "Job", nameShort: "Job", testament: "OT", chaptersCount: 42 },
    { bookId: "PSA", ordinal: 19, name: "Psalms", nameShort: "Ps", testament: "OT", chaptersCount: 150 },
    { bookId: "PRO", ordinal: 20, name: "Proverbs", nameShort: "Prov", testament: "OT", chaptersCount: 31 },
    { bookId: "ECC", ordinal: 21, name: "Ecclesiastes", nameShort: "Eccl", testament: "OT", chaptersCount: 12 },
    { bookId: "SNG", ordinal: 22, name: "Song of Solomon", nameShort: "Song", testament: "OT", chaptersCount: 8 },
    { bookId: "ISA", ordinal: 23, name: "Isaiah", nameShort: "Isa", testament: "OT", chaptersCount: 66 },
    { bookId: "JER", ordinal: 24, name: "Jeremiah", nameShort: "Jer", testament: "OT", chaptersCount: 52 },
    { bookId: "LAM", ordinal: 25, name: "Lamentations", nameShort: "Lam", testament: "OT", chaptersCount: 5 },
    { bookId: "EZK", ordinal: 26, name: "Ezekiel", nameShort: "Ezek", testament: "OT", chaptersCount: 48 },
    { bookId: "DAN", ordinal: 27, name: "Daniel", nameShort: "Dan", testament: "OT", chaptersCount: 12 },
    { bookId: "HOS", ordinal: 28, name: "Hosea", nameShort: "Hos", testament: "OT", chaptersCount: 14 },
    { bookId: "JOL", ordinal: 29, name: "Joel", nameShort: "Joel", testament: "OT", chaptersCount: 3 },
    { bookId: "AMO", ordinal: 30, name: "Amos", nameShort: "Amos", testament: "OT", chaptersCount: 9 },
    { bookId: "OBA", ordinal: 31, name: "Obadiah", nameShort: "Obad", testament: "OT", chaptersCount: 1 },
    { bookId: "JON", ordinal: 32, name: "Jonah", nameShort: "Jon", testament: "OT", chaptersCount: 4 },
    { bookId: "MIC", ordinal: 33, name: "Micah", nameShort: "Mic", testament: "OT", chaptersCount: 7 },
    { bookId: "NAM", ordinal: 34, name: "Nahum", nameShort: "Nah", testament: "OT", chaptersCount: 3 },
    { bookId: "HAB", ordinal: 35, name: "Habakkuk", nameShort: "Hab", testament: "OT", chaptersCount: 3 },
    { bookId: "ZEP", ordinal: 36, name: "Zephaniah", nameShort: "Zeph", testament: "OT", chaptersCount: 3 },
    { bookId: "HAG", ordinal: 37, name: "Haggai", nameShort: "Hag", testament: "OT", chaptersCount: 2 },
    { bookId: "ZEC", ordinal: 38, name: "Zechariah", nameShort: "Zech", testament: "OT", chaptersCount: 14 },
    { bookId: "MAL", ordinal: 39, name: "Malachi", nameShort: "Mal", testament: "OT", chaptersCount: 4 },

    // NT
    { bookId: "MAT", ordinal: 40, name: "Matthew", nameShort: "Matt", testament: "NT", chaptersCount: 28 },
    { bookId: "MRK", ordinal: 41, name: "Mark", nameShort: "Mark", testament: "NT", chaptersCount: 16 },
    { bookId: "LUK", ordinal: 42, name: "Luke", nameShort: "Luke", testament: "NT", chaptersCount: 24 },
    { bookId: "JHN", ordinal: 43, name: "John", nameShort: "John", testament: "NT", chaptersCount: 21 },
    { bookId: "ACT", ordinal: 44, name: "Acts", nameShort: "Acts", testament: "NT", chaptersCount: 28 },
    { bookId: "ROM", ordinal: 45, name: "Romans", nameShort: "Rom", testament: "NT", chaptersCount: 16 },
    { bookId: "1CO", ordinal: 46, name: "1 Corinthians", nameShort: "1 Cor", testament: "NT", chaptersCount: 16 },
    { bookId: "2CO", ordinal: 47, name: "2 Corinthians", nameShort: "2 Cor", testament: "NT", chaptersCount: 13 },
    { bookId: "GAL", ordinal: 48, name: "Galatians", nameShort: "Gal", testament: "NT", chaptersCount: 6 },
    { bookId: "EPH", ordinal: 49, name: "Ephesians", nameShort: "Eph", testament: "NT", chaptersCount: 6 },
    { bookId: "PHP", ordinal: 50, name: "Philippians", nameShort: "Phil", testament: "NT", chaptersCount: 4 },
    { bookId: "COL", ordinal: 51, name: "Colossians", nameShort: "Col", testament: "NT", chaptersCount: 4 },
    { bookId: "1TH", ordinal: 52, name: "1 Thessalonians", nameShort: "1 Thess", testament: "NT", chaptersCount: 5 },
    { bookId: "2TH", ordinal: 53, name: "2 Thessalonians", nameShort: "2 Thess", testament: "NT", chaptersCount: 3 },
    { bookId: "1TI", ordinal: 54, name: "1 Timothy", nameShort: "1 Tim", testament: "NT", chaptersCount: 6 },
    { bookId: "2TI", ordinal: 55, name: "2 Timothy", nameShort: "2 Tim", testament: "NT", chaptersCount: 4 },
    { bookId: "TIT", ordinal: 56, name: "Titus", nameShort: "Titus", testament: "NT", chaptersCount: 3 },
    { bookId: "PHM", ordinal: 57, name: "Philemon", nameShort: "Phlm", testament: "NT", chaptersCount: 1 },
    { bookId: "HEB", ordinal: 58, name: "Hebrews", nameShort: "Heb", testament: "NT", chaptersCount: 13 },
    { bookId: "JAS", ordinal: 59, name: "James", nameShort: "Jas", testament: "NT", chaptersCount: 5 },
    { bookId: "1PE", ordinal: 60, name: "1 Peter", nameShort: "1 Pet", testament: "NT", chaptersCount: 5 },
    { bookId: "2PE", ordinal: 61, name: "2 Peter", nameShort: "2 Pet", testament: "NT", chaptersCount: 3 },
    { bookId: "1JN", ordinal: 62, name: "1 John", nameShort: "1 Jn", testament: "NT", chaptersCount: 5 },
    { bookId: "2JN", ordinal: 63, name: "2 John", nameShort: "2 Jn", testament: "NT", chaptersCount: 1 },
    { bookId: "3JN", ordinal: 64, name: "3 John", nameShort: "3 Jn", testament: "NT", chaptersCount: 1 },
    { bookId: "JUD", ordinal: 65, name: "Jude", nameShort: "Jude", testament: "NT", chaptersCount: 1 },
    { bookId: "REV", ordinal: 66, name: "Revelation", nameShort: "Rev", testament: "NT", chaptersCount: 22 },
];

/* ----------------------------- Seed Operations ----------------------------- */

async function seedCanonBooks() {
    log("seeding canon books:", CANON_ID);

    // Insert all; idempotent by PK (canonId, bookId)
    await db
        .insert(canonBook)
        .values(
            PROTESTANT_66.map((b) => ({
                canonId: CANON_ID,
                bookId: b.bookId,
                ordinal: b.ordinal,
                name: b.name,
                nameShort: b.nameShort,
                testament: b.testament,
                chaptersCount: b.chaptersCount,
            })),
        )
        .onConflictDoNothing();

    // Also seed chapter rows (optional) for Genesis 1, just to show structure
    await db
        .insert(chapterTable)
        .values({
            canonId: CANON_ID,
            bookId: "GEN",
            chapter: 1,
            title: "In the beginning",
            summary: "Creation; light and order.",
        })
        .onConflictDoNothing();
}

async function seedTranslationAndRevision(): Promise<string> {
    log("seeding translation + revision:", TRANSLATION_ID);

    await db
        .insert(translation)
        .values({
            translationId: TRANSLATION_ID,
            name: "Biblia Populi",
            language: "en",
            description: "A modern reading-first translation project.",
        })
        .onConflictDoNothing();

    // Reuse existing revision if one is already set as "reading"
    const existing = await db
        .select({
            translationRevisionId: translationDefaultRevision.translationRevisionId,
        })
        .from(translationDefaultRevision)
        .where(
            and(
                eq(translationDefaultRevision.translationId, TRANSLATION_ID),
                eq(translationDefaultRevision.canonId, CANON_ID),
                eq(translationDefaultRevision.purpose, "reading"),
            ),
        )
        .limit(1);

    if (existing[0]?.translationRevisionId) {
        log("found existing active reading revision:", existing[0].translationRevisionId);
        return existing[0].translationRevisionId;
    }

    const revId = crypto.randomUUID();

    await db
        .insert(translationRevision)
        .values({
            translationRevisionId: revId,
            translationId: TRANSLATION_ID,
            label: "v0.1",
            status: "published",
            publishedAt: new Date().toISOString(),
        })
        .onConflictDoNothing();

    // Set defaults: reading + editing both point to this revision initially
    await db
        .insert(translationDefaultRevision)
        .values([
            {
                translationId: TRANSLATION_ID,
                canonId: CANON_ID,
                purpose: "reading",
                translationRevisionId: revId,
            },
            {
                translationId: TRANSLATION_ID,
                canonId: CANON_ID,
                purpose: "editing",
                translationRevisionId: revId,
            },
        ])
        .onConflictDoUpdate({
            target: [
                translationDefaultRevision.translationId,
                translationDefaultRevision.canonId,
                translationDefaultRevision.purpose,
            ],
            set: {
                translationRevisionId: revId,
                updatedAt: new Date().toISOString(),
            },
        });

    log("created revision:", revId);
    return revId;
}

async function seedLocalUser() {
    await db
        .insert(userTable)
        .values({
            id: "local",
            displayName: "Local",
        })
        .onConflictDoNothing();
}

async function seedSampleGenesis(revId: string) {
    log("seeding sample verses (GEN 1:1–5)");

    const rows = [
        { verse: 1, text: "In the beginning, God created the heavens and the earth." },
        {
            verse: 2,
            text:
                "The earth was without form and empty, and darkness was over the face of the deep. And the Spirit of God was hovering over the face of the waters.",
        },
        { verse: 3, text: "And God said, “Let there be light,” and there was light." },
        { verse: 4, text: "And God saw that the light was good. And God separated the light from the darkness." },
        { verse: 5, text: "God called the light Day, and the darkness he called Night. And there was evening and there was morning, the first day." },
        { verse: 6, text: "And God said, “Let there be an expanse in the midst of the waters, and let it separate the waters from the waters.”" },
        { verse: 7, text: "And God made the expanse and separated the waters that were under the expanse from the waters that were above the expanse. And it was so." },
        { verse: 8, text: "And God called the expanse Heaven. And there was evening and there was morning, the second day." },

        { verse: 9, text: "And God said, “Let the waters under the heavens be gathered together into one place, and let the dry land appear.” And it was so." },
        { verse: 10, text: "God called the dry land Earth, and the waters that were gathered together he called Seas. And God saw that it was good." },
        { verse: 11, text: "And God said, “Let the earth sprout vegetation, plants yielding seed, and fruit trees bearing fruit in which is their seed, each according to its kind"}
    ];

    await db
        .insert(verseText)
        .values(
            rows.map((r) => ({
                translationRevisionId: revId,
                canonId: CANON_ID,
                bookId: "GEN",
                chapter: 1,
                verse: r.verse,
                text: r.text,
            })),
        )
        .onConflictDoNothing();
}

/* ---------------------------------- Main ---------------------------------- */

const { db, sqlite, dbPath } = openDb();

async function main() {
    log("dbPath:", dbPath);

    // Wrap in a transaction (Bun SQLite supports exec BEGIN/COMMIT)
    sqlite.exec("BEGIN;");
    try {
        await seedCanonBooks();
        const revId = await seedTranslationAndRevision();
        await seedLocalUser();
        await seedSampleGenesis(revId);

        sqlite.exec("COMMIT;");
    } catch (e) {
        sqlite.exec("ROLLBACK;");
        throw e;
    }

    log("seed complete.");
}

main().catch((err) => fatal(err));