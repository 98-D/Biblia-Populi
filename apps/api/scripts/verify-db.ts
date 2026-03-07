// apps/api/scripts/verify-db.ts
//
// Biblia.to — hardened Bun-only DB verification / sanity check
//
// Prints:
// - bp_book count
// - bp_verse count + min/max verse_ord
// - bp_chapter count (if present)
// - bp_translation count + default translation
// - bp_verse_text count for active translation_id
// - FTS presence + row count (bp_verse_text_fts)
// - optional import history summary if present
//
// Usage:
//   bun --cwd apps/api run db:verify
//   bun --cwd apps/api run db:build
//
// Env:
//   BP_TRANSLATION_ID=KJV
//   BP_VERIFY_STRICT=1                fail on warnings that indicate broken/incomplete DB
//   BP_VERIFY_SAMPLE_VERSE=GEN.1.1    default sample verse
//
// Notes:
// - exits non-zero for missing required schema
// - optionally exits non-zero in strict mode when content sanity checks fail
// - uses only Bun runtime + your existing openDb()

import * as process from "node:process";
import { openDb } from "../src/db/client";

type SqliteScalar = string | number | bigint | Uint8Array | Buffer | null;

type SqliteStmt = {
    get: (...params: SqliteScalar[]) => unknown;
};

type SqliteLike = {
    query: (sql: string) => SqliteStmt;
    exec?: (sql: string) => void;
};

type DefaultTranslationRow = {
    id?: string;
    name?: string;
};

type VerseOrdBoundsRow = {
    mn?: number | string | bigint | null;
    mx?: number | string | bigint | null;
};

type SampleRow = {
    verseKey?: string;
    text?: string;
};

type ImportHistorySummaryRow = {
    total_runs?: number | string | bigint | null;
    successful_runs?: number | string | bigint | null;
    failed_runs?: number | string | bigint | null;
};

type LastImportRow = {
    translation_id?: string;
    source_path?: string;
    source_hash?: string;
    importer_version?: string;
    status?: string;
    verse_count?: number | string | bigint | null;
    started_at?: string;
    completed_at?: string | null;
};

function log(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.log("[db:verify]", ...args);
}

function warn(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.warn("[db:verify]", ...args);
}

function fatal(...args: unknown[]): never {
    // eslint-disable-next-line no-console
    console.error("[db:verify]", ...args);
    process.exit(1);
}

function envStr(name: string, fallback = ""): string {
    const raw = process.env[name];
    if (typeof raw !== "string") return fallback;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : fallback;
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

function asNum(v: unknown): number {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    if (typeof v === "bigint") return Number(v);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function asStr(v: unknown): string | null {
    return typeof v === "string" && v.length > 0 ? v : null;
}

function getScalar(sqlite: SqliteLike, sql: string, params: SqliteScalar[] = []): unknown {
    const row = sqlite.query(sql).get(...params) as Record<string, unknown> | undefined;
    if (!row) return null;
    const firstKey = Object.keys(row)[0];
    return firstKey ? row[firstKey] : null;
}

function getCount(sqlite: SqliteLike, table: string): number {
    return asNum(getScalar(sqlite, `SELECT COUNT(*) AS c FROM ${table};`));
}

function hasTable(sqlite: SqliteLike, name: string): boolean {
    const row = sqlite
         .query(`SELECT 1 AS one FROM sqlite_master WHERE type='table' AND name=? LIMIT 1;`)
         .get(name) as { one?: number } | undefined;

    return row != null;
}

function resolveTranslationId(sqlite: SqliteLike): string | null {
    const envId = envStr("BP_TRANSLATION_ID", "");
    if (envId) return envId;

    const row = sqlite
         .query(`SELECT translation_id AS id FROM bp_translation WHERE is_default = 1 LIMIT 1;`)
         .get() as { id?: string } | undefined;

    return row?.id ?? null;
}

function getVerseOrdBounds(sqlite: SqliteLike): { min: number; max: number } {
    const row = sqlite
         .query(`SELECT MIN(verse_ord) AS mn, MAX(verse_ord) AS mx FROM bp_verse;`)
         .get() as VerseOrdBoundsRow | undefined;

    return {
        min: asNum(row?.mn),
        max: asNum(row?.mx),
    };
}

function getDefaultTranslation(sqlite: SqliteLike): { id: string; name: string } | null {
    const row = sqlite
         .query(`SELECT translation_id AS id, name AS name FROM bp_translation WHERE is_default = 1 LIMIT 1;`)
         .get() as DefaultTranslationRow | undefined;

    const id = asStr(row?.id);
    if (!id) return null;

    return {
        id,
        name: asStr(row?.name) ?? id,
    };
}

function getVerseTextCount(sqlite: SqliteLike, translationId: string): number {
    return asNum(
         getScalar(
              sqlite,
              `SELECT COUNT(*) AS c FROM bp_verse_text WHERE translation_id = ?;`,
              [translationId],
         ),
    );
}

function getDistinctVerseTextKeys(sqlite: SqliteLike, translationId: string): number {
    return asNum(
         getScalar(
              sqlite,
              `SELECT COUNT(DISTINCT verse_key) AS c FROM bp_verse_text WHERE translation_id = ?;`,
              [translationId],
         ),
    );
}

function getFtsCount(sqlite: SqliteLike): number {
    return asNum(getScalar(sqlite, `SELECT COUNT(*) AS c FROM bp_verse_text_fts;`));
}

function getSample(
     sqlite: SqliteLike,
     translationId: string,
     verseKey: string,
): { verseKey: string; text: string } | null {
    const row = sqlite
         .query(
              `
            SELECT t.verse_key AS verseKey, t.text AS text
            FROM bp_verse_text t
            WHERE t.translation_id = ? AND t.verse_key = ?
            LIMIT 1;
            `,
         )
         .get(translationId, verseKey) as SampleRow | undefined;

    const key = asStr(row?.verseKey);
    const text = asStr(row?.text);

    if (!key || !text) return null;
    return { verseKey: key, text };
}

function fmtSample(text: string, n = 90): string {
    const s = text.replace(/\s+/g, " ").trim();
    return s.length > n ? `${s.slice(0, n)}…` : s;
}

function getImportHistorySummary(sqlite: SqliteLike): ImportHistorySummaryRow | null {
    if (!hasTable(sqlite, "bp_import_history")) return null;

    const row = sqlite
         .query(
              `
            SELECT
                COUNT(*) AS total_runs,
                SUM(CASE WHEN status = 'SUCCEEDED' THEN 1 ELSE 0 END) AS successful_runs,
                SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed_runs
            FROM bp_import_history;
            `,
         )
         .get() as ImportHistorySummaryRow | undefined;

    return row ?? null;
}

function getLastImport(sqlite: SqliteLike): LastImportRow | null {
    if (!hasTable(sqlite, "bp_import_history")) return null;

    const row = sqlite
         .query(
              `
            SELECT
                translation_id,
                source_path,
                source_hash,
                importer_version,
                status,
                verse_count,
                started_at,
                completed_at
            FROM bp_import_history
            ORDER BY import_id DESC
            LIMIT 1;
            `,
         )
         .get() as LastImportRow | undefined;

    return row ?? null;
}

function getMissingVerseTextCount(sqlite: SqliteLike, translationId: string): number {
    return asNum(
         getScalar(
              sqlite,
              `
            SELECT COUNT(*) AS c
            FROM bp_verse v
            LEFT JOIN bp_verse_text t
              ON t.verse_key = v.verse_key
             AND t.translation_id = ?
            WHERE t.verse_key IS NULL;
            `,
              [translationId],
         ),
    );
}

function getOrphanVerseTextCount(sqlite: SqliteLike, translationId: string): number {
    return asNum(
         getScalar(
              sqlite,
              `
            SELECT COUNT(*) AS c
            FROM bp_verse_text t
            LEFT JOIN bp_verse v
              ON v.verse_key = t.verse_key
            WHERE t.translation_id = ?
              AND v.verse_key IS NULL;
            `,
              [translationId],
         ),
    );
}

function getChapterIntegritySummary(
     sqlite: SqliteLike,
): { chapterCount: number; badRanges: number } {
    if (!hasTable(sqlite, "bp_chapter")) {
        return { chapterCount: 0, badRanges: 0 };
    }

    const chapterCount = getCount(sqlite, "bp_chapter");

    const badRanges = asNum(
         getScalar(
              sqlite,
              `
            SELECT COUNT(*) AS c
            FROM bp_chapter
            WHERE start_verse_ord IS NULL
               OR end_verse_ord IS NULL
               OR verse_count IS NULL
               OR start_verse_ord <= 0
               OR end_verse_ord < start_verse_ord
               OR verse_count <= 0;
            `,
         ),
    );

    return { chapterCount, badRanges };
}

function percentage(numerator: number, denominator: number): string {
    const base = Math.max(1, denominator);
    const pct = Math.round((numerator / base) * 10000) / 100;
    return `${pct}%`;
}

function assertRequiredTables(sqlite: SqliteLike): void {
    const required = ["bp_book", "bp_translation", "bp_verse", "bp_verse_text"];
    for (const tableName of required) {
        if (!hasTable(sqlite, tableName)) {
            fatal(`missing table "${tableName}". Run db:migrate first.`);
        }
    }
}

async function main(): Promise<void> {
    const strict = envBool("BP_VERIFY_STRICT", false);
    const sampleVerseKey = envStr("BP_VERIFY_SAMPLE_VERSE", "GEN.1.1");

    const { sqlite, dbPath, close } = openDb();
    const s = sqlite as unknown as SqliteLike;

    const warnings: string[] = [];
    const strictFailures: string[] = [];

    try {
        log("dbPath:", dbPath);

        assertRequiredTables(s);

        const bookCount = getCount(s, "bp_book");
        const verseCount = getCount(s, "bp_verse");
        const bounds = getVerseOrdBounds(s);
        const translationCount = getCount(s, "bp_translation");

        const chapterSummary = getChapterIntegritySummary(s);
        const chapterCount = chapterSummary.chapterCount;

        const defaultTranslation = getDefaultTranslation(s);
        const translationId = resolveTranslationId(s);

        const ftsPresent = hasTable(s, "bp_verse_text_fts");
        const ftsCount = ftsPresent ? getFtsCount(s) : 0;

        log("bp_book:", bookCount);
        log("bp_verse:", verseCount, `(verse_ord min=${bounds.min} max=${bounds.max})`);
        log("bp_chapter:", chapterCount);
        log("bp_translation:", translationCount);
        log(
             "default translation:",
             defaultTranslation ? `${defaultTranslation.id} (${defaultTranslation.name})` : "none",
        );

        if (chapterSummary.badRanges > 0) {
            warnings.push(`bp_chapter has ${chapterSummary.badRanges} invalid range row(s)`);
        }

        if (!translationId) {
            log("active translationId: none (set BP_TRANSLATION_ID or set bp_translation.is_default=1)");
            log("bp_verse_text: skipped");

            warnings.push("no active translationId resolved");
            if (strict) {
                strictFailures.push("no active translationId resolved");
            }
        } else {
            const textCount = getVerseTextCount(s, translationId);
            const distinctVerseKeys = getDistinctVerseTextKeys(s, translationId);
            const missingVerseTextCount = verseCount > 0 ? getMissingVerseTextCount(s, translationId) : 0;
            const orphanVerseTextCount = getOrphanVerseTextCount(s, translationId);

            log("active translationId:", translationId);
            log("bp_verse_text:", textCount, `(translation_id=${translationId})`);
            log("bp_verse_text distinct verse_key:", distinctVerseKeys);

            const sample = getSample(s, translationId, sampleVerseKey);
            if (sample) {
                log("sample:", sample.verseKey, "=>", fmtSample(sample.text));
            } else {
                log("sample:", `${sampleVerseKey} not found for this translation_id`);
            }

            if (verseCount > 0) {
                log("coverage:", `${percentage(textCount, verseCount)} (bp_verse_text / bp_verse)`);
                log("missing verse_text rows:", missingVerseTextCount);
            }

            if (orphanVerseTextCount > 0) {
                log("orphan verse_text rows:", orphanVerseTextCount);
            }

            if (textCount === 0) {
                warnings.push(`bp_verse_text is empty for translation ${translationId}`);
                if (strict) {
                    strictFailures.push(`bp_verse_text is empty for translation ${translationId}`);
                }
            }

            if (verseCount > 0 && missingVerseTextCount > 0) {
                warnings.push(`${missingVerseTextCount} bp_verse row(s) missing bp_verse_text for ${translationId}`);
                if (strict) {
                    strictFailures.push(`${missingVerseTextCount} bp_verse row(s) missing bp_verse_text for ${translationId}`);
                }
            }

            if (orphanVerseTextCount > 0) {
                warnings.push(`${orphanVerseTextCount} orphan bp_verse_text row(s) for ${translationId}`);
                if (strict) {
                    strictFailures.push(`${orphanVerseTextCount} orphan bp_verse_text row(s) for ${translationId}`);
                }
            }

            if (!sample) {
                warnings.push(`sample verse ${sampleVerseKey} not found for translation ${translationId}`);
            }
        }

        log("FTS (bp_verse_text_fts):", ftsPresent ? `present (${ftsCount} rows)` : "missing");

        const importSummary = getImportHistorySummary(s);
        if (importSummary) {
            log(
                 "import history:",
                 `total=${asNum(importSummary.total_runs)}`,
                 `succeeded=${asNum(importSummary.successful_runs)}`,
                 `failed=${asNum(importSummary.failed_runs)}`,
            );

            const lastImport = getLastImport(s);
            if (lastImport) {
                log(
                     "last import:",
                     [
                         `status=${asStr(lastImport.status) ?? "unknown"}`,
                         `translation=${asStr(lastImport.translation_id) ?? "unknown"}`,
                         `verse_count=${asNum(lastImport.verse_count)}`,
                         `importer=${asStr(lastImport.importer_version) ?? "unknown"}`,
                     ].join(" "),
                );

                if (asStr(lastImport.source_path)) {
                    log("last import source:", lastImport.source_path);
                }
                if (asStr(lastImport.started_at)) {
                    log("last import started:", lastImport.started_at);
                }
                if (asStr(lastImport.completed_at)) {
                    log("last import completed:", lastImport.completed_at);
                }
            }
        }

        if (bookCount !== 66) {
            warnings.push(`expected 66 bp_book rows, found ${bookCount}`);
            if (strict) {
                strictFailures.push(`expected 66 bp_book rows, found ${bookCount}`);
            }
        }

        if (verseCount === 0) {
            warnings.push("bp_verse is empty");
            if (strict) {
                strictFailures.push("bp_verse is empty");
            }
        }

        if (verseCount > 0) {
            if (bounds.min <= 0) {
                warnings.push(`bp_verse min verse_ord should be > 0, found ${bounds.min}`);
                if (strict) {
                    strictFailures.push(`bp_verse min verse_ord should be > 0, found ${bounds.min}`);
                }
            }

            if (bounds.max < bounds.min) {
                warnings.push(`bp_verse max verse_ord < min verse_ord (${bounds.max} < ${bounds.min})`);
                if (strict) {
                    strictFailures.push(`bp_verse max verse_ord < min verse_ord (${bounds.max} < ${bounds.min})`);
                }
            }
        }

        if (!defaultTranslation && !envStr("BP_TRANSLATION_ID", "")) {
            warnings.push("no default translation and BP_TRANSLATION_ID not set");
            if (strict) {
                strictFailures.push("no default translation and BP_TRANSLATION_ID not set");
            }
        }

        if (!ftsPresent) {
            warnings.push("FTS table missing; search may not use FTS mode");
        }

        for (const message of warnings) {
            warn(message);
        }

        if (strictFailures.length > 0) {
            fatal("strict verification failed:", strictFailures.join(" | "));
        }

        log("ok.");
    } finally {
        close();
    }
}

void main().catch((error: unknown) => {
    fatal(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
});