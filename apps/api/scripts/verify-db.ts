// apps/api/scripts/verify-db.ts
//
// Bun-only DB sanity check + counts.
//
// Prints:
// - bp_book count
// - bp_verse count + min/max verse_ord
// - bp_chapter count
// - bp_translation count + default translation
// - bp_verse_text count for active translation_id
// - FTS presence + row count (bp_verse_text_fts)
//
// Usage:
//   bun --cwd apps/api run db:verify
//   bun --cwd apps/api run db:build

import { openDb } from "../src/db/client";

function log(...args: unknown[]) {
    // eslint-disable-next-line no-console
    console.log("[db:verify]", ...args);
}

function fatal(...args: unknown[]): never {
    // eslint-disable-next-line no-console
    console.error("[db:verify]", ...args);
    process.exit(1);
}

type SqliteStmt = {
    get: (...params: any[]) => unknown;
};

type SqliteLike = {
    query: (sql: string) => SqliteStmt;
};

function asNum(v: unknown): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
}

function getScalar(sqlite: SqliteLike, sql: string, params: any[] = []): unknown {
    const row = sqlite.query(sql).get(...params) as Record<string, unknown> | undefined;
    if (!row) return null;
    const k = Object.keys(row)[0];
    return k ? row[k] : null;
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
    const envId = (process.env.BP_TRANSLATION_ID ?? "").trim();
    if (envId) return envId;

    const row = sqlite
        .query(`SELECT translation_id AS id FROM bp_translation WHERE is_default = 1 LIMIT 1;`)
        .get() as { id?: string } | undefined;

    return row?.id ?? null;
}

function getVerseOrdBounds(sqlite: SqliteLike): { min: number; max: number } {
    const row = sqlite
        .query(`SELECT MIN(verse_ord) AS mn, MAX(verse_ord) AS mx FROM bp_verse;`)
        .get() as { mn?: number; mx?: number } | undefined;

    return { min: asNum(row?.mn), max: asNum(row?.mx) };
}

function getDefaultTranslation(sqlite: SqliteLike): { id: string; name: string } | null {
    const row = sqlite
        .query(`SELECT translation_id AS id, name AS name FROM bp_translation WHERE is_default = 1 LIMIT 1;`)
        .get() as { id?: string; name?: string } | undefined;

    if (!row?.id) return null;
    return { id: row.id, name: row.name ?? row.id };
}

function getVerseTextCount(sqlite: SqliteLike, translationId: string): number {
    return asNum(getScalar(sqlite, `SELECT COUNT(*) AS c FROM bp_verse_text WHERE translation_id = ?;`, [translationId]));
}

function getFtsCount(sqlite: SqliteLike): number {
    return asNum(getScalar(sqlite, `SELECT COUNT(*) AS c FROM bp_verse_text_fts;`));
}

function getSample(sqlite: SqliteLike, translationId: string): { verseKey: string; text: string } | null {
    const row = sqlite
        .query(
            `
      SELECT t.verse_key AS verseKey, t.text AS text
      FROM bp_verse_text t
      WHERE t.translation_id = ? AND t.verse_key = 'GEN.1.1'
      LIMIT 1;
    `,
        )
        .get(translationId) as { verseKey?: string; text?: string } | undefined;

    if (!row?.verseKey || !row?.text) return null;
    return { verseKey: row.verseKey, text: row.text };
}

async function main() {
    const { sqlite, dbPath, close } = openDb();
    const s = sqlite as unknown as SqliteLike;

    try {
        log("dbPath:", dbPath);

        // Basic presence checks (avoid weird errors)
        const required = ["bp_book", "bp_translation", "bp_verse", "bp_verse_text"];
        for (const t of required) {
            if (!hasTable(s, t)) fatal(`missing table "${t}". Run db:migrate first.`);
        }

        const bookCount = getCount(s, "bp_book");
        const verseCount = getCount(s, "bp_verse");
        const chapterCount = hasTable(s, "bp_chapter") ? getCount(s, "bp_chapter") : 0;
        const translationCount = getCount(s, "bp_translation");
        const bounds = getVerseOrdBounds(s);

        const defaultT = getDefaultTranslation(s);
        const translationId = resolveTranslationId(s);

        const ftsPresent = hasTable(s, "bp_verse_text_fts");
        const ftsCount = ftsPresent ? getFtsCount(s) : 0;

        log("bp_book:", bookCount);
        log("bp_verse:", verseCount, `(verse_ord min=${bounds.min} max=${bounds.max})`);
        log("bp_chapter:", chapterCount);
        log("bp_translation:", translationCount);
        log("default translation:", defaultT ? `${defaultT.id} (${defaultT.name})` : "none");

        if (!translationId) {
            log("active translationId: none (set BP_TRANSLATION_ID or set bp_translation.is_default=1)");
            log("bp_verse_text: (skipped)");
        } else {
            const textCount = getVerseTextCount(s, translationId);
            log("active translationId:", translationId);
            log("bp_verse_text:", textCount, `(translation_id=${translationId})`);

            const sample = getSample(s, translationId);
            if (sample) log("sample:", sample.verseKey, "=>", sample.text.slice(0, 90) + (sample.text.length > 90 ? "…" : ""));
            else log("sample:", "GEN.1.1 not found for this translation_id (could be a different translation id)");
            if (verseCount > 0 && textCount > 0) {
                const ratio = Math.round((textCount / Math.max(1, verseCount)) * 10000) / 100;
                log("coverage:", `${ratio}% (bp_verse_text / bp_verse)`);
            }
        }

        log("FTS (bp_verse_text_fts):", ftsPresent ? `present (${ftsCount} rows)` : "missing");

        // Friendly warnings (non-fatal)
        if (bookCount !== 66) log("WARN: expected 66 bp_book rows (seed may not have run).");
        if (verseCount === 0) log("WARN: bp_verse is empty (import-osis likely not run, or CLEAR_SPINE was used then import failed).");
        if (!defaultT && !process.env.BP_TRANSLATION_ID) {
            log("WARN: no default translation and BP_TRANSLATION_ID not set -> /meta will 404.");
        }
        if (!ftsPresent) log("NOTE: FTS is optional. Run db:migrate (extras) if you want /search to use FTS mode.");

        log("ok.");
    } finally {
        close();
    }
}

main().catch((e) => fatal(e));