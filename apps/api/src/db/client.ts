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
// - IMPORTANT: defaults are resolved relative to the *apps/api* folder (not process.cwd()).

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

import * as schema from "./schema";

export type DbClient = BunSQLiteDatabase<typeof schema>;

export type DbHandle = Readonly<{
    sqlite: Database;
    db: DbClient;
    dbPath: string;
}>;

function ensureDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
}

function isMemoryDb(p: string): boolean {
    return p === ":memory:" || p.startsWith("file::memory:");
}

function apiRootDir(): string {
    // client.ts is at: apps/api/src/db/client.ts
    const here = path.dirname(fileURLToPath(import.meta.url)); // .../apps/api/src/db
    return path.resolve(here, "..", ".."); // .../apps/api
}

function defaultDbPath(): string {
    return path.join(apiRootDir(), "data", "biblia.sqlite");
}

/**
 * Resolve DB path in a way that stays stable no matter what cwd the process runs with.
 *
 * Priority:
 * 1) explicit arg
 * 2) BP_DB_PATH env var
 * 3) apps/api/data/biblia.sqlite (absolute, based on this file’s location)
 *
 * Rules:
 * - Absolute paths are used as-is.
 * - Relative paths from arg/env are resolved against current process.cwd() (intentional).
 * - ":memory:" is supported.
 */
function resolveDbPath(input?: string): string {
    const envPath = process.env.BP_DB_PATH?.trim();
    const raw = (input?.trim() || envPath || defaultDbPath()).trim();

    if (isMemoryDb(raw)) return raw;

    // If caller passed a relative path, resolve it from the current cwd.
    // Default path is already absolute.
    return path.isAbsolute(raw) ? raw : path.resolve(raw);
}

function applyPragmas(sqlite: Database): void {
    // Batch exec keeps it simple and fast.
    sqlite.exec(`
    PRAGMA foreign_keys = ON;

    -- WAL is great for concurrent reads (web + api tooling).
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    PRAGMA temp_store = MEMORY;
    PRAGMA busy_timeout = 5000;

    -- Reasonable defaults; can be tuned later.
    PRAGMA wal_autocheckpoint = 1000;
  `);
}

/**
 * Opens a Bun SQLite DB and returns a typed Drizzle client.
 */
export function openDb(dbPath?: string): DbHandle {
    const finalPath = resolveDbPath(dbPath);

    if (!isMemoryDb(finalPath)) {
        ensureDir(path.dirname(finalPath));
    }

    // Bun creates the file if it doesn't exist.
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