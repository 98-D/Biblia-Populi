// apps/api/src/db/migrate.ts
// Biblia.to — Production migrations runner (Bun + Drizzle + bun:sqlite)
//
// Responsibilities:
// 1) Opens Bun SQLite via openDb()
// 2) Runs Drizzle migrations from apps/api/drizzle
// 3) Applies idempotent "extras" SQL (FTS5 + triggers) with hash stamping
// 4) Verifies key canon + auth infra tables exist
// 5) Performs post-migration sanity checks and WAL checkpoint best-effort
//
// Notes:
// - This file does NOT generate migrations. It only applies them.
// - This runner expects a writable DB. It will refuse readonly mode.
// - Extras are hash-locked by key. If SQL changes incompatibly, bump the extras key.
// - Auth tables are expected unless BP_AUTH_OPTIONAL=1.

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { openDb } from "./client";
import { FTS_MIGRATION_SQL } from "./schema";

/* -------------------------------- Utilities -------------------------------- */

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
    throw new Error("unreachable");
}

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
    const s = p.trim();
    return s === ":memory:" || s.startsWith("file::memory:") || s.startsWith("file:memdb");
}

function envBool(name: string, fallback = false): boolean {
    const v = process.env[name]?.trim().toLowerCase();
    if (!v) return fallback;
    return v === "1" || v === "true" || v === "yes" || v === "on";
}

function envChoice<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
    const raw = process.env[name]?.trim();
    if (!raw) return fallback;
    const v = raw.toUpperCase();
    return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function isLikelyApiRoot(dir: string): boolean {
    return (
        fileExists(path.join(dir, "src")) &&
        (fileExists(path.join(dir, "drizzle")) || fileExists(path.join(dir, "drizzle.config.ts")))
    );
}

/**
 * Find apps/api directory without using import.meta.
 */
function findApiRootFromCwd(): string {
    const cwd = process.cwd();

    let cur = cwd;
    for (let i = 0; i < 12; i += 1) {
        const direct = cur;
        const nested = path.join(cur, "apps", "api");

        if (isLikelyApiRoot(direct)) {
            return direct;
        }

        if (isLikelyApiRoot(nested)) {
            return nested;
        }

        const parent = path.dirname(cur);
        if (parent === cur) break;
        cur = parent;
    }

    return path.join(cwd, "apps", "api");
}

function migrationsDir(): string {
    return path.join(findApiRootFromCwd(), "drizzle");
}

function requirePathExists(p: string, label: string): void {
    if (!fileExists(p)) fatal(`${label} missing: ${p}`);
}

function requireDirectoryHasMigrationFiles(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const hasSomeFile = entries.some((e) => e.isFile());
    if (!hasSomeFile) {
        warn("migrations folder exists but appears empty:", dir);
    }
}

/* ------------------------------- SQLite shape ------------------------------ */

type SqliteLike = {
    exec: (sql: string) => void;
    prepare: (sql: string) => {
        get: (...args: any[]) => any;
        run: (...args: any[]) => any;
        all?: (...args: any[]) => any[];
    };
    query?: (sql: string) => {
        get?: (...args: any[]) => any;
        all?: (...args: any[]) => any[];
    };
};

/* ------------------------------- Extras stamp ------------------------------ */

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

function shaLike(s: string): string {
    return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function getScalarText(sqlite: SqliteLike, q: string, args: any[] = []): string | null {
    const row = sqlite.prepare(q).get(...args) as Record<string, unknown> | undefined;
    if (!row) return null;
    const k = Object.keys(row)[0];
    if (!k) return null;
    const v = row[k];
    return v == null ? null : String(v);
}

function getScalarInt(sqlite: SqliteLike, q: string, args: any[] = []): number {
    const s = getScalarText(sqlite, q, args);
    const n = s == null ? NaN : Number(s);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function runTx(sqlite: SqliteLike, fn: () => void): void {
    sqlite.exec("BEGIN;");
    try {
        fn();
        sqlite.exec("COMMIT;");
    } catch (e) {
        try {
            sqlite.exec("ROLLBACK;");
        } catch {
            // ignore rollback failure
        }
        throw e;
    }
}

function getExtra(sqlite: SqliteLike, key: string): string | null {
    return getScalarText(sqlite, `SELECT sha AS v FROM __bp_extras WHERE key = ?`, [key]);
}

function setExtra(sqlite: SqliteLike, key: string, sha: string): void {
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

type ExtrasPlan = Readonly<{
    key: string;
    sql: string;
    mode: "apply-once" | "hash-locked";
    description: string;
}>;

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

    for (const p of plans) {
        const hash = shaLike(p.sql);
        const existing = getExtra(sqlite, p.key);

        if (existing === null) {
            log("extras: applying", JSON.stringify({ key: p.key, sha: hash, desc: p.description }));
            runTx(sqlite, () => {
                sqlite.exec(p.sql);
                setExtra(sqlite, p.key, hash);
            });
            log("extras: applied", p.key);
            continue;
        }

        if (p.mode === "apply-once") {
            log("extras: already present", p.key);
            continue;
        }

        if (existing !== hash) {
            warn("extras: present but hash differs");
            warn(" - key :", p.key);
            warn(" - db  :", existing);
            warn(" - code:", hash);
            warn(" - desc:", p.description);
            warn("Not reapplying automatically. Bump the extras key (e.g. v2) or add a manual migration.");
            continue;
        }

        log("extras: already present", p.key);
    }
}

/* ------------------------------ Sanity checks ------------------------------ */

function tableExists(sqlite: SqliteLike, name: string): boolean {
    const n = getScalarInt(
        sqlite,
        `SELECT COUNT(*) AS v FROM sqlite_master WHERE type='table' AND name = ?`,
        [name],
    );
    return n === 1;
}

function indexExists(sqlite: SqliteLike, name: string): boolean {
    const n = getScalarInt(
        sqlite,
        `SELECT COUNT(*) AS v FROM sqlite_master WHERE type='index' AND name = ?`,
        [name],
    );
    return n === 1;
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

    const missing = required.filter((t) => !tableExists(sqlite, t));
    if (missing.length > 0) {
        fatal("canon tables missing after migrations:", JSON.stringify({ missing }));
    }
}

function verifyAuthTablesExist(sqlite: SqliteLike): void {
    const optional = envBool("BP_AUTH_OPTIONAL", false);

    const required = ["bp_user", "bp_auth_account", "bp_session"] as const;
    const missing = required.filter((t) => !tableExists(sqlite, t));

    if (missing.length === 0) return;

    if (optional) {
        warn("auth tables missing (optional mode):", JSON.stringify({ missing }));
        return;
    }

    fatal(
        "auth tables missing after migrations (expected with OAuth/identity enabled):",
        JSON.stringify({
            missing,
            hint: "Did you generate/apply drizzle migrations after adding authSchema.ts?",
        }),
    );
}

function verifyDrizzleMetaTables(sqlite: SqliteLike): void {
    const metaCandidates = ["__drizzle_migrations", "__drizzle_migrations__"] as const;
    const found = metaCandidates.some((t) => tableExists(sqlite, t));
    if (!found) {
        warn("drizzle metadata table not found after migrations; verify your migrator/version expectations.");
    }
}

function verifyFtsArtifactsIfConfigured(sqlite: SqliteLike): void {
    const ftsSql = (FTS_MIGRATION_SQL ?? "").trim();
    if (!ftsSql) return;

    const expectedTables = ["bp_verse_text_fts"] as const;
    const missing = expectedTables.filter((t) => !tableExists(sqlite, t));
    if (missing.length > 0) {
        fatal("FTS extras configured but expected FTS artifacts are missing:", JSON.stringify({ missing }));
    }
}

function verifyCoreRowCounts(sqlite: SqliteLike): void {
    const bookCount = getScalarInt(sqlite, `SELECT COUNT(*) AS v FROM bp_book`);
    const verseCount = getScalarInt(sqlite, `SELECT COUNT(*) AS v FROM bp_verse`);
    const translationCount = getScalarInt(sqlite, `SELECT COUNT(*) AS v FROM bp_translation`);

    if (bookCount <= 0) {
        warn("bp_book has no rows");
    }
    if (verseCount <= 0) {
        warn("bp_verse has no rows");
    }
    if (translationCount <= 0) {
        warn("bp_translation has no rows");
    }

    log("row-counts:", JSON.stringify({ bp_book: bookCount, bp_verse: verseCount, bp_translation: translationCount }));
}

function verifyOptionalIndexes(sqlite: SqliteLike): void {
    const interesting = [
        "bp_verse_text_translation_id_verse_key_idx",
        "bp_verse_text_fts",
    ] as const;

    const found: string[] = [];
    for (const name of interesting) {
        if (tableExists(sqlite, name) || indexExists(sqlite, name)) {
            found.push(name);
        }
    }

    log("artifacts:", JSON.stringify({ found }));
}

function verifyForeignKeysEnabled(sqlite: SqliteLike): void {
    const fk = getScalarInt(sqlite, `PRAGMA foreign_keys;`);
    if (fk !== 1) {
        fatal("PRAGMA foreign_keys is not enabled after openDb()");
    }
}

function verifyIntegrity(sqlite: SqliteLike): void {
    const integrity = getScalarText(sqlite, `PRAGMA integrity_check;`);
    if (integrity !== "ok") {
        fatal("integrity_check failed:", integrity ?? "(null)");
    }
}

/* --------------------------- Maintenance / post-run ------------------------- */

function checkpointWalBestEffort(sqlite: SqliteLike): void {
    try {
        const mode = String(getScalarText(sqlite, `PRAGMA journal_mode;`) ?? "").toUpperCase();
        if (mode === "WAL") {
            sqlite.prepare(`PRAGMA wal_checkpoint(PASSIVE);`).run();
            log("wal checkpoint: PASSIVE complete");
        }
    } catch (e) {
        warn("wal checkpoint failed (non-fatal):", e);
    }
}

function stampRunMeta(sqlite: SqliteLike, dbPath: string, migrationsFolder: string): void {
    sqlite.exec(MIGRATION_RUN_META_SQL);

    const extrasPlans = planExtras();
    const extrasHash = shaLike(
        extrasPlans
            .map((p) => `${p.key}:${shaLike(p.sql)}`)
            .sort()
            .join("\n"),
    );

    setMeta(sqlite, "last_db_path", dbPath);
    setMeta(sqlite, "last_migrations_folder", migrationsFolder);
    setMeta(sqlite, "last_auth_optional", envBool("BP_AUTH_OPTIONAL", false) ? "1" : "0");
    setMeta(sqlite, "last_extras_hash", extrasHash);
    setMeta(sqlite, "last_journal_mode", envChoice("BP_DB_JOURNAL_MODE", ["WAL", "DELETE"] as const, "WAL"));
}

/* ---------------------------------- Main ----------------------------------- */

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
        verifyForeignKeysEnabled(sqlite as unknown as SqliteLike);

        log("running drizzle migrations...");
        await migrate(db, { migrationsFolder });
        log("drizzle migrations complete.");

        const s = sqlite as unknown as SqliteLike;

        verifyDrizzleMetaTables(s);
        verifyCanonTablesExist(s);
        verifyAuthTablesExist(s);

        applyExtras(s);
        verifyFtsArtifactsIfConfigured(s);

        verifyCoreRowCounts(s);
        verifyOptionalIndexes(s);

        verifyIntegrity(s);
        stampRunMeta(s, dbPath, migrationsFolder);
        checkpointWalBestEffort(s);

        if (!isMemoryDb(dbPath)) {
            requirePathExists(dbPath, "db file");
        }

        log("done.");
    } finally {
        close();
    }
}

main().catch((err) => fatal(err));