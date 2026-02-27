// apps/api/src/db/migrate.ts
// Biblia Populi — Production migrations runner (Bun + Drizzle + bun:sqlite)
//
// What this does:
// 1) Ensures DB dir exists
// 2) Opens Bun SQLite with safe pragmas (via openDb)
// 3) Runs Drizzle migrations from ./drizzle
// 4) Applies extra SQL that Drizzle can't model well (FTS5 + triggers)
// 5) Records an idempotent "extras" stamp so FTS isn't re-applied unnecessarily
//
// Usage:
//   bun run db:migrate
//
// Suggested package.json scripts (apps/api):
//   "db:migrate": "bun src/db/migrate.ts"
//   "db:gen": "bunx drizzle-kit generate"
//   "db:push": "bunx drizzle-kit push"   // (dev convenience; optional)
//   "db:studio": "bunx drizzle-kit studio"
//
// Notes:
// - Use db:gen + db:migrate in production.
// - db:push is okay for local prototyping but not for controlled prod deploys.

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
    process.exit(1);
}

function ensureDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
}

/**
 * A tiny idempotency stamp table for "extras" SQL.
 * Drizzle migrations are tracked in __drizzle_migrations already.
 * This is only to avoid re-running FTS/triggers if you ever change your runner behavior.
 */
const EXTRAS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS __bp_extras (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`;

function hasExtra(sqlite: { query: (q: string) => any }, key: string): boolean {
    try {
        const row = sqlite.query(`SELECT value FROM __bp_extras WHERE key = ?`).get(key) as
            | { value: string }
            | undefined;
        return !!row?.value;
    } catch {
        return false;
    }
}

function setExtra(sqlite: { query: (q: string) => any }, key: string, value: string): void {
    sqlite
        .query(
            `INSERT INTO __bp_extras(key, value) VALUES(?, ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
        )
        .run(key, value);
}

function shaLike(s: string): string {
    // Bun has crypto; keep it dependency-free and stable.
    // This isn't security; it's a change detector for the extras SQL payload.
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return `fnv1a32:${(h >>> 0).toString(16).padStart(8, "0")}`;
}

/* ---------------------------------- Main ----------------------------------- */

async function main() {
    const { sqlite, db, dbPath } = openDb();

    // Ensure drizzle folder exists (Drizzle will throw if not)
    const migrationsFolder = path.resolve("apps", "api", "drizzle");
    ensureDir(migrationsFolder);

    log("dbPath:", dbPath);
    log("migrations:", migrationsFolder);

    // 1) Run Drizzle migrations (tracked by __drizzle_migrations)
    log("running drizzle migrations…");
    migrate(db, { migrationsFolder });
    log("drizzle migrations complete.");

    // 2) Run extras (FTS5 + triggers)
    sqlite.exec(EXTRAS_TABLE_SQL);

    const extrasKey = "fts_verse_text_v1";
    const extrasHash = shaLike(FTS_MIGRATION_SQL);

    const existing = hasExtra(sqlite as any, extrasKey);
    if (!existing) {
        log("applying extras:", extrasKey, extrasHash);
        sqlite.exec("BEGIN;");
        try {
            sqlite.exec(FTS_MIGRATION_SQL);
            setExtra(sqlite as any, extrasKey, extrasHash);
            sqlite.exec("COMMIT;");
        } catch (err) {
            sqlite.exec("ROLLBACK;");
            throw err;
        }
        log("extras applied.");
    } else {
        // If you later change the FTS SQL, bump extrasKey (v2) or compare hashes and reapply manually.
        log("extras already present:", extrasKey);
    }

    log("done.");
}

main().catch((err) => {
    fatal(err);
});