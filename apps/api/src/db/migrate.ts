// apps/api/src/db/migrate.ts
// Biblia Populi — Production migrations runner (Bun + Drizzle + bun:sqlite)
//
// 1) Opens Bun SQLite (via openDb)
// 2) Runs Drizzle migrations from ./drizzle
// 3) Applies "extras" SQL (FTS5 + triggers) with an idempotency stamp

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
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
    throw new Error("unreachable");
}

function ensureDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
}

function isMemoryDb(p: string): boolean {
    return p === ":memory:" || p.startsWith("file::memory:");
}

/**
 * Find apps/api directory without using import.meta (works even if TS module settings are older).
 */
function findApiRootFromCwd(): string {
    const cwd = process.cwd();

    let cur = cwd;
    for (let i = 0; i < 8; i++) {
        const direct = cur;
        const nested = path.join(cur, "apps", "api");

        // Case 1: we're already in apps/api (or a subfolder)
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

    return path.join(cwd, "apps", "api");
}

function migrationsDir(): string {
    return path.join(findApiRootFromCwd(), "drizzle");
}

function requireFileExists(p: string, label: string): void {
    if (!fs.existsSync(p)) fatal(`${label} missing: ${p}`);
}

/* ------------------------------- Extras stamp ------------------------------ */

type SqliteLike = {
    exec: (sql: string) => void;
    prepare: (sql: string) => { get: (...args: any[]) => any; run: (...args: any[]) => any };
};

const EXTRAS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS __bp_extras (
  key TEXT PRIMARY KEY,
  sha TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`;

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

function getScalarInt(sqlite: SqliteLike, q: string): number {
    const s = getScalarText(sqlite, q);
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
            // ignore rollback failures
        }
        throw e;
    }
}

function getExtra(sqlite: SqliteLike, key: string): string | null {
    return getScalarText(sqlite, `SELECT sha AS v FROM __bp_extras WHERE key = ?`, [key]);
}

function setExtra(sqlite: SqliteLike, key: string, sha: string): void {
    sqlite.prepare(`INSERT OR REPLACE INTO __bp_extras(key, sha) VALUES(?, ?);`).run(key, sha);
}

type ExtrasPlan = Readonly<{
    key: string;
    sql: string;
    mode: "apply-once" | "hash-locked";
}>;

function planExtras(): ExtrasPlan[] {
    const plans: ExtrasPlan[] = [];

    const ftsKey = "fts_bp_verse_text_v1";
    if (FTS_MIGRATION_SQL && FTS_MIGRATION_SQL.trim().length > 0) {
        plans.push({ key: ftsKey, sql: FTS_MIGRATION_SQL, mode: "hash-locked" });
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
            log("extras: applying", p.key, hash);
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
            log("extras: present but hash differs:");
            log(" - key :", p.key);
            log(" - db  :", existing);
            log(" - code:", hash);
            log("Not reapplying automatically. If intended, bump extras key (v2) or add a manual migration.");
            continue;
        }

        log("extras: already present", p.key);
    }
}

/* ------------------------------ Canon sanity -------------------------------- */

function verifyCanonTablesExist(sqlite: SqliteLike): void {
    const bookCount = getScalarInt(
        sqlite,
        `SELECT COUNT(*) AS v FROM sqlite_master WHERE type='table' AND name='bp_book'`,
    );
    const verseCount = getScalarInt(
        sqlite,
        `SELECT COUNT(*) AS v FROM sqlite_master WHERE type='table' AND name='bp_verse'`,
    );
    const rangeCount = getScalarInt(
        sqlite,
        `SELECT COUNT(*) AS v FROM sqlite_master WHERE type='table' AND name='bp_range'`,
    );
    const linkCount = getScalarInt(
        sqlite,
        `SELECT COUNT(*) AS v FROM sqlite_master WHERE type='table' AND name='bp_link'`,
    );

    if (bookCount !== 1 || verseCount !== 1 || rangeCount !== 1 || linkCount !== 1) {
        fatal(
            "canon tables missing after migrations:",
            JSON.stringify({ bp_book: bookCount, bp_verse: verseCount, bp_range: rangeCount, bp_link: linkCount }),
        );
    }
}

/* ---------------------------------- Main ----------------------------------- */

async function main() {
    const { sqlite, db, dbPath, close } = openDb();
    const migrationsFolder = migrationsDir();

    ensureDir(migrationsFolder);

    log("dbPath:", dbPath);
    log("migrations:", migrationsFolder);

    try {
        log("running drizzle migrations…");
        migrate(db, { migrationsFolder });
        log("drizzle migrations complete.");

        verifyCanonTablesExist(sqlite as unknown as SqliteLike);

        applyExtras(sqlite as unknown as SqliteLike);

        if (!isMemoryDb(dbPath)) {
            requireFileExists(dbPath, "db file");
        }

        log("done.");
    } finally {
        close();
    }
}

main().catch((err) => fatal(err));