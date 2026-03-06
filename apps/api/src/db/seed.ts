// apps/api/src/db/seed.ts
// Biblia.to — Seed / Bootstrap (Bun + Drizzle + bun:sqlite)
//
// Seeds (idempotent, metadata-only):
// - bp_book (66-book canon spine: ids, ordinals, testament, chapter counts)
// - bp_translation (default translation row, marks is_default)
//
// Does NOT seed:
// - bp_verse_text (import full translation separately)
// - bp_verse / bp_chapter / verse_ord spine (importer / builder)
//
// Usage:
//   bun run db:seed
//
// Notes:
// - This runner expects a writable DB; it refuses readonly mode.
// - This file is intentionally conservative: metadata only, no canon text mutation.
// - Seeding is transactional.
// - Translation default behavior is explicit and production-safe.

import { eq, sql } from "drizzle-orm";

import { openDb } from "./client";
import { bpBook, bpTranslation } from "./schema";

/* --------------------------------- Config --------------------------------- */

const TRANSLATION_ID = nonEmptyOr(process.env.BP_TRANSLATION_ID, "KJV");
const TRANSLATION_NAME = nonEmptyOr(
    process.env.BP_TRANSLATION_NAME,
    TRANSLATION_ID.toUpperCase() === "KJV" ? "King James Version" : TRANSLATION_ID,
);
const TRANSLATION_LANG = nonEmptyOr(process.env.BP_TRANSLATION_LANG, "en");

// Optional metadata
const TRANSLATION_DERIVED_FROM = nullIfEmpty(process.env.BP_TRANSLATION_DERIVED_FROM);
const TRANSLATION_LICENSE_KIND = nonEmptyOr(process.env.BP_TRANSLATION_LICENSE_KIND, "PUBLIC_DOMAIN");
const TRANSLATION_LICENSE_TEXT =
    nullIfEmpty(process.env.BP_TRANSLATION_LICENSE_TEXT) ??
    (TRANSLATION_ID.toUpperCase() === "KJV" ? "Public domain (US)" : null);
const TRANSLATION_SOURCE_URL = nullIfEmpty(process.env.BP_TRANSLATION_SOURCE_URL);

// Only touch defaults if requested.
// Default: true for bootstrap simplicity.
const FORCE_DEFAULT = envBool("BP_SEED_FORCE_DEFAULT_TRANSLATION", true);

/* -------------------------------- Utilities -------------------------------- */

function log(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.log("[db:seed]", ...args);
}

function warn(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.warn("[db:seed]", ...args);
}

function fatal(...args: unknown[]): never {
    // eslint-disable-next-line no-console
    console.error("[db:seed]", ...args);
    process.exit(1);
    throw new Error("unreachable");
}

function envBool(name: string, fallback = false): boolean {
    const v = process.env[name]?.trim().toLowerCase();
    if (!v) return fallback;
    return v === "1" || v === "true" || v === "yes" || v === "on";
}

function nonEmptyOr(v: string | undefined, fallback: string): string {
    const s = (v ?? "").trim();
    return s || fallback;
}

function nullIfEmpty(v: string | undefined): string | null {
    const s = (v ?? "").trim();
    return s || null;
}

function assertSafeTranslationId(id: string): string {
    const s = id.trim();
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(s)) {
        throw new Error(
            `[db:seed] invalid BP_TRANSLATION_ID '${id}'. Expected 1-64 chars matching [A-Za-z0-9._-].`,
        );
    }
    return s;
}

function safeJsonStringify(value: unknown): string {
    return JSON.stringify(value);
}

function runTx(sqlite: ReturnType<typeof openDb>["sqlite"], fn: () => Promise<void>): Promise<void> {
    sqlite.exec("BEGIN;");
    return fn()
        .then(() => {
            sqlite.exec("COMMIT;");
        })
        .catch((e) => {
            try {
                sqlite.exec("ROLLBACK;");
            } catch {
                // ignore rollback failure
            }
            throw e;
        });
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
    abbrs?: readonly string[];
}>;

const PROTESTANT_66: readonly BookSeed[] = [
    // OT
    { bookId: "GEN", ordinal: 1, testament: "OT", name: "Genesis", nameShort: "Gen", chapters: 50, osised: "Gen", abbrs: ["Ge", "Gn"] },
    { bookId: "EXO", ordinal: 2, testament: "OT", name: "Exodus", nameShort: "Exod", chapters: 40, osised: "Exod", abbrs: ["Ex", "Exo"] },
    { bookId: "LEV", ordinal: 3, testament: "OT", name: "Leviticus", nameShort: "Lev", chapters: 27, osised: "Lev", abbrs: ["Le", "Lv"] },
    { bookId: "NUM", ordinal: 4, testament: "OT", name: "Numbers", nameShort: "Num", chapters: 36, osised: "Num", abbrs: ["Nu", "Nm", "Nb"] },
    { bookId: "DEU", ordinal: 5, testament: "OT", name: "Deuteronomy", nameShort: "Deut", chapters: 34, osised: "Deut", abbrs: ["Dt", "Deu"] },
    { bookId: "JOS", ordinal: 6, testament: "OT", name: "Joshua", nameShort: "Josh", chapters: 24, osised: "Josh", abbrs: ["Jos"] },
    { bookId: "JDG", ordinal: 7, testament: "OT", name: "Judges", nameShort: "Judg", chapters: 21, osised: "Judg", abbrs: ["Jdg", "Jg", "Jdgs"] },
    { bookId: "RUT", ordinal: 8, testament: "OT", name: "Ruth", nameShort: "Ruth", chapters: 4, osised: "Ruth", abbrs: ["Ru"] },
    { bookId: "1SA", ordinal: 9, testament: "OT", name: "1 Samuel", nameShort: "1 Sam", chapters: 31, osised: "1Sam", abbrs: ["1Sa", "1 Sam", "I Samuel"] },
    { bookId: "2SA", ordinal: 10, testament: "OT", name: "2 Samuel", nameShort: "2 Sam", chapters: 24, osised: "2Sam", abbrs: ["2Sa", "2 Sam", "II Samuel"] },
    { bookId: "1KI", ordinal: 11, testament: "OT", name: "1 Kings", nameShort: "1 Kgs", chapters: 22, osised: "1Kgs", abbrs: ["1Ki", "1 Kgs", "I Kings"] },
    { bookId: "2KI", ordinal: 12, testament: "OT", name: "2 Kings", nameShort: "2 Kgs", chapters: 25, osised: "2Kgs", abbrs: ["2Ki", "2 Kgs", "II Kings"] },
    { bookId: "1CH", ordinal: 13, testament: "OT", name: "1 Chronicles", nameShort: "1 Chr", chapters: 29, osised: "1Chr", abbrs: ["1Ch", "1 Chr", "I Chronicles"] },
    { bookId: "2CH", ordinal: 14, testament: "OT", name: "2 Chronicles", nameShort: "2 Chr", chapters: 36, osised: "2Chr", abbrs: ["2Ch", "2 Chr", "II Chronicles"] },
    { bookId: "EZR", ordinal: 15, testament: "OT", name: "Ezra", nameShort: "Ezra", chapters: 10, osised: "Ezra", abbrs: ["Ezr"] },
    { bookId: "NEH", ordinal: 16, testament: "OT", name: "Nehemiah", nameShort: "Neh", chapters: 13, osised: "Neh", abbrs: ["Ne"] },
    { bookId: "EST", ordinal: 17, testament: "OT", name: "Esther", nameShort: "Esth", chapters: 10, osised: "Esth", abbrs: ["Es"] },
    { bookId: "JOB", ordinal: 18, testament: "OT", name: "Job", nameShort: "Job", chapters: 42, osised: "Job" },
    { bookId: "PSA", ordinal: 19, testament: "OT", name: "Psalms", nameShort: "Ps", chapters: 150, osised: "Ps", abbrs: ["Psa", "Psalm", "Pslm"] },
    { bookId: "PRO", ordinal: 20, testament: "OT", name: "Proverbs", nameShort: "Prov", chapters: 31, osised: "Prov", abbrs: ["Pr", "Prv"] },
    { bookId: "ECC", ordinal: 21, testament: "OT", name: "Ecclesiastes", nameShort: "Eccl", chapters: 12, osised: "Eccl", abbrs: ["Ecc", "Qoheleth"] },
    { bookId: "SNG", ordinal: 22, testament: "OT", name: "Song of Solomon", nameShort: "Song", chapters: 8, osised: "Song", abbrs: ["So", "Canticles", "Song of Songs"] },
    { bookId: "ISA", ordinal: 23, testament: "OT", name: "Isaiah", nameShort: "Isa", chapters: 66, osised: "Isa", abbrs: ["Is"] },
    { bookId: "JER", ordinal: 24, testament: "OT", name: "Jeremiah", nameShort: "Jer", chapters: 52, osised: "Jer", abbrs: ["Je", "Jr"] },
    { bookId: "LAM", ordinal: 25, testament: "OT", name: "Lamentations", nameShort: "Lam", chapters: 5, osised: "Lam", abbrs: ["La"] },
    { bookId: "EZK", ordinal: 26, testament: "OT", name: "Ezekiel", nameShort: "Ezek", chapters: 48, osised: "Ezek", abbrs: ["Eze", "Ezk"] },
    { bookId: "DAN", ordinal: 27, testament: "OT", name: "Daniel", nameShort: "Dan", chapters: 12, osised: "Dan", abbrs: ["Da", "Dn"] },
    { bookId: "HOS", ordinal: 28, testament: "OT", name: "Hosea", nameShort: "Hos", chapters: 14, osised: "Hos", abbrs: ["Ho"] },
    { bookId: "JOL", ordinal: 29, testament: "OT", name: "Joel", nameShort: "Joel", chapters: 3, osised: "Joel", abbrs: ["Jl"] },
    { bookId: "AMO", ordinal: 30, testament: "OT", name: "Amos", nameShort: "Amos", chapters: 9, osised: "Amos", abbrs: ["Am"] },
    { bookId: "OBA", ordinal: 31, testament: "OT", name: "Obadiah", nameShort: "Obad", chapters: 1, osised: "Obad", abbrs: ["Ob"] },
    { bookId: "JON", ordinal: 32, testament: "OT", name: "Jonah", nameShort: "Jon", chapters: 4, osised: "Jonah", abbrs: ["Jnh"] },
    { bookId: "MIC", ordinal: 33, testament: "OT", name: "Micah", nameShort: "Mic", chapters: 7, osised: "Mic", abbrs: ["Mc"] },
    { bookId: "NAM", ordinal: 34, testament: "OT", name: "Nahum", nameShort: "Nah", chapters: 3, osised: "Nah", abbrs: ["Na"] },
    { bookId: "HAB", ordinal: 35, testament: "OT", name: "Habakkuk", nameShort: "Hab", chapters: 3, osised: "Hab", abbrs: ["Hb"] },
    { bookId: "ZEP", ordinal: 36, testament: "OT", name: "Zephaniah", nameShort: "Zeph", chapters: 3, osised: "Zeph", abbrs: ["Zep", "Zp"] },
    { bookId: "HAG", ordinal: 37, testament: "OT", name: "Haggai", nameShort: "Hag", chapters: 2, osised: "Hag", abbrs: ["Hg"] },
    { bookId: "ZEC", ordinal: 38, testament: "OT", name: "Zechariah", nameShort: "Zech", chapters: 14, osised: "Zech", abbrs: ["Zec", "Zc"] },
    { bookId: "MAL", ordinal: 39, testament: "OT", name: "Malachi", nameShort: "Mal", chapters: 4, osised: "Mal", abbrs: ["Ml"] },

    // NT
    { bookId: "MAT", ordinal: 40, testament: "NT", name: "Matthew", nameShort: "Matt", chapters: 28, osised: "Matt", abbrs: ["Mt"] },
    { bookId: "MRK", ordinal: 41, testament: "NT", name: "Mark", nameShort: "Mark", chapters: 16, osised: "Mark", abbrs: ["Mrk", "Mk", "Mr"] },
    { bookId: "LUK", ordinal: 42, testament: "NT", name: "Luke", nameShort: "Luke", chapters: 24, osised: "Luke", abbrs: ["Lk"] },
    { bookId: "JHN", ordinal: 43, testament: "NT", name: "John", nameShort: "John", chapters: 21, osised: "John", abbrs: ["Jn", "Jhn"] },
    { bookId: "ACT", ordinal: 44, testament: "NT", name: "Acts", nameShort: "Acts", chapters: 28, osised: "Acts", abbrs: ["Ac"] },
    { bookId: "ROM", ordinal: 45, testament: "NT", name: "Romans", nameShort: "Rom", chapters: 16, osised: "Rom", abbrs: ["Ro", "Rm"] },
    { bookId: "1CO", ordinal: 46, testament: "NT", name: "1 Corinthians", nameShort: "1 Cor", chapters: 16, osised: "1Cor", abbrs: ["1Co", "I Corinthians"] },
    { bookId: "2CO", ordinal: 47, testament: "NT", name: "2 Corinthians", nameShort: "2 Cor", chapters: 13, osised: "2Cor", abbrs: ["2Co", "II Corinthians"] },
    { bookId: "GAL", ordinal: 48, testament: "NT", name: "Galatians", nameShort: "Gal", chapters: 6, osised: "Gal", abbrs: ["Ga"] },
    { bookId: "EPH", ordinal: 49, testament: "NT", name: "Ephesians", nameShort: "Eph", chapters: 6, osised: "Eph", abbrs: ["Ep"] },
    { bookId: "PHP", ordinal: 50, testament: "NT", name: "Philippians", nameShort: "Phil", chapters: 4, osised: "Phil", abbrs: ["Php", "Pp"] },
    { bookId: "COL", ordinal: 51, testament: "NT", name: "Colossians", nameShort: "Col", chapters: 4, osised: "Col", abbrs: ["Co"] },
    { bookId: "1TH", ordinal: 52, testament: "NT", name: "1 Thessalonians", nameShort: "1 Thess", chapters: 5, osised: "1Thess", abbrs: ["1Th", "I Thessalonians"] },
    { bookId: "2TH", ordinal: 53, testament: "NT", name: "2 Thessalonians", nameShort: "2 Thess", chapters: 3, osised: "2Thess", abbrs: ["2Th", "II Thessalonians"] },
    { bookId: "1TI", ordinal: 54, testament: "NT", name: "1 Timothy", nameShort: "1 Tim", chapters: 6, osised: "1Tim", abbrs: ["1Ti", "I Timothy"] },
    { bookId: "2TI", ordinal: 55, testament: "NT", name: "2 Timothy", nameShort: "2 Tim", chapters: 4, osised: "2Tim", abbrs: ["2Ti", "II Timothy"] },
    { bookId: "TIT", ordinal: 56, testament: "NT", name: "Titus", nameShort: "Titus", chapters: 3, osised: "Titus", abbrs: ["Tit"] },
    { bookId: "PHM", ordinal: 57, testament: "NT", name: "Philemon", nameShort: "Phlm", chapters: 1, osised: "Phlm", abbrs: ["Phm", "Pm"] },
    { bookId: "HEB", ordinal: 58, testament: "NT", name: "Hebrews", nameShort: "Heb", chapters: 13, osised: "Heb", abbrs: ["He"] },
    { bookId: "JAS", ordinal: 59, testament: "NT", name: "James", nameShort: "Jas", chapters: 5, osised: "Jas", abbrs: ["Jm"] },
    { bookId: "1PE", ordinal: 60, testament: "NT", name: "1 Peter", nameShort: "1 Pet", chapters: 5, osised: "1Pet", abbrs: ["1Pe", "I Peter"] },
    { bookId: "2PE", ordinal: 61, testament: "NT", name: "2 Peter", nameShort: "2 Pet", chapters: 3, osised: "2Pet", abbrs: ["2Pe", "II Peter"] },
    { bookId: "1JN", ordinal: 62, testament: "NT", name: "1 John", nameShort: "1 Jn", chapters: 5, osised: "1John", abbrs: ["1Jn", "I John"] },
    { bookId: "2JN", ordinal: 63, testament: "NT", name: "2 John", nameShort: "2 Jn", chapters: 1, osised: "2John", abbrs: ["2Jn", "II John"] },
    { bookId: "3JN", ordinal: 64, testament: "NT", name: "3 John", nameShort: "3 Jn", chapters: 1, osised: "3John", abbrs: ["3Jn", "III John"] },
    { bookId: "JUD", ordinal: 65, testament: "NT", name: "Jude", nameShort: "Jude", chapters: 1, osised: "Jude", abbrs: ["Jud"] },
    { bookId: "REV", ordinal: 66, testament: "NT", name: "Revelation", nameShort: "Rev", chapters: 22, osised: "Rev", abbrs: ["Re", "The Revelation"] },
];

/* ------------------------------ Seed validation ----------------------------- */

function validateBookSeeds(books: readonly BookSeed[]): void {
    if (books.length !== 66) {
        throw new Error(`[db:seed] expected 66 books, got ${books.length}`);
    }

    const ids = new Set<string>();
    const ords = new Set<number>();

    for (const b of books) {
        if (!/^[A-Z0-9_]{2,8}$/.test(b.bookId)) {
            throw new Error(`[db:seed] invalid bookId '${b.bookId}'`);
        }
        if (ids.has(b.bookId)) {
            throw new Error(`[db:seed] duplicate bookId '${b.bookId}'`);
        }
        ids.add(b.bookId);

        if (!Number.isInteger(b.ordinal) || b.ordinal < 1 || b.ordinal > 66) {
            throw new Error(`[db:seed] invalid ordinal for '${b.bookId}'`);
        }
        if (ords.has(b.ordinal)) {
            throw new Error(`[db:seed] duplicate ordinal '${b.ordinal}'`);
        }
        ords.add(b.ordinal);

        if (b.testament !== "OT" && b.testament !== "NT") {
            throw new Error(`[db:seed] invalid testament for '${b.bookId}'`);
        }
        if (!b.name.trim()) {
            throw new Error(`[db:seed] empty name for '${b.bookId}'`);
        }
        if (!b.nameShort.trim()) {
            throw new Error(`[db:seed] empty nameShort for '${b.bookId}'`);
        }
        if (!Number.isInteger(b.chapters) || b.chapters < 1 || b.chapters > 200) {
            throw new Error(`[db:seed] invalid chapters for '${b.bookId}'`);
        }
    }

    for (let i = 1; i <= 66; i += 1) {
        if (!ords.has(i)) {
            throw new Error(`[db:seed] missing ordinal '${i}'`);
        }
    }
}

/* ----------------------------- Seed Operations ----------------------------- */

type Db = ReturnType<typeof openDb>["db"];
type Sqlite = ReturnType<typeof openDb>["sqlite"];

async function seedBooks(db: Db): Promise<void> {
    log("upserting bp_book (66)...");

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
                abbrs: b.abbrs ? safeJsonStringify(b.abbrs) : null,
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

async function ensureSingleDefaultTranslation(db: Db, translationId: string): Promise<void> {
    await db.update(bpTranslation).set({ isDefault: false });
    await db.update(bpTranslation).set({ isDefault: true }).where(eq(bpTranslation.translationId, translationId));
}

async function seedTranslation(db: Db): Promise<void> {
    log("upserting bp_translation...", TRANSLATION_ID);

    if (FORCE_DEFAULT) {
        await db.update(bpTranslation).set({ isDefault: false });
    }

    await db
        .insert(bpTranslation)
        .values({
            translationId: TRANSLATION_ID,
            name: TRANSLATION_NAME,
            language: TRANSLATION_LANG,
            derivedFrom: TRANSLATION_DERIVED_FROM,
            licenseKind: TRANSLATION_LICENSE_KIND as any,
            licenseText: TRANSLATION_LICENSE_TEXT,
            sourceUrl: TRANSLATION_SOURCE_URL,
            isDefault: FORCE_DEFAULT ? true : false,
        })
        .onConflictDoUpdate({
            target: bpTranslation.translationId,
            set: {
                name: TRANSLATION_NAME,
                language: TRANSLATION_LANG,
                derivedFrom: TRANSLATION_DERIVED_FROM,
                licenseKind: TRANSLATION_LICENSE_KIND as any,
                licenseText: TRANSLATION_LICENSE_TEXT,
                sourceUrl: TRANSLATION_SOURCE_URL,
                ...(FORCE_DEFAULT ? ({ isDefault: true } as const) : {}),
            },
        });

    if (!FORCE_DEFAULT) {
        const anyDefault = await db
            .select({ id: bpTranslation.translationId })
            .from(bpTranslation)
            .where(eq(bpTranslation.isDefault, true))
            .limit(1);

        if (!anyDefault[0]) {
            await db.update(bpTranslation).set({ isDefault: true }).where(eq(bpTranslation.translationId, TRANSLATION_ID));
        }
    }

    const defaults = await db
        .select({ id: bpTranslation.translationId })
        .from(bpTranslation)
        .where(eq(bpTranslation.isDefault, true));

    if (defaults.length === 0) {
        await ensureSingleDefaultTranslation(db, TRANSLATION_ID);
    } else if (FORCE_DEFAULT && defaults.length !== 1) {
        await ensureSingleDefaultTranslation(db, TRANSLATION_ID);
    }
}

function getVerseTextCount(sqlite: Sqlite): number {
    const row = sqlite
        .prepare(`SELECT COUNT(*) AS c FROM bp_verse_text WHERE translation_id = ?`)
        .get(TRANSLATION_ID) as { c?: number } | undefined;
    const n = row?.c ?? 0;
    return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function getBookCount(sqlite: Sqlite): number {
    const row = sqlite.prepare(`SELECT COUNT(*) AS c FROM bp_book`).get() as { c?: number } | undefined;
    const n = row?.c ?? 0;
    return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function getTranslationRow(
    sqlite: Sqlite,
): {
    translationId: string;
    name: string | null;
    language: string | null;
    isDefault: number | boolean;
} | null {
    const row = sqlite
        .prepare(
            `
            SELECT
                translation_id AS translationId,
                name           AS name,
                language       AS language,
                is_default     AS isDefault
            FROM bp_translation
            WHERE translation_id = ?
            LIMIT 1
            `,
        )
        .get(TRANSLATION_ID) as
        | {
        translationId: string;
        name: string | null;
        language: string | null;
        isDefault: number | boolean;
    }
        | undefined;

    return row ?? null;
}

function getDefaultTranslationCount(sqlite: Sqlite): number {
    const row = sqlite
        .prepare(`SELECT COUNT(*) AS c FROM bp_translation WHERE is_default = 1`)
        .get() as { c?: number } | undefined;
    const n = row?.c ?? 0;
    return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function verifySeedOutcome(sqlite: Sqlite): void {
    const bookCount = getBookCount(sqlite);
    if (bookCount < 66) {
        throw new Error(`[db:seed] bp_book count too low after seeding: ${bookCount}`);
    }

    const translation = getTranslationRow(sqlite);
    if (!translation) {
        throw new Error(`[db:seed] seeded translation '${TRANSLATION_ID}' not found after commit`);
    }

    const defaultCount = getDefaultTranslationCount(sqlite);
    if (defaultCount < 1) {
        throw new Error("[db:seed] no default translation exists after seeding");
    }

    if (FORCE_DEFAULT && defaultCount !== 1) {
        throw new Error(`[db:seed] expected exactly 1 default translation in FORCE_DEFAULT mode, got ${defaultCount}`);
    }
}

/* ---------------------------------- Main ---------------------------------- */

async function main(): Promise<void> {
    assertSafeTranslationId(TRANSLATION_ID);
    validateBookSeeds(PROTESTANT_66);

    const handle = openDb();
    const { sqlite, db, dbPath, close, readonly } = handle;

    if (readonly) {
        fatal(
            "seed runner opened DB in readonly mode.",
            JSON.stringify({
                dbPath,
                hint: "Unset BP_DB_READONLY or set BP_DB_READONLY=0 before running db:seed.",
            }),
        );
    }

    log("dbPath:", dbPath);
    log(
        "translation:",
        JSON.stringify({
            translationId: TRANSLATION_ID,
            name: TRANSLATION_NAME,
            language: TRANSLATION_LANG,
            forceDefault: FORCE_DEFAULT,
        }),
    );

    try {
        await runTx(sqlite, async () => {
            await seedBooks(db);
            await seedTranslation(db);
        });
    } finally {
        close();
    }

    const check = openDb();
    try {
        verifySeedOutcome(check.sqlite);

        const verseTextCount = getVerseTextCount(check.sqlite);
        const translation = getTranslationRow(check.sqlite);
        const bookCount = getBookCount(check.sqlite);
        const defaultCount = getDefaultTranslationCount(check.sqlite);

        log(
            "post-check:",
            JSON.stringify({
                bpBookCount: bookCount,
                translationId: translation?.translationId ?? null,
                translationName: translation?.name ?? null,
                language: translation?.language ?? null,
                isDefault: translation ? !!translation.isDefault : null,
                defaultTranslationCount: defaultCount,
                verseTextCount,
            }),
        );

        if (verseTextCount === 0) {
            warn("no bp_verse_text rows found for this translation_id.");
            warn("Run your translation importer, or set BP_TRANSLATION_ID to match the imported translation_id.");
        }
    } finally {
        check.close();
    }

    log("seed complete.");
}

main().catch((err) => fatal(err));