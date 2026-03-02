// apps/api/src/db/client.ts
// Biblia Populi — DB bootstrap (Drizzle + Bun native SQLite)
//
// Uses:
// - bun:sqlite (built-in, fast)
// - drizzle-orm/bun-sqlite driver
//
// Exports:
// - openDb(dbPath?): { sqlite, db, dbPath, close }
// - singleton: sqlite, db, dbPath, closeDb
//
// Notes:
// - This file does NOT run migrations. Keep migrations separate.
// - For production, set BP_DB_PATH to control where the sqlite file lives.
// - IMPORTANT: defaults are resolved relative to the *apps/api* folder (not process.cwd()).
// - Determinism: we lock a conservative pragma profile and let env override only when explicit.

import * as fs from "node:fs";
import * as path from "node:path";
import { Database, type SQLiteError } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

import { schema } from "./schema";

export type DbClient = BunSQLiteDatabase<typeof schema>;

export type DbHandle = Readonly<{
    sqlite: Database;
    db: DbClient;
    dbPath: string;
    close: () => void;
    pragmas: Readonly<{
        journalMode: "WAL" | "DELETE";
        synchronous: "NORMAL" | "FULL" | "OFF";
        foreignKeys: true;
        tempStore: "MEMORY";
        busyTimeoutMs: number;
        walAutocheckpoint: number;
        cacheSizeKiB?: number;
        mmapSizeBytes?: number;
    }>;
}>;

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

    let cur = cwd;
    for (let i = 0; i < 8; i++) {
        const direct = cur;
        const nested = path.join(cur, "apps", "api");

        if (fs.existsSync(path.join(direct, "src")) && fs.existsSync(path.join(direct, "package.json"))) {
            // likely apps/api
            return direct;
        }

        if (fs.existsSync(path.join(nested, "src")) && fs.existsSync(path.join(nested, "package.json"))) {
            return nested;
        }

        const parent = path.dirname(cur);
        if (parent === cur) break;
        cur = parent;
    }

    return path.join(cwd, "apps", "api");
}

function defaultDbPath(): string {
    return path.join(findApiRootFromCwd(), "data", "biblia.sqlite");
}

function envBool(name: string): boolean {
    const v = process.env[name]?.trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
}

function envInt(name: string): number | null {
    const v = process.env[name]?.trim();
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
}

function envChoice<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
    const v = process.env[name]?.trim().toUpperCase();
    if (!v) return fallback;
    return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function applyPragmas(
    sqlite: Database,
    opts: Readonly<{
        journalMode: "WAL" | "DELETE";
        synchronous: "NORMAL" | "FULL" | "OFF";
        busyTimeoutMs: number;
        walAutocheckpoint: number;
        cacheSizeKiB?: number;
        mmapSizeBytes?: number;
    }>,
): void {
    const cacheStmt =
        typeof opts.cacheSizeKiB === "number" ? `PRAGMA cache_size = -${Math.abs(opts.cacheSizeKiB)};` : "";

    const mmapStmt = typeof opts.mmapSizeBytes === "number" ? `PRAGMA mmap_size = ${opts.mmapSizeBytes};` : "";

    sqlite.exec(`
    PRAGMA foreign_keys = ON;

    PRAGMA journal_mode = ${opts.journalMode};
    PRAGMA synchronous = ${opts.synchronous};

    PRAGMA temp_store = MEMORY;
    PRAGMA busy_timeout = ${opts.busyTimeoutMs};

    PRAGMA wal_autocheckpoint = ${opts.walAutocheckpoint};

    ${cacheStmt}
    ${mmapStmt}
  `);
}

function safeClose(sqlite: Database): void {
    try {
        sqlite.close();
    } catch {
        // ignore on shutdown
    }
}

/**
 * Resolve DB path in a way that stays stable no matter what cwd the process runs with.
 *
 * Priority:
 * 1) explicit arg
 * 2) BP_DB_PATH env var
 * 3) apps/api/data/biblia.sqlite (absolute, based on directory discovery)
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
    return path.isAbsolute(raw) ? raw : path.resolve(raw);
}

/**
 * Opens a Bun SQLite DB and returns a typed Drizzle client.
 */
export function openDb(dbPath?: string): DbHandle {
    const finalPath = resolveDbPath(dbPath);

    const isMem = isMemoryDb(finalPath);
    const readonly = !isMem && envBool("BP_DB_READONLY");

    if (!isMem) ensureDir(path.dirname(finalPath));

    if (readonly && !fs.existsSync(finalPath)) {
        throw new Error(`[bp/db] readonly DB does not exist: ${finalPath}`);
    }

    let sqlite: Database;
    try {
        sqlite = readonly ? new Database(finalPath, { readonly: true }) : new Database(finalPath);
    } catch (e) {
        const err = e as SQLiteError;
        throw new Error(`[bp/db] failed to open DB at ${finalPath}: ${err?.message ?? String(e)}`);
    }

    const pragmas = Object.freeze({
        journalMode: envChoice("BP_DB_JOURNAL_MODE", ["WAL", "DELETE"] as const, "WAL"),
        synchronous: envChoice("BP_DB_SYNCHRONOUS", ["NORMAL", "FULL", "OFF"] as const, "NORMAL"),
        foreignKeys: true as const,
        tempStore: "MEMORY" as const,
        busyTimeoutMs: envInt("BP_DB_BUSY_TIMEOUT_MS") ?? 5000,
        walAutocheckpoint: envInt("BP_DB_WAL_AUTOCHECKPOINT") ?? 1000,
        cacheSizeKiB: envInt("BP_DB_CACHE_SIZE_KIB") ?? undefined,
        mmapSizeBytes: envInt("BP_DB_MMAP_SIZE_BYTES") ?? undefined,
    });

    applyPragmas(sqlite, pragmas);

    const db = drizzle(sqlite, { schema });

    const close = (): void => safeClose(sqlite);

    return Object.freeze({ sqlite, db, dbPath: finalPath, close, pragmas });
}

/**
 * Default singleton for the API runtime.
 * (If you need isolated instances for tests, call openDb() directly.)
 */
const handle = openDb();

export const sqlite = handle.sqlite;
export const db = handle.db;
export const dbPath = handle.dbPath;
export const dbPragmas = handle.pragmas;

export function closeDb(): void {
    handle.close();
}