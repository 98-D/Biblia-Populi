// apps/api/src/db/client.ts
// Biblia Populi — DB bootstrap (Drizzle + Bun native SQLite)
//
// Uses:
// - bun:sqlite (built-in, fast)
// - drizzle-orm/bun-sqlite driver
//
// Exports:
// - openDb(dbPath?): { sqlite, db, dbPath, close, pragmas }
// - default singleton: sqlite, db, dbPath, closeDb, pragmas
//
// Notes:
// - This file does NOT run migrations. Keep migrations separate.
// - For production, set BP_DB_PATH to control where the sqlite file lives.
// - IMPORTANT: defaults are resolved relative to the *apps/api* folder (not process.cwd()).
// - Determinism: we apply a conservative pragma profile; env can override only explicitly.

import * as fs from "node:fs";
import * as path from "node:path";
import { Database, type SQLiteError } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

import { schema } from "./schema";

export type DbClient = BunSQLiteDatabase<typeof schema>;

export type DbPragmas = Readonly<{
    journalMode: "WAL" | "DELETE";
    synchronous: "NORMAL" | "FULL" | "OFF";
    foreignKeys: true;
    tempStore: "MEMORY";
    busyTimeoutMs: number;
    walAutoCheckpoint: number;
    cacheSizeKiB?: number;
    mmapSizeBytes?: number;
}>;

export type DbHandle = Readonly<{
    sqlite: Database;
    db: DbClient;
    dbPath: string;
    close: () => void;
    pragmas: DbPragmas;
}>;

/* -------------------------------- Utilities -------------------------------- */

function ensureDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
}

function isMemoryDb(p: string): boolean {
    return p === ":memory:" || p.startsWith("file::memory:");
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
    const raw = process.env[name]?.trim();
    if (!raw) return fallback;
    const v = raw.toUpperCase();
    return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
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
    for (let i = 0; i < 10; i++) {
        const direct = cur;
        const nested = path.join(cur, "apps", "api");

        // Case 1: we're already in apps/api (or a subfolder)
        if (
            fs.existsSync(path.join(direct, "src")) &&
            fs.existsSync(path.join(direct, "package.json")) &&
            (fs.existsSync(path.join(direct, "drizzle")) || fs.existsSync(path.join(direct, "drizzle.config.ts")))
        ) {
            return direct;
        }

        // Case 2: we're at repo root (or above) and it has apps/api
        if (
            fs.existsSync(path.join(nested, "src")) &&
            fs.existsSync(path.join(nested, "package.json")) &&
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

function defaultDbPath(): string {
    return path.join(findApiRootFromCwd(), "data", "biblia.sqlite");
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
 * - Relative paths from arg/env are resolved against process.cwd() (intentional).
 * - ":memory:" is supported.
 */
function resolveDbPath(input?: string): string {
    const envPath = process.env.BP_DB_PATH?.trim();
    const raw = (input?.trim() || envPath || defaultDbPath()).trim();

    if (isMemoryDb(raw)) return raw;
    return path.isAbsolute(raw) ? raw : path.resolve(raw);
}

/* -------------------------------- Pragmas ---------------------------------- */

/**
 * Bun's sqlite typings may mark exec() deprecated due to overload signatures.
 * In practice, this is still the correct API for PRAGMA batches.
 * We isolate it here so any future replacement is localized.
 */
function execSql(sqlite: Database, text: string): void {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    sqlite.exec(text);
}

function applyPragmas(sqlite: Database, opts: DbPragmas): void {
    // cache_size: negative means KiB
    const cacheStmt =
        typeof opts.cacheSizeKiB === "number" ? `PRAGMA cache_size = -${Math.abs(opts.cacheSizeKiB)};` : "";

    const mmapStmt = typeof opts.mmapSizeBytes === "number" ? `PRAGMA mmap_size = ${opts.mmapSizeBytes};` : "";

    execSql(
        sqlite,
        `
PRAGMA foreign_keys = ON;

PRAGMA journal_mode = ${opts.journalMode};
PRAGMA synchronous = ${opts.synchronous};

PRAGMA temp_store = MEMORY;
PRAGMA busy_timeout = ${opts.busyTimeoutMs};

PRAGMA wal_autocheckpoint = ${opts.walAutoCheckpoint};

${cacheStmt}
${mmapStmt}
`.trim(),
    );
}

function safeClose(sqlite: Database): void {
    try {
        sqlite.close();
    } catch {
        // ignore on shutdown
    }
}

/* ---------------------------------- API ----------------------------------- */

/**
 * Opens a Bun SQLite DB and returns a typed Drizzle client.
 *
 * Env:
 * - BP_DB_PATH
 * - BP_DB_READONLY=1
 * - BP_DB_JOURNAL_MODE=WAL|DELETE
 * - BP_DB_SYNCHRONOUS=NORMAL|FULL|OFF
 * - BP_DB_BUSY_TIMEOUT_MS=5000
 * - BP_DB_WAL_AUTOCHECKPOINT=1000
 * - BP_DB_CACHE_SIZE_KIB (negative cache_size KiB)
 * - BP_DB_MMAP_SIZE_BYTES
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

    const pragmas: DbPragmas = Object.freeze({
        journalMode: envChoice("BP_DB_JOURNAL_MODE", ["WAL", "DELETE"] as const, "WAL"),
        synchronous: envChoice("BP_DB_SYNCHRONOUS", ["NORMAL", "FULL", "OFF"] as const, "NORMAL"),
        foreignKeys: true as const,
        tempStore: "MEMORY" as const,
        busyTimeoutMs: envInt("BP_DB_BUSY_TIMEOUT_MS") ?? 5000,
        walAutoCheckpoint: envInt("BP_DB_WAL_AUTOCHECKPOINT") ?? 1000,
        cacheSizeKiB: envInt("BP_DB_CACHE_SIZE_KIB") ?? undefined,
        mmapSizeBytes: envInt("BP_DB_MMAP_SIZE_BYTES") ?? undefined,
    });

    applyPragmas(sqlite, pragmas);

    const db = drizzle(sqlite, { schema });

    const close = (): void => safeClose(sqlite);

    return Object.freeze({ sqlite, db, dbPath: finalPath, close, pragmas });
}

/* --------------------------- Default singleton exports --------------------------- */
/**
 * Most of the API server wants a single DB handle.
 * Import from "./db/client":
 *   import { db, sqlite } from "./db/client";
 */
const _handle = openDb();

export const sqlite = _handle.sqlite;
export const db = _handle.db;
export const dbPath = _handle.dbPath;
export const pragmas = _handle.pragmas;
export const closeDb = _handle.close;