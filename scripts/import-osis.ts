// apps/api/scripts/import-osis.ts
//
// Biblia Populi — OSIS XML importer (production)
//
// Imports an OSIS Bible XML (e.g. KJV OSIS) into SQLite for reading.
//
// Writes:
// - translation / translation_revision / translation_default_revision
// - verse_text
// - (optional) verse (address space + verseOrdinal)
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
//   BP_IMPORT_CANON_ID                 default: protestant_66
//   BP_IMPORT_TRANSLATION_ID           default: kjv
//   BP_IMPORT_TRANSLATION_NAME         default: King James Version
//   BP_IMPORT_LANGUAGE                 default: en
//   BP_IMPORT_REV_LABEL                default: osis_import
//   BP_IMPORT_PURPOSE                  default: reading
//   BP_IMPORT_RESET_REVISION           "1" -> always creates a new revision and sets defaults
//   BP_IMPORT_CLEAR_REVISION           "1" -> deletes verse_text rows for this revision+canon before import
//   BP_IMPORT_SKIP_VERSE_TABLE         "1" -> do not touch `verse` table
//   BP_IMPORT_FORCE_VERSE_TABLE        "1" -> write verse ordinals even if verse table already has rows for canon
//   BP_IMPORT_BATCH_SIZE               default: 5000 (commit interval)
//   BP_IMPORT_LOG_EVERY                default: 2500
//
// Notes:
// - This assumes your schema exists. Run: bun --cwd apps/api run db:migrate
//
// cspell:ignore osis saxes bunx

import * as fs from "node:fs";
import * as path from "node:path";
import crypto from "node:crypto";
import { SaxesParser } from "saxes";
import {openDb} from "../apps/api/src/db/client";



/* -------------------------------- Config ---------------------------------- */

const CANON_ID = (process.env.BP_IMPORT_CANON_ID ?? "protestant_66").trim();

const TRANSLATION_ID = (process.env.BP_IMPORT_TRANSLATION_ID ?? "kjv").trim();
const TRANSLATION_NAME = (process.env.BP_IMPORT_TRANSLATION_NAME ?? "King James Version").trim();
const LANGUAGE = (process.env.BP_IMPORT_LANGUAGE ?? "en").trim();

const REV_LABEL_BASE = (process.env.BP_IMPORT_REV_LABEL ?? "osis_import").trim();
const PURPOSE = (process.env.BP_IMPORT_PURPOSE ?? "reading").trim(); // "reading"|"editing" (we set both)

const RESET_REVISION = (process.env.BP_IMPORT_RESET_REVISION ?? "").trim() === "1";
const CLEAR_REVISION = (process.env.BP_IMPORT_CLEAR_REVISION ?? "").trim() === "1";

const SKIP_VERSE_TABLE = (process.env.BP_IMPORT_SKIP_VERSE_TABLE ?? "").trim() === "1";
const FORCE_VERSE_TABLE = (process.env.BP_IMPORT_FORCE_VERSE_TABLE ?? "").trim() === "1";

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
    throw new Error("unreachable");
}

function nowLabelSuffix(): string {
    // stable-ish label suffix
    const d = new Date();
    const yyyy = String(d.getUTCFullYear());
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mi = String(d.getUTCMinutes()).padStart(2, "0");
    return `${yyyy}${mm}${dd}_${hh}${mi}Z`;
}

function normalizeText(s: string): string {
    // collapse whitespace, preserve punctuation
    return s.replace(/\s+/g, " ").trim();
}

function isFinitePosInt(n: number): boolean {
    return Number.isFinite(n) && n > 0 && Math.floor(n) === n;
}

/* -------------------------- OSIS → BP book mapping -------------------------- */
/**
 * Your canon uses codes like: GEN, EXO, ... PSA, ... NAM, ...
 * OSIS commonly uses: Gen, Exod, ... Ps, Nah, Matt, 1Sam, etc.
 */
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
    joel: "JOL", // your seed uses JOL
    amos: "AMO",
    obad: "OBA",
    jonah: "JON",
    mic: "MIC",
    nah: "NAM", // your seed uses NAM
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

function parseOsisRef(ref: string): { osisBook: string; chap: number; verse: number } | null {
    // Examples: "Gen.1.1", "Ps.23.1", "1Sam.3.1"
    const parts = ref.split(".");
    if (parts.length < 3) return null;
    const osisBook = parts[0]!.trim();
    const chap = Number(parts[1]);
    const verse = Number(parts[2]);
    if (!isFinitePosInt(chap) || !isFinitePosInt(verse)) return null;
    return { osisBook, chap, verse };
}

/* ------------------------------ DB glue types ------------------------------ */

type SqliteStmt = {
    run: (...params: any[]) => any;
    get: (...params: any[]) => any;
};

type SqliteLike = {
    query: (sql: string) => SqliteStmt;
    // bun:sqlite Database also has .exec, but typings may mark it deprecated;
    // we call it via `any` only for multi-statement blobs.
};

function unsafeExecMulti(sqlite: unknown, sqlText: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sqlite as any).exec(sqlText);
}

/* ------------------------------ DB helpers --------------------------------- */

function ensureSchemaPresent(sqlite: SqliteLike): void {
    const mustHave = [
        "canon_book",
        "translation",
        "translation_revision",
        "translation_default_revision",
        "verse_text",
    ];
    for (const t of mustHave) {
        const ok = sqlite
            .query(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1;`)
            .get(t);
        if (!ok) fatal(`missing table "${t}". Run: bun --cwd apps/api run db:migrate`);
    }
}

function ensureCanonPresent(sqlite: SqliteLike): void {
    const row = sqlite
        .query(`SELECT 1 as ok FROM canon_book WHERE canon_id = ? LIMIT 1;`)
        .get(CANON_ID) as { ok?: number } | undefined;

    if (!row?.ok) {
        warn(`canon_book has no rows for canon_id="${CANON_ID}". You probably need to seed canon_book first.`);
    }
}

function upsertTranslation(sqlite: SqliteLike): void {
    sqlite
        .query(
            `INSERT INTO translation(translation_id, name, language, description, created_at)
       VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(translation_id) DO UPDATE SET
         name=excluded.name,
         language=excluded.language;`,
        )
        .run(TRANSLATION_ID, TRANSLATION_NAME, LANGUAGE, "Imported from OSIS XML.");
}

function getExistingDefaultRevision(sqlite: SqliteLike): string | null {
    const row = sqlite
        .query(
            `SELECT translation_revision_id as revId
       FROM translation_default_revision
       WHERE translation_id = ? AND canon_id = ? AND purpose = 'reading'
       LIMIT 1;`,
        )
        .get(TRANSLATION_ID, CANON_ID) as { revId?: string } | undefined;
    return row?.revId ?? null;
}

function createRevision(sqlite: SqliteLike): string {
    const revId = crypto.randomUUID();
    const label = `${REV_LABEL_BASE}_${nowLabelSuffix()}`;

    sqlite
        .query(
            `INSERT INTO translation_revision(
         translation_revision_id, translation_id, label, status, based_on_revision_id, created_at, published_at
       ) VALUES (
         ?, ?, ?, 'published', NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ','now'),
         strftime('%Y-%m-%dT%H:%M:%fZ','now')
       );`,
        )
        .run(revId, TRANSLATION_ID, label);

    // set defaults for reading + editing
    sqlite
        .query(
            `INSERT INTO translation_default_revision(
         translation_id, canon_id, purpose, translation_revision_id, updated_at
       ) VALUES
         (?, ?, 'reading', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
         (?, ?, 'editing', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(translation_id, canon_id, purpose)
       DO UPDATE SET
         translation_revision_id = excluded.translation_revision_id,
         updated_at = excluded.updated_at;`,
        )
        .run(TRANSLATION_ID, CANON_ID, revId, TRANSLATION_ID, CANON_ID, revId);

    return revId;
}

function maybeClearRevision(sqlite: SqliteLike, revId: string): void {
    if (!CLEAR_REVISION) return;
    log("clearing verse_text for revision+canon…");
    sqlite
        .query(`DELETE FROM verse_text WHERE translation_revision_id = ? AND canon_id = ?;`)
        .run(revId, CANON_ID);
}

function shouldWriteVerseTable(sqlite: SqliteLike): boolean {
    if (SKIP_VERSE_TABLE) return false;

    const row = sqlite
        .query(`SELECT COUNT(1) as n FROM verse WHERE canon_id = ?;`)
        .get(CANON_ID) as { n?: number } | undefined;

    const n = Number(row?.n ?? 0);
    if (n === 0) return true;
    return FORCE_VERSE_TABLE;
}

/* -------------------------------- Importer -------------------------------- */

type VerseFinalize = {
    osisId: string;
    text: string;
};

async function main(): Promise<void> {
    const fileArg = process.argv[2];
    if (!fileArg) {
        fatal("missing xml file path. Example: bun apps/api/scripts/import-osis.ts ./resources/kjv.xml");
    }

    const xmlPath = path.resolve(process.cwd(), fileArg);
    if (!fs.existsSync(xmlPath)) fatal("file not found:", xmlPath);

    if (!Number.isFinite(BATCH_SIZE) || BATCH_SIZE < 500) {
        fatal("BP_IMPORT_BATCH_SIZE must be >= 500. got:", BATCH_SIZE);
    }

    const { sqlite, dbPath } = openDb();
    const s = sqlite as unknown as SqliteLike;

    ensureSchemaPresent(s);
    ensureCanonPresent(s);

    upsertTranslation(s);

    const existing = getExistingDefaultRevision(s);
    const revId = RESET_REVISION || !existing ? createRevision(s) : existing;

    if (!RESET_REVISION && existing) {
        log("using existing active revision:", revId);
    } else {
        log("created new revision:", revId);
    }

    maybeClearRevision(s, revId);

    const writeVerseTable = shouldWriteVerseTable(s);
    log("dbPath:", dbPath);
    log("canonId:", CANON_ID);
    log("translationId:", TRANSLATION_ID);
    log("revisionId:", revId);
    log("writeVerseTable:", writeVerseTable);

    // Prepared statements (fast)
    const stmtUpsertVerseText = s.query(
        `INSERT INTO verse_text(
        translation_revision_id, canon_id, book_id, chapter, verse, text, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(translation_revision_id, canon_id, book_id, chapter, verse)
     DO UPDATE SET text=excluded.text, updated_at=excluded.updated_at;`,
    );

    const stmtUpsertVerseAddr = s.query(
        `INSERT INTO verse(
        canon_id, book_id, chapter, verse, verse_ordinal
     ) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(canon_id, book_id, chapter, verse)
     DO UPDATE SET verse_ordinal=excluded.verse_ordinal;`,
    );

    // For stable continuation if verse table already exists but FORCE_VERSE_TABLE=1
    // we resume from current max ordinal (prevents duplicates in the ordinal sequence).
    let verseOrdinal = 0;
    if (writeVerseTable) {
        const row = s
            .query(`SELECT MAX(verse_ordinal) as mx FROM verse WHERE canon_id = ?;`)
            .get(CANON_ID) as { mx?: number } | undefined;
        verseOrdinal = Number(row?.mx ?? 0);
    }

    // Chunked transaction state
    let inTx = false;
    let pending = 0;

    function beginTx(): void {
        if (inTx) return;
        s.query("BEGIN").run();
        inTx = true;
    }

    function commitTx(): void {
        if (!inTx) return;
        s.query("COMMIT").run();
        inTx = false;
        pending = 0;
    }

    function rollbackTx(): void {
        if (!inTx) return;
        try {
            s.query("ROLLBACK").run();
        } catch {
            // ignore rollback failures
        }
        inTx = false;
        pending = 0;
    }

    function flushMaybe(): void {
        if (pending >= BATCH_SIZE) commitTx();
    }

    // OSIS parsing state
    const parser = new SaxesParser({ xmlns: true });

    let currentDivBookOsis: string | null = null;
    let currentDivBookBp: string | null = null;

    let collecting = false;

    // Verse identity and termination mode
    let currentVerseId: string | null = null; // "Gen.1.1"
    let endOnCloseTag = false; // <verse osisID="..."> ... </verse>
    let endOnEidMilestone = false; // <verse sID="..."/> ... <verse eID="..."/>

    let buf = "";

    // ignore note text while collecting
    let ignoreDepth = 0;

    // counts
    let inserted = 0;
    let skipped = 0;
    let unknownBooks = new Set<string>();

    function finalizeVerse(v: VerseFinalize): void {
        const ref = parseOsisRef(v.osisId);
        if (!ref) {
            skipped += 1;
            return;
        }
        const bpBook = mapBookId(ref.osisBook);
        if (!bpBook) {
            unknownBooks.add(ref.osisBook);
            skipped += 1;
            return;
        }

        // If the OSIS file uses <div type="book" osisID="Gen">, it should match.
        // But don’t hard-fail; just warn if mismatch.
        if (currentDivBookBp && currentDivBookBp !== bpBook) {
            // This happens in some OSIS where osisID differs between div/book and verse (rare).
            // Keep going; verse ref is authoritative.
            // eslint-disable-next-line no-console
            // (We keep it as warn rather than spam.)
        }

        const text = normalizeText(v.text);
        if (!text) {
            skipped += 1;
            return;
        }

        beginTx();

        stmtUpsertVerseText.run(revId, CANON_ID, bpBook, ref.chap, ref.verse, text);

        if (writeVerseTable) {
            verseOrdinal += 1;
            stmtUpsertVerseAddr.run(CANON_ID, bpBook, ref.chap, ref.verse, verseOrdinal);
        }

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
        ignoreDepth = 0;
    }

    parser.on("error", (e) => {
        throw e;
    });

    parser.on("opentag", (tag) => {
        const local = tag.local; // namespace-safe
        if (!local) return;

        // Track book div (optional)
        if (local === "div") {
            const typeAttr = tag.attributes["type"];
            const type = typeof typeAttr === "string" ? typeAttr : "";

            if (type === "book") {
                const osisAttr = tag.attributes["osisID"];
                const osisID = typeof osisAttr === "string" ? osisAttr : "";
                currentDivBookOsis = osisID || null;
                currentDivBookBp = osisID ? mapBookId(osisID) : null;

                if (currentDivBookOsis && !currentDivBookBp) unknownBooks.add(currentDivBookOsis);
                if (currentDivBookOsis) log("book:", currentDivBookOsis, "->", currentDivBookBp ?? "(unknown)");
            }
            return;
        }

        // Notes should be ignored inside verses
        if (collecting && local === "note") {
            ignoreDepth += 1;
            return;
        }

        if (local !== "verse") return;

        const osisIDAttr = tag.attributes["osisID"];
        const sIDAttr = tag.attributes["sID"];
        const eIDAttr = tag.attributes["eID"];

        const osisID = typeof osisIDAttr === "string" ? osisIDAttr : null;
        const sID = typeof sIDAttr === "string" ? sIDAttr : null;
        const eID = typeof eIDAttr === "string" ? eIDAttr : null;

        // End milestone (<verse eID="..."/>)
        if (eID) {
            if (collecting && endOnEidMilestone && currentVerseId === eID) {
                finalizeVerse({ osisId: eID, text: buf });
                resetVerseState();
            }
            return;
        }

        // Start verse (either osisID full element or sID milestone)
        const startId = osisID ?? sID;
        if (!startId) return;

        // If we somehow encounter a new verse start while still collecting, finalize previous.
        if (collecting && currentVerseId) {
            finalizeVerse({ osisId: currentVerseId, text: buf });
        }

        collecting = true;
        currentVerseId = startId;
        buf = "";
        ignoreDepth = 0;

        endOnCloseTag = !!osisID;
        endOnEidMilestone = !!sID && !osisID;
    });

    parser.on("text", (txt) => {
        if (!collecting) return;
        if (ignoreDepth > 0) return;
        buf += txt;
    });

    parser.on("cdata", (txt) => {
        if (!collecting) return;
        if (ignoreDepth > 0) return;
        buf += txt;
    });

    parser.on("closetag", (nameOrObj) => {
        // saxes can hand us a string local name in closetag even with xmlns
        const local = typeof nameOrObj === "string" ? nameOrObj : String(nameOrObj);

        if (collecting && local === "note" && ignoreDepth > 0) {
            ignoreDepth -= 1;
            return;
        }

        if (local === "verse") {
            if (collecting && endOnCloseTag && currentVerseId) {
                finalizeVerse({ osisId: currentVerseId, text: buf });
                resetVerseState();
            }
            return;
        }

        if (local === "div") {
            // end of book div (best effort)
            currentDivBookOsis = null;
            currentDivBookBp = null;
            return;
        }
    });

    // Start streaming parse
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

        // If file ends while still collecting (rare), finalize last verse.
        if (collecting && currentVerseId) {
            finalizeVerse({ osisId: currentVerseId, text: buf });
            resetVerseState();
        }

        // Commit any remaining batch
        commitTx();

        log("done.");
        log("inserted:", inserted, "skipped:", skipped);
        if (unknownBooks.size > 0) {
            warn("unknown OSIS book ids encountered:", Array.from(unknownBooks).sort().join(", "));
            warn("If these are legit, add mappings in OSIS_TO_BP.");
        }
    } catch (err) {
        rollbackTx();
        fatal(err);
    }
}

main().catch((e) => fatal(e));