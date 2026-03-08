// apps/api/src/db/migrate.ts
// Biblia.to — hardened production migrations runner (Bun + Drizzle + bun:sqlite)
//
// Responsibilities:
// 1) Opens SQLite via openDb()
// 2) Runs Drizzle migrations from apps/api/drizzle
// 3) Applies idempotent extras SQL (FTS5 + triggers) with hash stamping
// 4) Verifies canon + auth infra surfaces
// 5) Performs integrity checks and best-effort WAL checkpoint
//
// Notes:
// - This file does NOT generate migrations.
// - This runner requires a writable DB.
// - Extras are hash-locked by key. If SQL changes incompatibly, bump the key.
// - Auth tables are required unless BP_AUTH_OPTIONAL=1.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { openDb } from "./client";
import { FTS_MIGRATION_SQL } from "./schema";

/* -------------------------------------------------------------------------- */
/* Logging                                                                     */
/* -------------------------------------------------------------------------- */

function log(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.log("[db:migrate]", ...args);
}

function warn(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.warn("[db:migrate]", ...args);
}

function fatal(...args: unknown[]): never {
    // eslint-disable-next-line no-console
    console.error("[db:migrate]", ...args);
    process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                   */
/* -------------------------------------------------------------------------- */

function ensureDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
}

function fileExists(p: string): boolean {
    try {
        return fs.existsSync(p);
    } catch {
        return false;
    }
}

function isMemoryDb(p: string): boolean {
    const s = p.trim().toLowerCase();
    return (
         s === ":memory:" ||
         s.startsWith("file::memory:") ||
         s.startsWith("file:memdb") ||
         (s.startsWith("file:") && s.includes("mode=memory"))
    );
}

function envBool(name: string, fallback = false): boolean {
    const raw = process.env[name]?.trim().toLowerCase();
    if (!raw) return fallback;
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function envChoice<T extends string>(
     name: string,
     allowed: readonly T[],
     fallback: T,
): T {
    const raw = process.env[name]?.trim();
    if (!raw) return fallback;
    const value = raw.toUpperCase();
    return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function sha256(text: string): string {
    return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function formatUnknownError(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message.trim();
    if (typeof error === "string" && error.trim()) return error.trim();
    return String(error);
}

/* -------------------------------------------------------------------------- */
/* API root / migrations dir resolution                                        */
/* -------------------------------------------------------------------------- */

function isLikelyApiRoot(dir: string): boolean {
    return (
         fileExists(path.join(dir, "package.json")) &&
         fileExists(path.join(dir, "src")) &&
         (fileExists(path.join(dir, "drizzle")) ||
              fileExists(path.join(dir, "drizzle.config.ts")) ||
              fileExists(path.join(dir, "drizzle.config.js")) ||
              fileExists(path.join(dir, "drizzle.config.mjs")))
    );
}

function apiRootFromModule(): string | null {
    try {
        const here = path.dirname(fileURLToPath(import.meta.url)); // apps/api/src/db
        const candidate = path.resolve(here, "..", ".."); // apps/api
        return isLikelyApiRoot(candidate) ? candidate : null;
    } catch {
        return null;
    }
}

function apiRootFromCwd(): string | null {
    let cur = process.cwd();

    for (let i = 0; i < 16; i += 1) {
        if (isLikelyApiRoot(cur)) return cur;

        const nested = path.join(cur, "apps", "api");
        if (isLikelyApiRoot(nested)) return nested;

        const parent = path.dirname(cur);
        if (parent === cur) break;
        cur = parent;
    }

    return null;
}

function findApiRoot(): string {
    return apiRootFromModule() ?? apiRootFromCwd() ?? path.resolve(process.cwd(), "apps", "api");
}

function migrationsDir(): string {
    return path.join(findApiRoot(), "drizzle");
}

function requirePathExists(p: string, label: string): void {
    if (!fileExists(p)) {
        fatal(`${label} missing: ${p}`);
    }
}

function requireDirectoryHasMigrationFiles(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const hasSomeFile = entries.some((entry) => entry.isFile());
    if (!hasSomeFile) {
        warn("migrations folder exists but appears empty:", dir);
    }
}

/* -------------------------------------------------------------------------- */
/* SQLite protocol                                                              */
/* -------------------------------------------------------------------------- */

type SqliteRow = Record<string, unknown>;

type SqliteStatement = {
    get: (...args: unknown[]) => unknown;
    run: (...args: unknown[]) => unknown;
    all?: (...args: unknown[]) => unknown[];
};

type SqliteQuery = {
    get?: (...args: unknown[]) => unknown;
    all?: (...args: unknown[]) => unknown[];
};

type SqliteLike = {
    exec: (sql: string) => void;
    prepare: (sql: string) => SqliteStatement;
    query?: (sql: string) => SqliteQuery;
};

/* -------------------------------------------------------------------------- */
/* Migration metadata / extras tables                                          */
/* -------------------------------------------------------------------------- */

const EXTRAS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS __bp_extras (
    key TEXT PRIMARY KEY,
    sha TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`.trim();

const MIGRATION_RUN_META_SQL = `
CREATE TABLE IF NOT EXISTS __bp_migration_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`.trim();

/* -------------------------------------------------------------------------- */
/* Scalar helpers                                                               */
/* -------------------------------------------------------------------------- */

function getPreparedRow(
     sqlite: SqliteLike,
     sqlText: string,
     args: readonly unknown[] = [],
): SqliteRow | null {
    const row = sqlite.prepare(sqlText).get(...args) as SqliteRow | undefined;
    return row ?? null;
}

function getScalar(
     sqlite: SqliteLike,
     sqlText: string,
     args: readonly unknown[] = [],
): unknown {
    const row = getPreparedRow(sqlite, sqlText, args);
    if (!row) return null;

    const firstKey = Object.keys(row)[0];
    if (!firstKey) return null;

    return row[firstKey] ?? null;
}

function getScalarText(
     sqlite: SqliteLike,
     sqlText: string,
     args: readonly unknown[] = [],
): string | null {
    const value = getScalar(sqlite, sqlText, args);
    return value == null ? null : String(value);
}

function getScalarInt(
     sqlite: SqliteLike,
     sqlText: string,
     args: readonly unknown[] = [],
): number {
    const value = getScalar(sqlite, sqlText, args);
    const n =
         typeof value === "bigint"
              ? Number(value)
              : value == null
                   ? Number.NaN
                   : Number(value);

    return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/* -------------------------------------------------------------------------- */
/* Transaction helper                                                           */
/* -------------------------------------------------------------------------- */

function runTx(sqlite: SqliteLike, fn: () => void): void {
    sqlite.exec("BEGIN;");
    try {
        fn();
        sqlite.exec("COMMIT;");
    } catch (error) {
        try {
            sqlite.exec("ROLLBACK;");
        } catch {
            // ignore rollback failure
        }
        throw error;
    }
}

/* -------------------------------------------------------------------------- */
/* Extras                                                                       */
/* -------------------------------------------------------------------------- */

type ExtrasPlan = Readonly<{
    key: string;
    sql: string;
    mode: "apply-once" | "hash-locked";
    description: string;
}>;

function getExtraSha(sqlite: SqliteLike, key: string): string | null {
    return getScalarText(
         sqlite,
         `SELECT sha AS v FROM __bp_extras WHERE key = ?`,
         [key],
    );
}

function setExtraSha(sqlite: SqliteLike, key: string, sha: string): void {
    sqlite.prepare(
         `
        INSERT INTO __bp_extras(key, sha)
        VALUES(?, ?)
        ON CONFLICT(key) DO UPDATE SET
            sha = excluded.sha,
            applied_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'));
        `,
    ).run(key, sha);
}

function setMeta(sqlite: SqliteLike, key: string, value: string): void {
    sqlite.prepare(
         `
        INSERT INTO __bp_migration_meta(key, value)
        VALUES(?, ?)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'));
        `,
    ).run(key, value);
}

function planExtras(): ExtrasPlan[] {
    const plans: ExtrasPlan[] = [];
    const ftsSql = (FTS_MIGRATION_SQL ?? "").trim();

    if (ftsSql.length > 0) {
        plans.push({
            key: "fts_bp_verse_text_v1",
            sql: ftsSql,
            mode: "hash-locked",
            description: "FTS5 and related triggers for bp_verse_text",
        });
    }

    return plans;
}

function applyExtras(sqlite: SqliteLike): void {
    sqlite.exec(EXTRAS_TABLE_SQL);

    const plans = planExtras();
    if (plans.length === 0) {
        log("extras: none configured");
        return;
    }

    for (const plan of plans) {
        const hash = sha256(plan.sql);
        const existing = getExtraSha(sqlite, plan.key);

        if (existing === null) {
            log(
                 "extras: applying",
                 JSON.stringify({
                     key: plan.key,
                     sha: hash,
                     desc: plan.description,
                 }),
            );

            runTx(sqlite, () => {
                sqlite.exec(plan.sql);
                setExtraSha(sqlite, plan.key, hash);
            });

            log("extras: applied", plan.key);
            continue;
        }

        if (plan.mode === "apply-once") {
            log("extras: already present", plan.key);
            continue;
        }

        if (existing !== hash) {
            warn("extras: present but hash differs");
            warn(" - key :", plan.key);
            warn(" - db  :", existing);
            warn(" - code:", hash);
            warn(" - desc:", plan.description);
            warn("Not reapplying automatically. Bump the extras key or add a manual migration.");
            continue;
        }

        log("extras: already present", plan.key);
    }
}

/* -------------------------------------------------------------------------- */
/* Sanity checks                                                                */
/* -------------------------------------------------------------------------- */

function tableExists(sqlite: SqliteLike, name: string): boolean {
    return (
         getScalarInt(
              sqlite,
              `SELECT COUNT(*) AS v
             FROM sqlite_master
             WHERE type='table' AND name = ?`,
              [name],
         ) === 1
    );
}

function indexExists(sqlite: SqliteLike, name: string): boolean {
    return (
         getScalarInt(
              sqlite,
              `SELECT COUNT(*) AS v
             FROM sqlite_master
             WHERE type='index' AND name = ?`,
              [name],
         ) === 1
    );
}

function viewExists(sqlite: SqliteLike, name: string): boolean {
    return (
         getScalarInt(
              sqlite,
              `SELECT COUNT(*) AS v
             FROM sqlite_master
             WHERE type='view' AND name = ?`,
              [name],
         ) === 1
    );
}

function verifyCanonTablesExist(sqlite: SqliteLike): void {
    const required = [
        "bp_book",
        "bp_verse",
        "bp_verse_text",
        "bp_translation",
        "bp_range",
        "bp_link",
    ] as const;

    const missing = required.filter((table) => !tableExists(sqlite, table));
    if (missing.length > 0) {
        fatal("canon tables missing after migrations:", JSON.stringify({ missing }));
    }
}

function verifyAuthTablesExist(sqlite: SqliteLike): void {
    const optional = envBool("BP_AUTH_OPTIONAL", false);
    const required = ["bp_user", "bp_auth_account", "bp_session"] as const;

    const missing = required.filter((table) => !tableExists(sqlite, table));
    if (missing.length === 0) return;

    if (optional) {
        warn("auth tables missing (optional mode):", JSON.stringify({ missing }));
        return;
    }

    fatal(
         "auth tables missing after migrations:",
         JSON.stringify({
             missing,
             hint: "Generate/apply Drizzle migrations after adding auth schema surfaces, or set BP_AUTH_OPTIONAL=1.",
         }),
    );
}

function verifyDrizzleMetaTables(sqlite: SqliteLike): void {
    const candidates = ["__drizzle_migrations", "__drizzle_migrations__"] as const;
    const found = candidates.some((name) => tableExists(sqlite, name));

    if (!found) {
        warn("drizzle metadata table not found after migrations; verify migrator/version expectations.");
    }
}

function verifyFtsArtifactsIfConfigured(sqlite: SqliteLike): void {
    const ftsSql = (FTS_MIGRATION_SQL ?? "").trim();
    if (!ftsSql) return;

    const requiredTables = ["bp_verse_text_fts"] as const;
    const missing = requiredTables.filter((table) => !tableExists(sqlite, table) && !viewExists(sqlite, table));

    if (missing.length > 0) {
        fatal(
             "FTS extras configured but expected artifacts are missing:",
             JSON.stringify({ missing }),
        );
    }
}

function verifyForeignKeysEnabled(sqlite: SqliteLike): void {
    const enabled = getScalarInt(sqlite, `PRAGMA foreign_keys;`);
    if (enabled !== 1) {
        fatal("PRAGMA foreign_keys is not enabled after openDb()");
    }
}

function verifyCoreRowCounts(sqlite: SqliteLike): void {
    const bookCount = getScalarInt(sqlite, `SELECT COUNT(*) AS v FROM bp_book`);
    const verseCount = getScalarInt(sqlite, `SELECT COUNT(*) AS v FROM bp_verse`);
    const translationCount = getScalarInt(sqlite, `SELECT COUNT(*) AS v FROM bp_translation`);

    if (bookCount <= 0) warn("bp_book has no rows");
    if (verseCount <= 0) warn("bp_verse has no rows");
    if (translationCount <= 0) warn("bp_translation has no rows");

    log(
         "row-counts:",
         JSON.stringify({
             bp_book: bookCount,
             bp_verse: verseCount,
             bp_translation: translationCount,
         }),
    );
}

function verifyInterestingArtifacts(sqlite: SqliteLike): void {
    const interesting = [
        "bp_verse_text_translation_id_verse_key_idx",
        "bp_verse_text_fts",
    ] as const;

    const found: string[] = [];
    for (const name of interesting) {
        if (tableExists(sqlite, name) || indexExists(sqlite, name) || viewExists(sqlite, name)) {
            found.push(name);
        }
    }

    log("artifacts:", JSON.stringify({ found }));
}

function verifyIntegrity(sqlite: SqliteLike): void {
    const integrity = getScalarText(sqlite, `PRAGMA integrity_check;`);
    if (integrity !== "ok") {
        fatal("integrity_check failed:", integrity ?? "(null)");
    }
}

/* -------------------------------------------------------------------------- */
/* Post-run maintenance                                                         */
/* -------------------------------------------------------------------------- */

function checkpointWalBestEffort(sqlite: SqliteLike): void {
    try {
        const mode = String(getScalarText(sqlite, `PRAGMA journal_mode;`) ?? "").toUpperCase();
        if (mode !== "WAL") return;

        sqlite.prepare(`PRAGMA wal_checkpoint(PASSIVE);`).run();
        log("wal checkpoint: PASSIVE complete");
    } catch (error) {
        warn("wal checkpoint failed (non-fatal):", formatUnknownError(error));
    }
}

function stampRunMeta(
     sqlite: SqliteLike,
     dbPath: string,
     migrationsFolder: string,
): void {
    sqlite.exec(MIGRATION_RUN_META_SQL);

    const extrasHash = sha256(
         planExtras()
              .map((plan) => `${plan.key}:${sha256(plan.sql)}`)
              .sort()
              .join("\n"),
    );

    setMeta(sqlite, "last_db_path", dbPath);
    setMeta(sqlite, "last_migrations_folder", migrationsFolder);
    setMeta(sqlite, "last_auth_optional", envBool("BP_AUTH_OPTIONAL", false) ? "1" : "0");
    setMeta(sqlite, "last_extras_hash", extrasHash);
    setMeta(
         sqlite,
         "last_journal_mode",
         envChoice("BP_DB_JOURNAL_MODE", ["WAL", "DELETE"] as const, "WAL"),
    );
}

/* -------------------------------------------------------------------------- */
/* Main                                                                         */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
    const handle = openDb();
    const { sqlite, db, dbPath, close, readonly, isMemory } = handle;

    if (readonly) {
        fatal(
             "migrate runner opened DB in readonly mode.",
             JSON.stringify({
                 dbPath,
                 hint: "Unset BP_DB_READONLY or set BP_DB_READONLY=0 before running migrations.",
             }),
        );
    }

    const migrationsFolder = migrationsDir();

    ensureDir(migrationsFolder);
    requirePathExists(migrationsFolder, "migrations folder");
    requireDirectoryHasMigrationFiles(migrationsFolder);

    log("dbPath:", dbPath);
    log("memory:", isMemory ? "yes" : "no");
    log("migrations:", migrationsFolder);

    try {
        const sqliteLike = sqlite as unknown as SqliteLike;

        verifyForeignKeysEnabled(sqliteLike);

        log("running drizzle migrations...");
        await migrate(db, { migrationsFolder });
        log("drizzle migrations complete.");

        verifyDrizzleMetaTables(sqliteLike);
        verifyCanonTablesExist(sqliteLike);
        verifyAuthTablesExist(sqliteLike);

        applyExtras(sqliteLike);
        verifyFtsArtifactsIfConfigured(sqliteLike);

        verifyCoreRowCounts(sqliteLike);
        verifyInterestingArtifacts(sqliteLike);
        verifyIntegrity(sqliteLike);

        stampRunMeta(sqliteLike, dbPath, migrationsFolder);
        checkpointWalBestEffort(sqliteLike);

        if (!isMemoryDb(dbPath)) {
            requirePathExists(dbPath, "db file");
        }

        log("done.");
    } finally {
        close();
    }
}

main().catch((error: unknown) => {
    fatal(formatUnknownError(error));
});