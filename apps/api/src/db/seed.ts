// apps/api/src/db/seed.ts
// Biblia Populi — Seed / Bootstrap (Bun + Drizzle + bun:sqlite)
//
// What it seeds (idempotent, metadata-only):
// - bp_book (66-book canon spine: ids, ordinals, testament, chapter counts)
// - bp_translation (default translation row, marks it is_default)
//
// What it does NOT seed:
// - bp_verse_text (you already import full KJV)
// - bp_verse / bp_chapter / verse_ord spine (handle via importer / dedicated builder)
//
// Usage:
//   bun run db:seed
//
// Recommended scripts (apps/api/package.json):
//   "db:migrate": "bun src/db/migrate.ts"
//   "db:seed": "bun src/db/seed.ts"

import { sql } from "drizzle-orm";
import { openDb } from "./client";
import { bpBook, bpTranslation, bpVerseText } from "./schema";

const TRANSLATION_ID = (process.env.BP_TRANSLATION_ID ?? "KJV").trim();
const TRANSLATION_NAME =
    (process.env.BP_TRANSLATION_NAME ?? (TRANSLATION_ID.toUpperCase() === "KJV" ? "King James Version" : TRANSLATION_ID)).trim();
const TRANSLATION_LANG = (process.env.BP_TRANSLATION_LANG ?? "en").trim();

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

type BookSeed = Readonly<{
    bookId: string; // GEN, EXO, ...
    ordinal: number;
    testament: "OT" | "NT";
    name: string;
    nameShort: string;
    chapters: number;
    osised?: string;
}>;

const PROTESTANT_66: readonly BookSeed[] = [
    // OT
    { bookId: "GEN", ordinal: 1, testament: "OT", name: "Genesis", nameShort: "Gen", chapters: 50, osised: "Gen" },
    { bookId: "EXO", ordinal: 2, testament: "OT", name: "Exodus", nameShort: "Exod", chapters: 40, osised: "Exod" },
    { bookId: "LEV", ordinal: 3, testament: "OT", name: "Leviticus", nameShort: "Lev", chapters: 27, osised: "Lev" },
    { bookId: "NUM", ordinal: 4, testament: "OT", name: "Numbers", nameShort: "Num", chapters: 36, osised: "Num" },
    { bookId: "DEU", ordinal: 5, testament: "OT", name: "Deuteronomy", nameShort: "Deut", chapters: 34, osised: "Deut" },
    { bookId: "JOS", ordinal: 6, testament: "OT", name: "Joshua", nameShort: "Josh", chapters: 24, osised: "Josh" },
    { bookId: "JDG", ordinal: 7, testament: "OT", name: "Judges", nameShort: "Judg", chapters: 21, osised: "Judg" },
    { bookId: "RUT", ordinal: 8, testament: "OT", name: "Ruth", nameShort: "Ruth", chapters: 4, osised: "Ruth" },
    { bookId: "1SA", ordinal: 9, testament: "OT", name: "1 Samuel", nameShort: "1 Sam", chapters: 31, osised: "1Sam" },
    { bookId: "2SA", ordinal: 10, testament: "OT", name: "2 Samuel", nameShort: "2 Sam", chapters: 24, osised: "2Sam" },
    { bookId: "1KI", ordinal: 11, testament: "OT", name: "1 Kings", nameShort: "1 Kgs", chapters: 22, osised: "1Kgs" },
    { bookId: "2KI", ordinal: 12, testament: "OT", name: "2 Kings", nameShort: "2 Kgs", chapters: 25, osised: "2Kgs" },
    { bookId: "1CH", ordinal: 13, testament: "OT", name: "1 Chronicles", nameShort: "1 Chr", chapters: 29, osised: "1Chr" },
    { bookId: "2CH", ordinal: 14, testament: "OT", name: "2 Chronicles", nameShort: "2 Chr", chapters: 36, osised: "2Chr" },
    { bookId: "EZR", ordinal: 15, testament: "OT", name: "Ezra", nameShort: "Ezra", chapters: 10, osised: "Ezra" },
    { bookId: "NEH", ordinal: 16, testament: "OT", name: "Nehemiah", nameShort: "Neh", chapters: 13, osised: "Neh" },
    { bookId: "EST", ordinal: 17, testament: "OT", name: "Esther", nameShort: "Esth", chapters: 10, osised: "Esth" },
    { bookId: "JOB", ordinal: 18, testament: "OT", name: "Job", nameShort: "Job", chapters: 42, osised: "Job" },
    { bookId: "PSA", ordinal: 19, testament: "OT", name: "Psalms", nameShort: "Ps", chapters: 150, osised: "Ps" },
    { bookId: "PRO", ordinal: 20, testament: "OT", name: "Proverbs", nameShort: "Prov", chapters: 31, osised: "Prov" },
    { bookId: "ECC", ordinal: 21, testament: "OT", name: "Ecclesiastes", nameShort: "Eccl", chapters: 12, osised: "Eccl" },
    { bookId: "SNG", ordinal: 22, testament: "OT", name: "Song of Solomon", nameShort: "Song", chapters: 8, osised: "Song" },
    { bookId: "ISA", ordinal: 23, testament: "OT", name: "Isaiah", nameShort: "Isa", chapters: 66, osised: "Isa" },
    { bookId: "JER", ordinal: 24, testament: "OT", name: "Jeremiah", nameShort: "Jer", chapters: 52, osised: "Jer" },
    { bookId: "LAM", ordinal: 25, testament: "OT", name: "Lamentations", nameShort: "Lam", chapters: 5, osised: "Lam" },
    { bookId: "EZK", ordinal: 26, testament: "OT", name: "Ezekiel", nameShort: "Ezek", chapters: 48, osised: "Ezek" },
    { bookId: "DAN", ordinal: 27, testament: "OT", name: "Daniel", nameShort: "Dan", chapters: 12, osised: "Dan" },
    { bookId: "HOS", ordinal: 28, testament: "OT", name: "Hosea", nameShort: "Hos", chapters: 14, osised: "Hos" },
    { bookId: "JOL", ordinal: 29, testament: "OT", name: "Joel", nameShort: "Joel", chapters: 3, osised: "Joel" },
    { bookId: "AMO", ordinal: 30, testament: "OT", name: "Amos", nameShort: "Amos", chapters: 9, osised: "Amos" },
    { bookId: "OBA", ordinal: 31, testament: "OT", name: "Obadiah", nameShort: "Obad", chapters: 1, osised: "Obad" },
    { bookId: "JON", ordinal: 32, testament: "OT", name: "Jonah", nameShort: "Jon", chapters: 4, osised: "Jonah" },
    { bookId: "MIC", ordinal: 33, testament: "OT", name: "Micah", nameShort: "Mic", chapters: 7, osised: "Mic" },
    { bookId: "NAM", ordinal: 34, testament: "OT", name: "Nahum", nameShort: "Nah", chapters: 3, osised: "Nah" },
    { bookId: "HAB", ordinal: 35, testament: "OT", name: "Habakkuk", nameShort: "Hab", chapters: 3, osised: "Hab" },
    { bookId: "ZEP", ordinal: 36, testament: "OT", name: "Zephaniah", nameShort: "Zeph", chapters: 3, osised: "Zeph" },
    { bookId: "HAG", ordinal: 37, testament: "OT", name: "Haggai", nameShort: "Hag", chapters: 2, osised: "Hag" },
    { bookId: "ZEC", ordinal: 38, testament: "OT", name: "Zechariah", nameShort: "Zech", chapters: 14, osised: "Zech" },
    { bookId: "MAL", ordinal: 39, testament: "OT", name: "Malachi", nameShort: "Mal", chapters: 4, osised: "Mal" },

    // NT
    { bookId: "MAT", ordinal: 40, testament: "NT", name: "Matthew", nameShort: "Matt", chapters: 28, osised: "Matt" },
    { bookId: "MRK", ordinal: 41, testament: "NT", name: "Mark", nameShort: "Mark", chapters: 16, osised: "Mark" },
    { bookId: "LUK", ordinal: 42, testament: "NT", name: "Luke", nameShort: "Luke", chapters: 24, osised: "Luke" },
    { bookId: "JHN", ordinal: 43, testament: "NT", name: "John", nameShort: "John", chapters: 21, osised: "John" },
    { bookId: "ACT", ordinal: 44, testament: "NT", name: "Acts", nameShort: "Acts", chapters: 28, osised: "Acts" },
    { bookId: "ROM", ordinal: 45, testament: "NT", name: "Romans", nameShort: "Rom", chapters: 16, osised: "Rom" },
    { bookId: "1CO", ordinal: 46, testament: "NT", name: "1 Corinthians", nameShort: "1 Cor", chapters: 16, osised: "1Cor" },
    { bookId: "2CO", ordinal: 47, testament: "NT", name: "2 Corinthians", nameShort: "2 Cor", chapters: 13, osised: "2Cor" },
    { bookId: "GAL", ordinal: 48, testament: "NT", name: "Galatians", nameShort: "Gal", chapters: 6, osised: "Gal" },
    { bookId: "EPH", ordinal: 49, testament: "NT", name: "Ephesians", nameShort: "Eph", chapters: 6, osised: "Eph" },
    { bookId: "PHP", ordinal: 50, testament: "NT", name: "Philippians", nameShort: "Phil", chapters: 4, osised: "Phil" },
    { bookId: "COL", ordinal: 51, testament: "NT", name: "Colossians", nameShort: "Col", chapters: 4, osised: "Col" },
    { bookId: "1TH", ordinal: 52, testament: "NT", name: "1 Thessalonians", nameShort: "1 Thess", chapters: 5, osised: "1Thess" },
    { bookId: "2TH", ordinal: 53, testament: "NT", name: "2 Thessalonians", nameShort: "2 Thess", chapters: 3, osised: "2Thess" },
    { bookId: "1TI", ordinal: 54, testament: "NT", name: "1 Timothy", nameShort: "1 Tim", chapters: 6, osised: "1Tim" },
    { bookId: "2TI", ordinal: 55, testament: "NT", name: "2 Timothy", nameShort: "2 Tim", chapters: 4, osised: "2Tim" },
    { bookId: "TIT", ordinal: 56, testament: "NT", name: "Titus", nameShort: "Titus", chapters: 3, osised: "Titus" },
    { bookId: "PHM", ordinal: 57, testament: "NT", name: "Philemon", nameShort: "Phlm", chapters: 1, osised: "Phlm" },
    { bookId: "HEB", ordinal: 58, testament: "NT", name: "Hebrews", nameShort: "Heb", chapters: 13, osised: "Heb" },
    { bookId: "JAS", ordinal: 59, testament: "NT", name: "James", nameShort: "Jas", chapters: 5, osised: "Jas" },
    { bookId: "1PE", ordinal: 60, testament: "NT", name: "1 Peter", nameShort: "1 Pet", chapters: 5, osised: "1Pet" },
    { bookId: "2PE", ordinal: 61, testament: "NT", name: "2 Peter", nameShort: "2 Pet", chapters: 3, osised: "2Pet" },
    { bookId: "1JN", ordinal: 62, testament: "NT", name: "1 John", nameShort: "1 Jn", chapters: 5, osised: "1John" },
    { bookId: "2JN", ordinal: 63, testament: "NT", name: "2 John", nameShort: "2 Jn", chapters: 1, osised: "2John" },
    { bookId: "3JN", ordinal: 64, testament: "NT", name: "3 John", nameShort: "3 Jn", chapters: 1, osised: "3John" },
    { bookId: "JUD", ordinal: 65, testament: "NT", name: "Jude", nameShort: "Jude", chapters: 1, osised: "Jude" },
    { bookId: "REV", ordinal: 66, testament: "NT", name: "Revelation", nameShort: "Rev", chapters: 22, osised: "Rev" },
];

/* ----------------------------- Seed Operations ----------------------------- */

async function seedBooks(db: ReturnType<typeof openDb>["db"]) {
    log("upserting bp_book (66) …");

    await db
        .insert(bpBook)
        .values(
            PROTESTANT_66.map((b) => ({
                bookId: b.bookId,
                ordinal: b.ordinal,
                testament: b.testament,
                name: b.name,
                nameShort: b.nameShort,
                chapters: b.chapters,
                osised: b.osised ?? null,
                abbrs: null,
            })),
        )
        .onConflictDoUpdate({
            target: bpBook.bookId,
            set: {
                ordinal: sql`excluded.ordinal`,
                testament: sql`excluded.testament`,
                name: sql`excluded.name`,
                nameShort: sql`excluded.name_short`,
                chapters: sql`excluded.chapters`,
                osised: sql`excluded.osised`,
                abbrs: sql`excluded.abbrs`,
            },
        });
}

async function seedTranslation(db: ReturnType<typeof openDb>["db"]) {
    log("upserting bp_translation …", TRANSLATION_ID);

    // Ensure single default translation (optional, but keeps things sane)
    await db.update(bpTranslation).set({ isDefault: false }).run();

    await db
        .insert(bpTranslation)
        .values({
            translationId: TRANSLATION_ID,
            name: TRANSLATION_NAME,
            language: TRANSLATION_LANG,
            derivedFrom: null,
            licenseKind: "PUBLIC_DOMAIN",
            licenseText: TRANSLATION_ID.toUpperCase() === "KJV" ? "Public domain (US)" : null,
            sourceUrl: null,
            isDefault: true,
            // createdAt default
        })
        .onConflictDoUpdate({
            target: bpTranslation.translationId,
            set: {
                name: TRANSLATION_NAME,
                language: TRANSLATION_LANG,
                derivedFrom: null,
                licenseKind: "PUBLIC_DOMAIN",
                licenseText: TRANSLATION_ID.toUpperCase() === "KJV" ? "Public domain (US)" : null,
                sourceUrl: null,
                isDefault: true,
            },
        });
}

function getVerseTextCount(sqlite: ReturnType<typeof openDb>["sqlite"]): number {
    const row = sqlite
        .prepare(`SELECT COUNT(*) AS c FROM bp_verse_text WHERE translation_id = ?`)
        .get(TRANSLATION_ID) as { c?: number } | undefined;
    const n = row?.c ?? 0;
    return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/* ---------------------------------- Main ---------------------------------- */

async function main() {
    const { sqlite, db, dbPath, close } = openDb();
    log("dbPath:", dbPath);

    sqlite.exec("BEGIN;");
    try {
        await seedBooks(db);
        await seedTranslation(db);

        sqlite.exec("COMMIT;");
    } catch (e) {
        sqlite.exec("ROLLBACK;");
        throw e;
    } finally {
        close();
    }

    const verseTextCount = getVerseTextCount(openDb().sqlite); // quick read-only count; openDb is cheap in Bun
    log(`bp_verse_text rows for ${TRANSLATION_ID}:`, verseTextCount);

    if (verseTextCount === 0) {
        log("NOTE: no verse text found for this translation_id.");
        log("Run your KJV importer (or set BP_TRANSLATION_ID to match the imported translation_id).");
    }

    log("seed complete.");
}

main().catch((err) => fatal(err));