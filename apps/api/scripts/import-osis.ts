//noinspection SpellCheckingInspection
// apps/api/scripts/import-osis.ts
//
// Biblia.to — hardened OSIS XML importer (bp_* schema)
//
// Imports an OSIS Bible XML (e.g. KJV OSIS) into SQLite for reading.
//
// Writes:
// - bp_translation (upsert)
// - bp_verse (verse address space + verse_ord)
// - bp_verse_text (text overlay for a translation)
// - bp_chapter (derived from bp_verse; optional but useful)
//
// Robustness:
// - streaming parse (no full-file load)
// - supports <verse osisID="Gen.1.1">...</verse>
// - supports milestone style: <verse sID="Gen.1.1"/> ... <verse eID="Gen.1.1"/>
// - ignores text inside <note> while collecting verse text
// - chunked transactions for speed + resilience
// - idempotent no-op path when source fingerprint already imported
// - guarded destructive modes
//
// Usage (repo root):
//   bun add saxes
//   bun apps/api/scripts/import-osis.ts ./resources/kjv.xml
//
// Env:
//   BP_DB_PATH                         optional
//   BP_IMPORT_TRANSLATION_ID           default: KJV
//   BP_IMPORT_TRANSLATION_NAME         default: King James Version
//   BP_IMPORT_LANGUAGE                 default: en
//   BP_IMPORT_LICENSE_KIND             default: PUBLIC_DOMAIN
//   BP_IMPORT_SET_DEFAULT              "1" -> set bp_translation.is_default=1 (and clear others)
//   BP_IMPORT_CLEAR_TEXT               "1" -> deletes bp_verse_text rows for this translation before import
//   BP_IMPORT_CLEAR_SPINE              "1" -> deletes bp_verse + bp_chapter (DANGER; rebuilds ordinals from file)
//   BP_IMPORT_BATCH_SIZE               default: 5000 (commit interval)
//   BP_IMPORT_LOG_EVERY                default: 2500
//   BP_IMPORT_SKIP_IF_SAME             default: 1
//   BP_IMPORT_FORCE                    "1" -> bypass source fingerprint skip
//   BP_IMPORT_ALLOW_SPINE_REBUILD      required when BP_IMPORT_CLEAR_SPINE=1
//
// Notes:
// - Run migrations first: bun --cwd apps/api run db:migrate
// - Make sure bp_book is seeded (bun --cwd apps/api run db:seed) so ordinals exist.

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { SaxesParser, type SaxesTagPlain } from "saxes";

import { openDb } from "../src/db/client";

/* -------------------------------- Config ---------------------------------- */

const TRANSLATION_ID = envNonEmpty("BP_IMPORT_TRANSLATION_ID", "KJV");
const TRANSLATION_NAME = envNonEmpty("BP_IMPORT_TRANSLATION_NAME", "King James Version");
const LANGUAGE = envNonEmpty("BP_IMPORT_LANGUAGE", "en");

const LICENSE_KIND = envNonEmpty("BP_IMPORT_LICENSE_KIND", "PUBLIC_DOMAIN"); // PUBLIC_DOMAIN | LICENSED | CUSTOM
const SET_DEFAULT = envBool("BP_IMPORT_SET_DEFAULT", false);

const CLEAR_TEXT = envBool("BP_IMPORT_CLEAR_TEXT", false);
const CLEAR_SPINE = envBool("BP_IMPORT_CLEAR_SPINE", false); // deletes bp_verse/bp_chapter
const ALLOW_SPINE_REBUILD = envBool("BP_IMPORT_ALLOW_SPINE_REBUILD", false);

const BATCH_SIZE = envInt("BP_IMPORT_BATCH_SIZE", 5000);
const LOG_EVERY = envInt("BP_IMPORT_LOG_EVERY", 2500);

const SKIP_IF_SAME = envBool("BP_IMPORT_SKIP_IF_SAME", true);
const FORCE = envBool("BP_IMPORT_FORCE", false);

const IMPORTER_VERSION = "2026-03-07.1";

/* -------------------------------- Logging --------------------------------- */

function log(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.log("[import:osis]", ...args);
}

function warn(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.warn("[import:osis]", ...args);
}

function fatal(...args: unknown[]): never {
    // eslint-disable-next-line no-console
    console.error("[import:osis]", ...args);
    process.exit(1);
}

/* ------------------------------ Env helpers ------------------------------- */

function envStr(name: string, fallback = ""): string {
    const raw = process.env[name];
    if (typeof raw !== "string") return fallback;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

function envNonEmpty(name: string, fallback: string): string {
    const value = envStr(name, fallback);
    if (!value) {
        fatal(`${name} resolved to empty string`);
    }
    return value;
}

function envBool(name: string, fallback = false): boolean {
    const raw = envStr(name, "");
    if (!raw) return fallback;

    switch (raw.toLowerCase()) {
        case "1":
        case "true":
        case "yes":
        case "on":
            return true;
        case "0":
        case "false":
        case "no":
        case "off":
            return false;
        default:
            return fallback;
    }
}

function envInt(name: string, fallback: number): number {
    const raw = envStr(name, "");
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/* ------------------------------ Utilities ---------------------------------- */

function normalizeText(s: string): string {
    return s.replace(/\s+/g, " ").trim();
}

function normalizeForSearch(s: string): string {
    return normalizeText(s).toLowerCase();
}

function sha256HexText(s: string): string {
    return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function sha256HexFile(filePath: string): string {
    const hash = crypto.createHash("sha256");
    const fd = fs.openSync(filePath, "r");

    try {
        const buf = Buffer.allocUnsafe(1024 * 1024);
        for (;;) {
            const n = fs.readSync(fd, buf, 0, buf.length, null);
            if (n <= 0) break;
            hash.update(n === buf.length ? buf : buf.subarray(0, n));
        }
    } finally {
        fs.closeSync(fd);
    }

    return hash.digest("hex");
}

function isFinitePosInt(n: number): boolean {
    return Number.isFinite(n) && n > 0 && Math.floor(n) === n;
}

function isSafeNonNegativeInt(n: number): boolean {
    return Number.isFinite(n) && n >= 0 && Math.floor(n) === n;
}

function normalizeAbs(p: string): string {
    return path.isAbsolute(p) ? path.normalize(p) : path.resolve(process.cwd(), p);
}

function inspectErrorCode(error: unknown): string | undefined {
    if (typeof error !== "object" || error === null) return undefined;
    if (!("code" in error)) return undefined;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
}

function sqlStringLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/* -------------------------- OSIS → BP book mapping -------------------------- */

const OSIS_TO_BP: Record<string, string> = {
    gen: "GEN",
    exod: "EXO",
    lev: "LEV",
    num: "NUM",
    deut: "DEU",
    josh: "JOS",
    judg: "JDG",
    ruth: "RUT",
    "1sam": "1SA",
    "2sam": "2SA",
    "1kgs": "1KI",
    "2kgs": "2KI",
    "1chr": "1CH",
    "2chr": "2CH",
    ezra: "EZR",
    neh: "NEH",
    esth: "EST",
    job: "JOB",
    ps: "PSA",
    psa: "PSA",
    prov: "PRO",
    eccl: "ECC",
    song: "SNG",
    isa: "ISA",
    jer: "JER",
    lam: "LAM",
    ezek: "EZK",
    dan: "DAN",
    hos: "HOS",
    joel: "JOL",
    amos: "AMO",
    obad: "OBA",
    jonah: "JON",
    mic: "MIC",
    nah: "NAM",
    hab: "HAB",
    zeph: "ZEP",
    hag: "HAG",
    zech: "ZEC",
    mal: "MAL",

    matt: "MAT",
    mark: "MRK",
    luke: "LUK",
    john: "JHN",
    acts: "ACT",
    rom: "ROM",
    "1cor": "1CO",
    "2cor": "2CO",
    gal: "GAL",
    eph: "EPH",
    phil: "PHP",
    col: "COL",
    "1thess": "1TH",
    "2thess": "2TH",
    "1tim": "1TI",
    "2tim": "2TI",
    titus: "TIT",
    phlm: "PHM",
    heb: "HEB",
    jas: "JAS",
    "1pet": "1PE",
    "2pet": "2PE",
    "1john": "1JN",
    "2john": "2JN",
    "3john": "3JN",
    jude: "JUD",
    rev: "REV",
};

function mapBookId(osisBookId: string): string | null {
    const key = osisBookId.trim().toLowerCase();
    return OSIS_TO_BP[key] ?? null;
}

function sanitizeOsisId(ref: string): string {
    const first = ref.split("-")[0] ?? ref;
    return (first.split("!")[0] ?? first).trim();
}

function parseOsisRef(ref: string): { osisBook: string; chap: number; verse: number } | null {
    const clean = sanitizeOsisId(ref);
    const parts = clean.split(".");
    if (parts.length < 3) return null;

    const osisBook = parts[0]!.trim();
    const chap = Number(parts[1]);
    const verse = Number(parts[2]);

    if (!isFinitePosInt(chap) || !isFinitePosInt(verse)) return null;
    return { osisBook, chap, verse };
}

function makeVerseKey(bookId: string, chapter: number, verse: number): string {
    return `${bookId}.${chapter}.${verse}`;
}

/* ------------------------------ DB glue types ------------------------------ */

type SqliteScalar = string | number | bigint | Uint8Array | Buffer | null;

type SqliteStmt = {
    run: (...params: SqliteScalar[]) => unknown;
    get: (...params: SqliteScalar[]) => unknown;
    all: (...params: SqliteScalar[]) => unknown[];
};

type SqliteLike = {
    exec: (sql: string) => void;
    query: (sql: string) => SqliteStmt;
};

type ImportHistoryRow = {
    import_id: number;
    translation_id: string;
    source_path: string;
    source_hash: string;
    file_size: number;
    importer_version: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    verse_count: number | null;
};

type ImportRun = {
    importId: number;
    sourcePath: string;
    sourceHash: string;
    fileSize: number;
};

/* ------------------------------ DB helpers --------------------------------- */

function ensureSchemaPresent(sqlite: SqliteLike): void {
    const mustHave = ["bp_book", "bp_translation", "bp_verse", "bp_verse_text"];
    for (const tableName of mustHave) {
        const ok = sqlite
             .query(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1;`)
             .get(tableName);

        if (!ok) {
            fatal(`missing table "${tableName}". Run: bun --cwd apps/api run db:migrate`);
        }
    }
}

function ensureBooksSeeded(sqlite: SqliteLike): void {
    const row = sqlite.query(`SELECT COUNT(1) AS n FROM bp_book;`).get() as { n?: number } | undefined;
    const n = Number(row?.n ?? 0);

    if (!Number.isFinite(n) || n <= 0) {
        fatal(`bp_book is empty. Run: bun --cwd apps/api run db:seed`);
    }
}

function ensureImportHistoryTable(sqlite: SqliteLike): void {
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS bp_import_history(
            import_id INTEGER PRIMARY KEY AUTOINCREMENT,
            translation_id TEXT NOT NULL,
            source_path TEXT NOT NULL,
            source_hash TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            importer_version TEXT NOT NULL,
            status TEXT NOT NULL, -- STARTED | SUCCEEDED | FAILED
            started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            completed_at TEXT NULL,
            verse_count INTEGER NULL,
            notes TEXT NULL
        );
    `);

    sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_bp_import_history_lookup
        ON bp_import_history(translation_id, source_hash, importer_version, status);
    `);

    sqlite.exec(`
        CREATE INDEX IF NOT EXISTS idx_bp_import_history_started
        ON bp_import_history(started_at);
    `);
}

function assertDestructiveModesAllowed(): void {
    if (CLEAR_SPINE && !ALLOW_SPINE_REBUILD) {
        fatal(
             "BP_IMPORT_CLEAR_SPINE=1 is destructive and requires BP_IMPORT_ALLOW_SPINE_REBUILD=1",
        );
    }
}

function upsertTranslation(sqlite: SqliteLike): void {
    if (SET_DEFAULT) {
        sqlite.query(`UPDATE bp_translation SET is_default = 0;`).run();
    }

    sqlite
         .query(
              `INSERT INTO bp_translation(
                translation_id,
                name,
                language,
                derived_from,
                license_kind,
                license_text,
                source_url,
                is_default,
                created_at
            ) VALUES (
                ?, ?, ?, NULL, ?, NULL, NULL, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now')
            )
            ON CONFLICT(translation_id) DO UPDATE SET
                name=excluded.name,
                language=excluded.language,
                license_kind=excluded.license_kind,
                is_default=CASE
                    WHEN excluded.is_default=1 THEN 1
                    ELSE bp_translation.is_default
                END;`,
         )
         .run(TRANSLATION_ID, TRANSLATION_NAME, LANGUAGE, LICENSE_KIND, SET_DEFAULT ? 1 : 0);
}

function maybeClearText(sqlite: SqliteLike): void {
    if (!CLEAR_TEXT) return;
    log("clearing bp_verse_text for translation:", TRANSLATION_ID);
    sqlite.query(`DELETE FROM bp_verse_text WHERE translation_id = ?;`).run(TRANSLATION_ID);
}

function maybeClearSpine(sqlite: SqliteLike): void {
    if (!CLEAR_SPINE) return;

    warn("BP_IMPORT_CLEAR_SPINE=1 -> deleting bp_chapter + bp_verse and rebuilding ordinals from OSIS order");
    sqlite.query(`DELETE FROM bp_chapter;`).run();
    sqlite.query(`DELETE FROM bp_verse;`).run();
}

function rebuildChapters(sqlite: SqliteLike): void {
    sqlite.exec(`
        DELETE FROM bp_chapter;

        INSERT INTO bp_chapter(book_id, chapter, start_verse_ord, end_verse_ord, verse_count)
        SELECT
            book_id,
            chapter,
            MIN(verse_ord) AS start_verse_ord,
            MAX(verse_ord) AS end_verse_ord,
            COUNT(*) AS verse_count
        FROM bp_verse
        GROUP BY book_id, chapter
        ORDER BY book_id, chapter;
    `);
}

function hasFtsTable(sqlite: SqliteLike): boolean {
    return Boolean(
         sqlite.query(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='bp_verse_text_fts' LIMIT 1;`).get(),
    );
}

function begin(sqlite: SqliteLike): void {
    sqlite.exec("BEGIN;");
}

function commit(sqlite: SqliteLike): void {
    sqlite.exec("COMMIT;");
}

function rollbackQuiet(sqlite: SqliteLike): void {
    try {
        sqlite.exec("ROLLBACK;");
    } catch {
        // ignore
    }
}

function startImportHistory(
     sqlite: SqliteLike,
     sourcePath: string,
     sourceHash: string,
     fileSize: number,
): ImportRun {
    sqlite
         .query(
              `INSERT INTO bp_import_history(
                translation_id,
                source_path,
                source_hash,
                file_size,
                importer_version,
                status,
                started_at,
                completed_at,
                verse_count,
                notes
            ) VALUES (
                ?, ?, ?, ?, ?, 'STARTED', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, NULL, NULL
            );`,
         )
         .run(TRANSLATION_ID, sourcePath, sourceHash, fileSize, IMPORTER_VERSION);

    const row = sqlite.query(`SELECT last_insert_rowid() AS id;`).get() as { id?: number | bigint } | undefined;
    const idNum = Number(row?.id ?? NaN);

    if (!isFinitePosInt(idNum)) {
        fatal("failed to create bp_import_history row");
    }

    return {
        importId: idNum,
        sourcePath,
        sourceHash,
        fileSize,
    };
}

function markImportSucceeded(sqlite: SqliteLike, run: ImportRun, verseCount: number, notes: string | null): void {
    sqlite
         .query(
              `UPDATE bp_import_history
             SET status='SUCCEEDED',
                 completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                 verse_count=?,
                 notes=?
             WHERE import_id=?;`,
         )
         .run(verseCount, notes, run.importId);
}

function markImportFailed(sqlite: SqliteLike, run: ImportRun | null, notes: string): void {
    if (!run) return;

    sqlite
         .query(
              `UPDATE bp_import_history
             SET status='FAILED',
                 completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                 notes=?
             WHERE import_id=?;`,
         )
         .run(notes, run.importId);
}

function getLastSuccessfulImport(
     sqlite: SqliteLike,
     sourceHash: string,
): ImportHistoryRow | null {
    const row = sqlite
         .query(
              `SELECT
                import_id,
                translation_id,
                source_path,
                source_hash,
                file_size,
                importer_version,
                status,
                started_at,
                completed_at,
                verse_count
             FROM bp_import_history
             WHERE translation_id = ?
               AND source_hash = ?
               AND importer_version = ?
               AND status = 'SUCCEEDED'
             ORDER BY import_id DESC
             LIMIT 1;`,
         )
         .get(TRANSLATION_ID, sourceHash, IMPORTER_VERSION) as ImportHistoryRow | undefined;

    return row ?? null;
}

function canSkipSameImport(
     sqlite: SqliteLike,
     sourceHash: string,
): boolean {
    if (!SKIP_IF_SAME || FORCE) return false;
    if (CLEAR_TEXT || CLEAR_SPINE) return false;

    const prior = getLastSuccessfulImport(sqlite, sourceHash);
    return prior !== null;
}

function warnAboutPreexistingSpine(sqlite: SqliteLike): void {
    const verseRow = sqlite.query(`SELECT COUNT(1) AS n FROM bp_verse;`).get() as { n?: number } | undefined;
    const verseCount = Number(verseRow?.n ?? 0);

    if (verseCount > 0 && CLEAR_SPINE) {
        warn(`existing bp_verse rows will be rebuilt: ${verseCount}`);
    }
}

function maybeDeleteTextForTranslationWhenForce(sqlite: SqliteLike): void {
    if (CLEAR_TEXT) return;
    if (!FORCE) return;

    warn("BP_IMPORT_FORCE=1 without BP_IMPORT_CLEAR_TEXT=1 may overwrite existing verse text rows for translation:", TRANSLATION_ID);
}

function formatUnknownError(error: unknown): string {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
    }
    return String(error);
}

function ensureReadableFile(xmlPath: string): { size: number } {
    let stat: fs.Stats;
    try {
        stat = fs.statSync(xmlPath);
    } catch (error: unknown) {
        fatal("unable to stat xml file:", xmlPath, formatUnknownError(error));
    }

    if (!stat.isFile()) {
        fatal("xml path is not a file:", xmlPath);
    }

    if (!Number.isFinite(stat.size) || stat.size <= 0) {
        fatal("xml file is empty:", xmlPath);
    }

    return { size: stat.size };
}

function assertConfig(): void {
    if (!isFinitePosInt(BATCH_SIZE) || BATCH_SIZE < 500) {
        fatal("BP_IMPORT_BATCH_SIZE must be >= 500. got:", BATCH_SIZE);
    }

    if (!isSafeNonNegativeInt(LOG_EVERY)) {
        fatal("BP_IMPORT_LOG_EVERY must be >= 0. got:", LOG_EVERY);
    }

    assertDestructiveModesAllowed();
}

function pragmaTune(sqlite: SqliteLike): void {
    sqlite.exec(`
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA temp_store = MEMORY;
        PRAGMA busy_timeout = 5000;
    `);
}

function maybeCreateImportView(sqlite: SqliteLike): void {
    // Optional convenience view. Safe if schema evolves.
    try {
        sqlite.exec(`
            CREATE VIEW IF NOT EXISTS bp_import_history_latest AS
            SELECT *
            FROM bp_import_history
            WHERE import_id IN (
                SELECT MAX(import_id)
                FROM bp_import_history
                GROUP BY translation_id, source_hash, importer_version, status
            );
        `);
    } catch {
        // ignore
    }
}

/* -------------------------------- Importer -------------------------------- */

type VerseFinalize = { osisId: string; text: string };

type ImportStats = {
    inserted: number;
    skipped: number;
    verseStartsSeen: number;
    verseOrd: number;
    unknownBooks: Set<string>;
};

async function main(): Promise<void> {
    const fileArg = process.argv[2];
    if (!fileArg) {
        fatal("missing xml file path. Example: bun apps/api/scripts/import-osis.ts ./resources/kjv.xml");
    }

    const xmlPath = normalizeAbs(fileArg);
    if (!fs.existsSync(xmlPath)) {
        fatal("file not found:", xmlPath);
    }

    assertConfig();

    const { size: fileSize } = ensureReadableFile(xmlPath);
    const sourceHash = sha256HexFile(xmlPath);

    const { sqlite, dbPath, close } = openDb();
    const s = sqlite as unknown as SqliteLike;

    let importRun: ImportRun | null = null;

    try {
        pragmaTune(s);
        ensureSchemaPresent(s);
        ensureBooksSeeded(s);
        ensureImportHistoryTable(s);
        maybeCreateImportView(s);

        if (canSkipSameImport(s, sourceHash)) {
            log("skip: identical source already imported for translation");
            log("dbPath:", dbPath);
            log("translationId:", TRANSLATION_ID);
            log("sourceHash:", sourceHash);
            return;
        }

        warnAboutPreexistingSpine(s);
        maybeDeleteTextForTranslationWhenForce(s);

        begin(s);
        try {
            upsertTranslation(s);
            maybeClearText(s);
            maybeClearSpine(s);
            commit(s);
        } catch (error: unknown) {
            rollbackQuiet(s);
            throw error;
        }

        importRun = startImportHistory(s, xmlPath, sourceHash, fileSize);

        log("dbPath:", dbPath);
        log("translationId:", TRANSLATION_ID);
        log("translationName:", TRANSLATION_NAME);
        log("language:", LANGUAGE);
        log("sourcePath:", xmlPath);
        log("sourceHash:", sourceHash);
        log("fileSize:", fileSize);
        log("batchSize:", BATCH_SIZE);
        log("logEvery:", LOG_EVERY);
        log("fts table present:", hasFtsTable(s));

        const stmtBookOrd = s.query(`SELECT ordinal AS ord FROM bp_book WHERE book_id = ? LIMIT 1;`);

        const stmtUpsertVerse = s.query(
             `INSERT INTO bp_verse(
                verse_key,
                book_id,
                chapter,
                verse,
                verse_ord,
                chapter_ord,
                is_superscription,
                is_deuterocanon
            ) VALUES (?, ?, ?, ?, ?, NULL, 0, 0)
            ON CONFLICT(verse_key) DO UPDATE SET
                book_id=excluded.book_id,
                chapter=excluded.chapter,
                verse=excluded.verse,
                verse_ord=excluded.verse_ord;`,
        );

        const stmtUpsertVerseText = s.query(
             `INSERT INTO bp_verse_text(
                translation_id,
                verse_key,
                text,
                text_norm,
                hash,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            ON CONFLICT(translation_id, verse_key) DO UPDATE SET
                text=excluded.text,
                text_norm=excluded.text_norm,
                hash=excluded.hash,
                updated_at=excluded.updated_at;`,
        );

        let verseOrd = 0;
        if (!CLEAR_SPINE) {
            const row = s.query(`SELECT MAX(verse_ord) AS mx FROM bp_verse;`).get() as { mx?: number } | undefined;
            const maxOrd = Number(row?.mx ?? 0);
            verseOrd = Number.isFinite(maxOrd) ? Math.max(0, Math.trunc(maxOrd)) : 0;
        }

        let inTx = false;
        let pending = 0;

        const beginTx = (): void => {
            if (inTx) return;
            begin(s);
            inTx = true;
        };

        const commitTx = (): void => {
            if (!inTx) return;
            commit(s);
            inTx = false;
            pending = 0;
        };

        const rollbackTx = (): void => {
            if (!inTx) return;
            rollbackQuiet(s);
            inTx = false;
            pending = 0;
        };

        const flushMaybe = (): void => {
            if (pending >= BATCH_SIZE) {
                commitTx();
            }
        };

        const parser = new SaxesParser({ xmlns: false });

        let currentVerseId: string | null = null;
        let collecting = false;
        let endOnCloseTag = false;
        let endOnEidMilestone = false;
        let buf = "";
        let ignoreNoteDepth = 0;

        let inserted = 0;
        let skipped = 0;
        const unknownBooks = new Set<string>();
        let verseStartsSeen = 0;

        function getBookOrdinal(bookId: string): number | null {
            const row = stmtBookOrd.get(bookId) as { ord?: number } | undefined;
            const ord = Number(row?.ord ?? NaN);
            return Number.isFinite(ord) ? ord : null;
        }

        function finalizeVerse(v: VerseFinalize): void {
            const ref = parseOsisRef(v.osisId);
            if (!ref) {
                skipped += 1;
                return;
            }

            const bpBookId = mapBookId(ref.osisBook);
            if (!bpBookId) {
                unknownBooks.add(ref.osisBook);
                skipped += 1;
                return;
            }

            const bookOrd = getBookOrdinal(bpBookId);
            if (bookOrd == null) {
                unknownBooks.add(ref.osisBook);
                skipped += 1;
                return;
            }

            const text = normalizeText(v.text);
            if (!text) {
                skipped += 1;
                return;
            }

            const verseKey = makeVerseKey(bpBookId, ref.chap, ref.verse);

            beginTx();

            verseOrd += 1;

            stmtUpsertVerse.run(verseKey, bpBookId, ref.chap, ref.verse, verseOrd);

            const textNorm = normalizeForSearch(text);
            const hash = sha256HexText(text);

            stmtUpsertVerseText.run(TRANSLATION_ID, verseKey, text, textNorm, hash);

            inserted += 1;
            pending += 1;

            if (LOG_EVERY > 0 && inserted % LOG_EVERY === 0) {
                log("progress:", inserted, "verses");
            }

            flushMaybe();
        }

        function resetVerseState(): void {
            collecting = false;
            currentVerseId = null;
            endOnCloseTag = false;
            endOnEidMilestone = false;
            buf = "";
            ignoreNoteDepth = 0;
        }

        parser.on("error", (error: Error) => {
            throw error;
        });

        parser.on("opentag", (tag: SaxesTagPlain) => {
            const name = tag.name;

            if (collecting && name === "note") {
                ignoreNoteDepth += 1;
                return;
            }

            if (name !== "verse") return;

            const attrs = tag.attributes as Record<string, unknown>;
            const osisID = attrs["osisID"];
            const sID = attrs["sID"];
            const eID = attrs["eID"];

            if (typeof eID === "string" && eID.length > 0) {
                if (collecting && endOnEidMilestone && currentVerseId === eID) {
                    finalizeVerse({ osisId: eID, text: buf });
                    resetVerseState();
                }
                return;
            }

            const startId =
                 typeof osisID === "string" && osisID.length > 0
                      ? osisID
                      : typeof sID === "string" && sID.length > 0
                           ? sID
                           : null;

            if (!startId) return;

            verseStartsSeen += 1;

            if (collecting && currentVerseId) {
                finalizeVerse({ osisId: currentVerseId, text: buf });
            }

            collecting = true;
            currentVerseId = startId;
            buf = "";
            ignoreNoteDepth = 0;

            endOnCloseTag = typeof osisID === "string" && osisID.length > 0;
            endOnEidMilestone = !endOnCloseTag && typeof sID === "string" && sID.length > 0;
        });

        parser.on("text", (txt: string) => {
            if (!collecting) return;
            if (ignoreNoteDepth > 0) return;
            buf += txt;
        });

        parser.on("cdata", (txt: string) => {
            if (!collecting) return;
            if (ignoreNoteDepth > 0) return;
            buf += txt;
        });

        parser.on("closetag", (t: string | SaxesTagPlain) => {
            const name = typeof t === "string" ? t : t.name;

            if (collecting && name === "note" && ignoreNoteDepth > 0) {
                ignoreNoteDepth -= 1;
                return;
            }

            if (name === "verse") {
                if (collecting && endOnCloseTag && currentVerseId) {
                    finalizeVerse({ osisId: currentVerseId, text: buf });
                    resetVerseState();
                }
            }
        });

        log("importing:", xmlPath);

        const stream = fs.createReadStream(xmlPath, { encoding: "utf8" });

        try {
            await new Promise<void>((resolve, reject) => {
                stream.on("data", (chunk: string) => {
                    try {
                        parser.write(chunk);
                    } catch (error: unknown) {
                        reject(error);
                    }
                });

                stream.on("end", () => {
                    try {
                        parser.close();
                        resolve();
                    } catch (error: unknown) {
                        reject(error);
                    }
                });

                stream.on("error", (error: Error) => {
                    reject(error);
                });
            });

            if (collecting && currentVerseId) {
                finalizeVerse({ osisId: currentVerseId, text: buf });
                resetVerseState();
            }

            commitTx();

            begin(s);
            try {
                rebuildChapters(s);
                commit(s);
            } catch (error: unknown) {
                rollbackQuiet(s);
                throw error;
            }

            const stats: ImportStats = {
                inserted,
                skipped,
                verseStartsSeen,
                verseOrd,
                unknownBooks,
            };

            const notes =
                 stats.unknownBooks.size > 0
                      ? `unknown_books=${Array.from(stats.unknownBooks).sort().join(",")}`
                      : null;

            markImportSucceeded(s, importRun, stats.inserted, notes);

            log("done.");
            log("verseStartsSeen:", stats.verseStartsSeen);
            log("inserted:", stats.inserted, "skipped:", stats.skipped);
            log("max verse_ord now:", stats.verseOrd);

            if (stats.verseStartsSeen === 0) {
                warn("No <verse> tags detected. Paste ~40 lines around a verse and adapt parser shape.");
            }

            if (stats.unknownBooks.size > 0) {
                warn("unknown OSIS book ids encountered:", Array.from(stats.unknownBooks).sort().join(", "));
                warn("If legit, add mappings in OSIS_TO_BP.");
            }
        } catch (error: unknown) {
            rollbackTx();
            const note = formatUnknownError(error);
            markImportFailed(s, importRun, note);
            throw error;
        } finally {
            try {
                stream.close();
            } catch {
                // ignore
            }
        }
    } finally {
        close();
    }
}

void main().catch((error: unknown) => {
    fatal(formatUnknownError(error));
});