// apps/api/src/db/client.ts
// Biblia.to — DB bootstrap (Drizzle + Bun native SQLite)
//
// Uses:
// - bun:sqlite (built-in, fast)
// - drizzle-orm/bun-sqlite driver
//
// Exports:
// - openDb(dbPath?): { sqlite, db, dbPath, close, pragmas, readonly, isMemory }
// - default singleton: sqlite, db, dbPath, closeDb, pragmas, dbReadonly, dbIsMemory
//
// Notes:
// - This file does NOT run migrations. Keep migrations separate.
// - For production, set BP_DB_PATH to control where the sqlite file lives.
// - IMPORTANT: defaults are resolved relative to the *apps/api* folder (not process.cwd()).
// - Determinism: we apply a conservative pragma profile; env can override only explicitly.
// - Readonly mode avoids mutating pragmas that require write access.
// - WAL is recommended for normal read/write operation; readonly DBs may open against an
//   existing -wal / -shm pair depending on SQLite state and filesystem behavior.

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
    readonly: boolean;
    isMemory: boolean;
}>;

/* -------------------------------- Constants -------------------------------- */

const ENV = {
    DB_PATH: "BP_DB_PATH",
    DB_READONLY: "BP_DB_READONLY",
    DB_JOURNAL_MODE: "BP_DB_JOURNAL_MODE",
    DB_SYNCHRONOUS: "BP_DB_SYNCHRONOUS",
    DB_BUSY_TIMEOUT_MS: "BP_DB_BUSY_TIMEOUT_MS",
    DB_WAL_AUTOCHECKPOINT: "BP_DB_WAL_AUTOCHECKPOINT",
    DB_CACHE_SIZE_KIB: "BP_DB_CACHE_SIZE_KIB",
    DB_MMAP_SIZE_BYTES: "BP_DB_MMAP_SIZE_BYTES",
} as const;

const DEFAULTS = {
    JOURNAL_MODE: "WAL" as const,
    SYNCHRONOUS: "NORMAL" as const,
    BUSY_TIMEOUT_MS: 5000,
    WAL_AUTOCHECKPOINT: 1000,
    DEFAULT_FILENAME: "biblia.sqlite",
} as const;

/* -------------------------------- Utilities -------------------------------- */

function ensureDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
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

function clampInt(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

function maybePositiveInt(n: number | null): number | undefined {
    if (n == null) return undefined;
    if (!Number.isFinite(n)) return undefined;
    const v = Math.trunc(n);
    return v > 0 ? v : undefined;
}

function parseDbPragmasFromEnv(): DbPragmas {
    const busyTimeoutMs = clampInt(
        envInt(ENV.DB_BUSY_TIMEOUT_MS) ?? DEFAULTS.BUSY_TIMEOUT_MS,
        0,
        300_000,
    );

    const walAutoCheckpoint = clampInt(
        envInt(ENV.DB_WAL_AUTOCHECKPOINT) ?? DEFAULTS.WAL_AUTOCHECKPOINT,
        1,
        1_000_000,
    );

    const cacheSizeKiB = maybePositiveInt(envInt(ENV.DB_CACHE_SIZE_KIB));
    const mmapSizeBytes = maybePositiveInt(envInt(ENV.DB_MMAP_SIZE_BYTES));

    return Object.freeze({
        journalMode: envChoice(ENV.DB_JOURNAL_MODE, ["WAL", "DELETE"] as const, DEFAULTS.JOURNAL_MODE),
        synchronous: envChoice(ENV.DB_SYNCHRONOUS, ["NORMAL", "FULL", "OFF"] as const, DEFAULTS.SYNCHRONOUS),
        foreignKeys: true as const,
        tempStore: "MEMORY" as const,
        busyTimeoutMs,
        walAutoCheckpoint,
        cacheSizeKiB,
        mmapSizeBytes,
    });
}

function fileExists(p: string): boolean {
    try {
        return fs.existsSync(p);
    } catch {
        return false;
    }
}

function isLikelyApiRoot(dir: string): boolean {
    return (
        fileExists(path.join(dir, "src")) &&
        fileExists(path.join(dir, "package.json")) &&
        (fileExists(path.join(dir, "drizzle")) || fileExists(path.join(dir, "drizzle.config.ts")))
    );
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

function defaultDbPath(): string {
    return path.join(findApiRootFromCwd(), "data", DEFAULTS.DEFAULT_FILENAME);
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
 * - Relative paths from arg/env are resolved against process.cwd() intentionally.
 * - ":memory:" and file::memory: URIs are supported.
 */
function resolveDbPath(input?: string): string {
    const envPath = process.env[ENV.DB_PATH]?.trim();
    const raw = (input?.trim() || envPath || defaultDbPath()).trim();

    if (isMemoryDb(raw)) return raw;
    return path.isAbsolute(raw) ? raw : path.resolve(raw);
}

function validateResolvedPath(finalPath: string, readonly: boolean, isMem: boolean): void {
    if (isMem) return;

    if (!finalPath) {
        throw new Error("[bp/db] resolved DB path is empty");
    }

    if (readonly && !fileExists(finalPath)) {
        throw new Error(`[bp/db] readonly DB does not exist: ${finalPath}`);
    }

    if (!readonly) {
        ensureDir(path.dirname(finalPath));
    }
}

function formatOpenError(finalPath: string, e: unknown): Error {
    const err = e as SQLiteError | Error | undefined;
    const msg =
        typeof err?.message === "string" && err.message.trim()
            ? err.message.trim()
            : String(e);

    return new Error(`[bp/db] failed to open DB at ${finalPath}: ${msg}`);
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

function querySingleValue(sqlite: Database, sqlText: string): string | number | null {
    const row = sqlite.query(sqlText).get() as Record<string, unknown> | undefined;
    if (!row) return null;
    const first = Object.values(row)[0];
    return typeof first === "string" || typeof first === "number" ? first : null;
}

function setConnectionPragmas(sqlite: Database, opts: DbPragmas): void {
    const cacheStmt =
        typeof opts.cacheSizeKiB === "number" ? `PRAGMA cache_size = -${Math.abs(opts.cacheSizeKiB)};` : "";

    const mmapStmt =
        typeof opts.mmapSizeBytes === "number" ? `PRAGMA mmap_size = ${Math.max(0, Math.trunc(opts.mmapSizeBytes))};` : "";

    execSql(
        sqlite,
        `
PRAGMA foreign_keys = ON;
PRAGMA temp_store = MEMORY;
PRAGMA busy_timeout = ${opts.busyTimeoutMs};
${cacheStmt}
${mmapStmt}
`.trim(),
    );
}

function setWritablePragmas(sqlite: Database, opts: DbPragmas): void {
    execSql(
        sqlite,
        `
PRAGMA journal_mode = ${opts.journalMode};
PRAGMA synchronous = ${opts.synchronous};
PRAGMA wal_autocheckpoint = ${opts.walAutoCheckpoint};
`.trim(),
    );
}

function verifyCriticalPragmas(sqlite: Database, opts: DbPragmas, readonly: boolean): void {
    const foreignKeys = String(querySingleValue(sqlite, "PRAGMA foreign_keys;") ?? "");
    if (foreignKeys !== "1") {
        throw new Error("[bp/db] failed to enable PRAGMA foreign_keys=ON");
    }

    const busyTimeout = Number(querySingleValue(sqlite, "PRAGMA busy_timeout;") ?? NaN);
    if (!Number.isFinite(busyTimeout) || busyTimeout < 0) {
        throw new Error("[bp/db] failed to apply PRAGMA busy_timeout");
    }

    if (!readonly) {
        const journalMode = String(querySingleValue(sqlite, "PRAGMA journal_mode;") ?? "").toUpperCase();
        if (opts.journalMode === "WAL" && journalMode !== "WAL") {
            throw new Error(`[bp/db] requested journal_mode=WAL but got '${journalMode || "(empty)"}'`);
        }
        if (opts.journalMode === "DELETE" && journalMode !== "DELETE") {
            throw new Error(`[bp/db] requested journal_mode=DELETE but got '${journalMode || "(empty)"}'`);
        }

        const synchronous = Number(querySingleValue(sqlite, "PRAGMA synchronous;") ?? NaN);
        if (!Number.isFinite(synchronous)) {
            throw new Error("[bp/db] failed to read PRAGMA synchronous");
        }
    }
}

function applyPragmas(sqlite: Database, opts: DbPragmas, readonly: boolean): void {
    setConnectionPragmas(sqlite, opts);

    if (!readonly) {
        setWritablePragmas(sqlite, opts);
    }

    verifyCriticalPragmas(sqlite, opts, readonly);
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
 * - BP_DB_CACHE_SIZE_KIB
 * - BP_DB_MMAP_SIZE_BYTES
 */
export function openDb(dbPath?: string): DbHandle {
    const finalPath = resolveDbPath(dbPath);
    const isMem = isMemoryDb(finalPath);
    const readonly = !isMem && envBool(ENV.DB_READONLY, false);

    validateResolvedPath(finalPath, readonly, isMem);

    let sqlite: Database;
    try {
        sqlite = readonly ? new Database(finalPath, { readonly: true }) : new Database(finalPath);
    } catch (e) {
        throw formatOpenError(finalPath, e);
    }

    const pragmas = parseDbPragmasFromEnv();

    try {
        applyPragmas(sqlite, pragmas, readonly);
        const db = drizzle(sqlite, { schema });
        const close = (): void => safeClose(sqlite);

        return Object.freeze({
            sqlite,
            db,
            dbPath: finalPath,
            close,
            pragmas,
            readonly,
            isMemory: isMem,
        });
    } catch (e) {
        safeClose(sqlite);
        const err = e as Error | undefined;
        throw new Error(`[bp/db] failed during DB initialization for ${finalPath}: ${err?.message ?? String(e)}`);
    }
}

/* ------------------------ Default singleton exports ------------------------ */
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
export const dbReadonly = _handle.readonly;
export const dbIsMemory = _handle.isMemory;
export const closeDb = _handle.close;