//noinspection SpellCheckingInspection
// apps/api/scripts/import-osis.ts
//
// Biblia Populi — OSIS XML importer (bp_* schema)
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

const TRANSLATION_ID = (process.env.BP_IMPORT_TRANSLATION_ID ?? "KJV").trim();
const TRANSLATION_NAME = (process.env.BP_IMPORT_TRANSLATION_NAME ?? "King James Version").trim();
const LANGUAGE = (process.env.BP_IMPORT_LANGUAGE ?? "en").trim();

const LICENSE_KIND = (process.env.BP_IMPORT_LICENSE_KIND ?? "PUBLIC_DOMAIN").trim(); // PUBLIC_DOMAIN | LICENSED | CUSTOM
const SET_DEFAULT = (process.env.BP_IMPORT_SET_DEFAULT ?? "").trim() === "1";

const CLEAR_TEXT = (process.env.BP_IMPORT_CLEAR_TEXT ?? "").trim() === "1";
const CLEAR_SPINE = (process.env.BP_IMPORT_CLEAR_SPINE ?? "").trim() === "1"; // deletes bp_verse/bp_chapter

const BATCH_SIZE = Number(process.env.BP_IMPORT_BATCH_SIZE ?? "5000");
const LOG_EVERY = Number(process.env.BP_IMPORT_LOG_EVERY ?? "2500");

function log(...args: unknown[]) {
    // eslint-disable-next-line no-console
    console.log("[import:osis]", ...args);
}
function warn(...args: unknown[]) {
    // eslint-disable-next-line no-console
    console.warn("[import:osis]", ...args);
}
function fatal(...args: unknown[]): never {
    // eslint-disable-next-line no-console
    console.error("[import:osis]", ...args);
    process.exit(1);
}

/* ------------------------------ Utilities ---------------------------------- */

function normalizeText(s: string): string {
    return s.replace(/\s+/g, " ").trim();
}

function normalizeForSearch(s: string): string {
    return normalizeText(s).toLowerCase();
}

function sha256Hex(s: string): string {
    return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function isFinitePosInt(n: number): boolean {
    return Number.isFinite(n) && n > 0 && Math.floor(n) === n;
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
    // Drop range suffixes or segment suffixes if present:
    // Gen.1.1-Gen.1.2  => Gen.1.1
    // Gen.1.1!a        => Gen.1.1
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

type SqliteStmt = {
    run: (...params: any[]) => unknown;
    get: (...params: any[]) => unknown;
    all: (...params: any[]) => unknown[];
};

type SqliteLike = {
    exec: (sql: string) => void;
    query: (sql: string) => SqliteStmt;
};

/* ------------------------------ DB helpers --------------------------------- */

function ensureSchemaPresent(sqlite: SqliteLike): void {
    const mustHave = ["bp_book", "bp_translation", "bp_verse", "bp_verse_text"];
    for (const t of mustHave) {
        const ok = sqlite
            .query(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1;`)
            .get(t);
        if (!ok) fatal(`missing table "${t}". Run: bun --cwd apps/api run db:migrate`);
    }
}

function ensureBooksSeeded(sqlite: SqliteLike): void {
    const row = sqlite.query(`SELECT COUNT(1) AS n FROM bp_book;`).get() as { n?: number } | undefined;
    const n = Number(row?.n ?? 0);
    if (!Number.isFinite(n) || n <= 0) {
        fatal(`bp_book is empty. Run: bun --cwd apps/api run db:seed`);
    }
}

function upsertTranslation(sqlite: SqliteLike): void {
    // Optionally enforce single default
    if (SET_DEFAULT) {
        sqlite.query(`UPDATE bp_translation SET is_default = 0;`).run();
    }

    sqlite
        .query(
            `INSERT INTO bp_translation(
          translation_id, name, language, derived_from, license_kind, license_text, source_url, is_default, created_at
       ) VALUES (?, ?, ?, NULL, ?, NULL, NULL, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(translation_id) DO UPDATE SET
          name=excluded.name,
          language=excluded.language,
          license_kind=excluded.license_kind,
          is_default=CASE WHEN excluded.is_default=1 THEN 1 ELSE bp_translation.is_default END;`,
        )
        .run(TRANSLATION_ID, TRANSLATION_NAME, LANGUAGE, LICENSE_KIND, SET_DEFAULT ? 1 : 0);
}

function maybeClearText(sqlite: SqliteLike): void {
    if (!CLEAR_TEXT) return;
    log("clearing bp_verse_text for translation…", TRANSLATION_ID);
    sqlite.query(`DELETE FROM bp_verse_text WHERE translation_id = ?;`).run(TRANSLATION_ID);
}

function maybeClearSpine(sqlite: SqliteLike): void {
    if (!CLEAR_SPINE) return;
    warn("BP_IMPORT_CLEAR_SPINE=1 set — deleting bp_chapter + bp_verse (rebuilds ordinals from file).");
    sqlite.query(`DELETE FROM bp_chapter;`).run();
    sqlite.query(`DELETE FROM bp_verse;`).run();
}

function rebuildChapters(sqlite: SqliteLike): void {
    // Rebuild bp_chapter from bp_verse (safe + deterministic).
    sqlite.exec(`
    DELETE FROM bp_chapter;
    INSERT INTO bp_chapter(book_id, chapter, start_verse_ord, end_verse_ord, verse_count)
    SELECT
      book_id,
      chapter,
      MIN(verse_ord) AS start_verse_ord,
      MAX(verse_ord) AS end_verse_ord,
      COUNT(*)        AS verse_count
    FROM bp_verse
    GROUP BY book_id, chapter
    ORDER BY book_id, chapter;
  `);
}

/* -------------------------------- Importer -------------------------------- */

type VerseFinalize = { osisId: string; text: string };

async function main(): Promise<void> {
    const fileArg = process.argv[2];
    if (!fileArg) fatal("missing xml file path. Example: bun apps/api/scripts/import-osis.ts ./resources/kjv.xml");

    const xmlPath = path.resolve(process.cwd(), fileArg);
    if (!fs.existsSync(xmlPath)) fatal("file not found:", xmlPath);

    if (!Number.isFinite(BATCH_SIZE) || BATCH_SIZE < 500) {
        fatal("BP_IMPORT_BATCH_SIZE must be >= 500. got:", BATCH_SIZE);
    }

    const { sqlite, dbPath, close } = openDb();
    const s = sqlite as unknown as SqliteLike;

    ensureSchemaPresent(s);
    ensureBooksSeeded(s);

    upsertTranslation(s);

    s.exec("BEGIN;");
    try {
        maybeClearText(s);
        maybeClearSpine(s);

        s.exec("COMMIT;");
    } catch (e) {
        s.exec("ROLLBACK;");
        close();
        throw e;
    }

    log("dbPath:", dbPath);
    log("translationId:", TRANSLATION_ID);
    log("batchSize:", BATCH_SIZE);
    log("logEvery:", LOG_EVERY);
    log("fts table present:", !!s.query(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='bp_verse_text_fts' LIMIT 1;`).get());

    // Prepared statements
    const stmtBookOrd = s.query(`SELECT ordinal AS ord FROM bp_book WHERE book_id = ? LIMIT 1;`);

    const stmtUpsertVerse = s.query(
        `INSERT INTO bp_verse(verse_key, book_id, chapter, verse, verse_ord, chapter_ord, is_superscription, is_deuterocanon)
         VALUES (?, ?, ?, ?, ?, NULL, 0, 0)
             ON CONFLICT(verse_key) DO UPDATE SET
            book_id=excluded.book_id,
                                           chapter=excluded.chapter,
                                           verse=excluded.verse,
                                           verse_ord=excluded.verse_ord;`,
    );

    const stmtUpsertVerseText = s.query(
        `INSERT INTO bp_verse_text(translation_id, verse_key, text, text_norm, hash, updated_at)
     VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(translation_id, verse_key) DO UPDATE SET
       text=excluded.text,
       text_norm=excluded.text_norm,
       hash=excluded.hash,
       updated_at=excluded.updated_at;`,
    );

    // Ordinal state
    let verseOrd = 0;

    // If spine exists and we're not clearing it, continue after max to avoid collisions.
    if (!CLEAR_SPINE) {
        const row = s.query(`SELECT MAX(verse_ord) AS mx FROM bp_verse;`).get() as { mx?: number } | undefined;
        verseOrd = Number(row?.mx ?? 0);
        if (!Number.isFinite(verseOrd)) verseOrd = 0;
    }

    // Transaction batching
    let inTx = false;
    let pending = 0;

    const beginTx = () => {
        if (inTx) return;
        s.exec("BEGIN;");
        inTx = true;
    };

    const commitTx = () => {
        if (!inTx) return;
        s.exec("COMMIT;");
        inTx = false;
        pending = 0;
    };

    const rollbackTx = () => {
        if (!inTx) return;
        try {
            s.exec("ROLLBACK;");
        } catch {}
        inTx = false;
        pending = 0;
    };

    const flushMaybe = () => {
        if (pending >= BATCH_SIZE) commitTx();
    };

    // IMPORTANT: xmlns=false so attributes are plain strings for OSIS default namespace docs.
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

        // Ensure bp_book exists (seed should have done it)
        const bOrd = getBookOrdinal(bpBookId);
        if (bOrd == null) {
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

        // If we cleared spine, verseOrd starts at 0; otherwise continues.
        // This is deterministic *per import run* (OSIS order).
        verseOrd += 1;

        stmtUpsertVerse.run(verseKey, bpBookId, ref.chap, ref.verse, verseOrd);

        const textNorm = normalizeForSearch(text);
        const hash = sha256Hex(text);

        stmtUpsertVerseText.run(TRANSLATION_ID, verseKey, text, textNorm, hash);

        inserted += 1;
        pending += 1;

        if (LOG_EVERY > 0 && inserted % LOG_EVERY === 0) {
            log("progress:", inserted, "verses…");
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

    parser.on("error", (e) => {
        throw e;
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

        // milestone end: <verse eID="Gen.1.1"/>
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

        // If a new verse begins while collecting, finalize previous.
        if (collecting && currentVerseId) {
            finalizeVerse({ osisId: currentVerseId, text: buf });
        }

        collecting = true;
        currentVerseId = startId;
        buf = "";
        ignoreNoteDepth = 0;

        // close-tag style <verse osisID="...">...</verse>
        endOnCloseTag = typeof osisID === "string" && osisID.length > 0;
        // milestone style <verse sID="..."/> ... <verse eID="..."/>
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
            stream.on("data", (chunk) => {
                try {
                    parser.write(chunk);
                } catch (e) {
                    reject(e);
                }
            });
            stream.on("end", () => {
                try {
                    parser.close();
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
            stream.on("error", reject);
        });

        // finalize trailing verse if needed
        if (collecting && currentVerseId) {
            finalizeVerse({ osisId: currentVerseId, text: buf });
            resetVerseState();
        }

        commitTx();

        // Build bp_chapter (optional but recommended)
        s.exec("BEGIN;");
        try {
            rebuildChapters(s);
            s.exec("COMMIT;");
        } catch (e) {
            s.exec("ROLLBACK;");
            throw e;
        }

        log("done.");
        log("verseStartsSeen:", verseStartsSeen);
        log("inserted:", inserted, "skipped:", skipped);
        log("max verse_ord now:", verseOrd);

        if (verseStartsSeen === 0) {
            warn("No <verse> tags detected. Paste ~40 lines around a verse and I’ll adapt the parser.");
        }
        if (unknownBooks.size > 0) {
            warn("unknown OSIS book ids encountered:", Array.from(unknownBooks).sort().join(", "));
            warn("If these are legit, add mappings in OSIS_TO_BP.");
        }
    } catch (err) {
        rollbackTx();
        fatal(err);
    } finally {
        close();
    }
}

main().catch((e) => fatal(e));