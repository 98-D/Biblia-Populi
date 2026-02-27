// apps/api/src/db/migrate.ts
// Biblia Populi — Production migrations runner (Bun + Drizzle + bun:sqlite)
//
// What this does:
// 1) Opens Bun SQLite with safe pragmas (via openDb)
// 2) Runs Drizzle migrations from the API's ./drizzle folder (path-stable; no import.meta)
// 3) Applies extra SQL that Drizzle can't model well (FTS5 + triggers)
// 4) Records an idempotent "extras" stamp so extras aren't re-applied unnecessarily
//
// Usage (apps/api):
//   bun run db:migrate
//
// Suggested package.json scripts (apps/api):
//   "db:migrate": "bun src/db/migrate.ts"
//   "db:gen": "bunx drizzle-kit generate"
//   "db:push": "bunx drizzle-kit push"   // dev convenience; optional
//   "db:studio": "bunx drizzle-kit studio"
//
// Notes:
// - Use db:gen + db:migrate in production.
// - db:push is okay for local prototyping but not for controlled prod deploys.
//
// cspell:ignore bunx

import * as fs from "node:fs";
import * as path from "node:path";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { openDb } from "./client";
import { FTS_MIGRATION_SQL } from "./schema";

/* -------------------------------- Utilities -------------------------------- */

function log(...args: unknown[]) {
    // eslint-disable-next-line no-console
    console.log("[db:migrate]", ...args);
}

function fatal(...args: unknown[]): never {
    // eslint-disable-next-line no-console
    console.error("[db:migrate]", ...args);
    // TS doesn't treat process.exit as "never" by default, so throw after to satisfy control-flow.
    process.exit(1);
    // eslint-disable-next-line no-throw-literal
    throw new Error("unreachable");
}

function ensureDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
}

function isMemoryDb(p: string): boolean {
    return p === ":memory:" || p.startsWith("file::memory:");
}

/**
 * Find apps/api directory without using import.meta (works with older TS module settings).
 *
 * Supports running from:
 * - repo root
 * - apps/api
 * - anywhere inside apps/api (as long as cwd is within it)
 */
function findApiRootFromCwd(): string {
    const cwd = process.cwd();

    // Walk up a few levels looking for an apps/api signature.
    let cur = cwd;
    for (let i = 0; i < 8; i++) {
        const direct = cur;
        const nested = path.join(cur, "apps", "api");

        // Case 1: we're already in apps/api (or a subfolder), and it has drizzle + src
        if (
            fs.existsSync(path.join(direct, "src")) &&
            (fs.existsSync(path.join(direct, "drizzle")) || fs.existsSync(path.join(direct, "drizzle.config.ts")))
        ) {
            return direct;
        }

        // Case 2: we're at repo root (or above) and it has apps/api
        if (
            fs.existsSync(path.join(nested, "src")) &&
            (fs.existsSync(path.join(nested, "drizzle")) || fs.existsSync(path.join(nested, "drizzle.config.ts")))
        ) {
            return nested;
        }

        const parent = path.dirname(cur);
        if (parent === cur) break;
        cur = parent;
    }

    // Fallback: common case (repo root) even if folders don't exist yet
    return path.join(cwd, "apps", "api");
}

function migrationsDir(): string {
    return path.join(findApiRootFromCwd(), "drizzle");
}

/**
 * A tiny idempotency stamp table for "extras" SQL.
 * Drizzle migrations are tracked in __drizzle_migrations already.
 * This is only to avoid re-running FTS/triggers.
 */
const EXTRAS_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS __bp_extras (
                                               key TEXT PRIMARY KEY,
                                               value TEXT NOT NULL,
                                               updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
`;

type SqliteStatement = {
    get: (...params: any[]) => any;
    run: (...params: any[]) => any;
};

type SqliteLike = {
    // bun:sqlite Database
    query: (sql: string) => SqliteStatement;
    // NOTE: .exec is currently typed as deprecated in some bun:sqlite typings; we avoid
    // calling it directly (see unsafeExecMulti below) to keep TS clean.
};

function getExtra(sqlite: SqliteLike, key: string): string | null {
    try {
        const row = sqlite.query(`SELECT value FROM __bp_extras WHERE key = ?`).get(key) as
            | { value: string }
            | undefined;
        return row?.value ?? null;
    } catch {
        return null;
    }
}

function setExtra(sqlite: SqliteLike, key: string, value: string): void {
    sqlite
        .query(
            `INSERT INTO __bp_extras(key, value) VALUES(?, ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
        )
        .run(key, value);
}

function shaLike(s: string): string {
    // Dependency-free change detector (not security).
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return `fnv1a32:${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function runTx(sqlite: SqliteLike, fn: () => void): void {
    sqlite.query("BEGIN").run();
    try {
        fn();
        sqlite.query("COMMIT").run();
    } catch (err) {
        try {
            sqlite.query("ROLLBACK").run();
        } catch {
            // ignore rollback failures
        }
        throw err;
    }
}

/**
 * Run a multi-statement SQL blob (FTS + triggers).
 * We intentionally route through `any` to avoid TS deprecation diagnostics for `Database.exec`.
 */
function unsafeExecMulti(sqlite: unknown, sqlText: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sqlite as any).exec(sqlText);
}

/* ---------------------------------- Main ----------------------------------- */

async function main() {
    const { sqlite, db, dbPath } = openDb();
    const migrationsFolder = migrationsDir();
    ensureDir(migrationsFolder);

    log("dbPath:", dbPath);
    log("migrations:", migrationsFolder);

    // 1) Run Drizzle migrations (tracked by __drizzle_migrations)
    log("running drizzle migrations…");
    migrate(db, { migrationsFolder });
    log("drizzle migrations complete.");

    // 2) Run extras (FTS5 + triggers) with idempotency stamp
    unsafeExecMulti(sqlite, EXTRAS_TABLE_SQL);

    // If you change the FTS SQL in a breaking way, bump the key (v2) so it re-applies.
    const extrasKey = "fts_verse_text_v1";
    const extrasHash = shaLike(FTS_MIGRATION_SQL);

    const existingHash = getExtra(sqlite as unknown as SqliteLike, extrasKey);

    if (existingHash === null) {
        log("applying extras:", extrasKey, extrasHash);
        runTx(sqlite as unknown as SqliteLike, () => {
            unsafeExecMulti(sqlite, FTS_MIGRATION_SQL);
            setExtra(sqlite as unknown as SqliteLike, extrasKey, extrasHash);
        });
        log("extras applied.");
    } else if (existingHash !== extrasHash) {
        // We intentionally do NOT auto-reapply to avoid surprises (dropping/recreating FTS can be destructive).
        log("extras present but hash differs:");
        log(" - key :", extrasKey);
        log(" - db  :", existingHash);
        log(" - code:", extrasHash);
        log("Not reapplying automatically. If intended, bump extrasKey (v2) or apply a manual migration.");
    } else {
        log("extras already present:", extrasKey);
    }

    if (!isMemoryDb(dbPath) && !fs.existsSync(dbPath)) {
        fatal("db file not found after migration:", dbPath);
    }

    log("done.");
}

main().catch((err) => fatal(err));