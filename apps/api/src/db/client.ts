// apps/api/src/db/client.ts
// Biblia Populi — DB bootstrap (Drizzle + Bun native SQLite)
//
// Uses:
// - bun:sqlite (built-in, fast)
// - drizzle-orm/bun-sqlite driver
//
// Exports:
// - openDb(dbPath?): { sqlite, db, dbPath }
// - singleton: sqlite, db, dbPath
//
// Notes:
// - This file does NOT run migrations. Keep migrations separate.
// - For production, set BP_DB_PATH to control where the sqlite file lives.
// - For Electron later, pass app.getPath("userData") + filename into openDb().

import * as fs from "node:fs";
import * as path from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

import * as schema from "./schema";

export type DbHandle = Readonly<{
    sqlite: Database;
    db: ReturnType<typeof drizzle<typeof schema>>;
    dbPath: string;
}>;

function ensureDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
}

function resolveDbPath(input?: string): string {
    const envPath = process.env.BP_DB_PATH?.trim();
    const p = input?.trim() || envPath || path.join("apps", "api", "data", "biblia.sqlite");
    return path.resolve(p);
}

function applyPragmas(sqlite: Database): void {
    // All pragmas via exec() as a single batch.
    // WAL is great for concurrent reads; NORMAL is a common balance for WAL.
    sqlite.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA temp_store = MEMORY;
    PRAGMA busy_timeout = 5000;
  `);
}

/**
 * Opens a Bun SQLite DB and returns a typed Drizzle client.
 */
export function openDb(dbPath?: string): DbHandle {
    const finalPath = resolveDbPath(dbPath);
    ensureDir(path.dirname(finalPath));

    const sqlite = new Database(finalPath);
    applyPragmas(sqlite);

    const db = drizzle(sqlite, { schema });

    return Object.freeze({ sqlite, db, dbPath: finalPath });
}

/**
 * Default singleton for the API runtime.
 * (If you need isolated instances for tests, call openDb() directly.)
 */
const handle = openDb();
export const sqlite = handle.sqlite;
export const db = handle.db;
export const dbPath = handle.dbPath;