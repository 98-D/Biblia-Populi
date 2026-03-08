// apps/api/src/db/client.ts
// Biblia.to — hardened DB bootstrap (Drizzle + Bun native SQLite)
//
// Goals:
// - stable DB path resolution across repo-root / apps/api / arbitrary cwd
// - explicit, conservative pragma profile
// - safe readonly handling
// - deterministic singleton export surface
// - clear diagnostics without hidden mutation
// - hot-reload-safe singleton reuse under Bun watch/dev
//
// Notes:
// - This file does NOT run migrations.
// - Prefer setting BP_DB_PATH in production.
// - Default file path is anchored to apps/api/data/biblia.sqlite.
// - Relative BP_DB_PATH / arg paths are resolved against process.cwd() intentionally.
// - Memory DBs support :memory: and file:...memory... URIs.
// - Readonly mode avoids write-only pragmas.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Database, type SQLiteError } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

import { schema } from "./schema";

export type DbClient = BunSQLiteDatabase<typeof schema>;

export type DbJournalMode = "WAL" | "DELETE";
export type DbSynchronous = "NORMAL" | "FULL" | "OFF";

export type DbPragmas = Readonly<{
    journalMode: DbJournalMode;
    synchronous: DbSynchronous;
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

export type OpenDbOptions = Readonly<{
    dbPath?: string;
    readonly?: boolean;
}>;

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
    BUSY_TIMEOUT_MS: 5_000,
    WAL_AUTOCHECKPOINT: 1_000,
    DEFAULT_FILENAME: "biblia.sqlite",
    MAX_BUSY_TIMEOUT_MS: 300_000,
    MAX_WAL_AUTOCHECKPOINT: 1_000_000,
} as const;

const GLOBAL_SINGLETON_KEY = "__bp_db_singleton_v2__" as const;

type GlobalDbSingleton = {
    handle: DbHandle;
    signature: string;
};

declare global {
    // eslint-disable-next-line no-var
    var __bp_db_singleton_v2__: GlobalDbSingleton | undefined;
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                   */
/* -------------------------------------------------------------------------- */

function fileExists(p: string): boolean {
    try {
        return fs.existsSync(p);
    } catch {
        return false;
    }
}

function ensureDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
}

function isMemoryDb(input: string): boolean {
    const s = input.trim().toLowerCase();
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

    switch (raw) {
        case "1":
        case "true":
        case "yes":
        case "on":
            return true;
        case "0":
        case "false":
        case "no":
        case "off":
            return false;
        default:
            return fallback;
    }
}

function envInt(name: string): number | null {
    const raw = process.env[name]?.trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.trunc(n) : null;
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

function clampInt(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

function maybePositiveInt(n: number | null): number | undefined {
    if (n == null || !Number.isFinite(n)) return undefined;
    const v = Math.trunc(n);
    return v > 0 ? v : undefined;
}

function normalizePathForLogs(p: string): string {
    return isMemoryDb(p) ? p : path.normalize(p);
}

function formatUnknownError(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message.trim();
    if (typeof error === "string" && error.trim()) return error.trim();
    return String(error);
}

function parseDbPragmasFromEnv(): DbPragmas {
    const busyTimeoutMs = clampInt(
         envInt(ENV.DB_BUSY_TIMEOUT_MS) ?? DEFAULTS.BUSY_TIMEOUT_MS,
         0,
         DEFAULTS.MAX_BUSY_TIMEOUT_MS,
    );

    const walAutoCheckpoint = clampInt(
         envInt(ENV.DB_WAL_AUTOCHECKPOINT) ?? DEFAULTS.WAL_AUTOCHECKPOINT,
         1,
         DEFAULTS.MAX_WAL_AUTOCHECKPOINT,
    );

    const cacheSizeKiB = maybePositiveInt(envInt(ENV.DB_CACHE_SIZE_KIB));
    const mmapSizeBytes = maybePositiveInt(envInt(ENV.DB_MMAP_SIZE_BYTES));

    return Object.freeze({
        journalMode: envChoice(
             ENV.DB_JOURNAL_MODE,
             ["WAL", "DELETE"] as const,
             DEFAULTS.JOURNAL_MODE,
        ),
        synchronous: envChoice(
             ENV.DB_SYNCHRONOUS,
             ["NORMAL", "FULL", "OFF"] as const,
             DEFAULTS.SYNCHRONOUS,
        ),
        foreignKeys: true as const,
        tempStore: "MEMORY" as const,
        busyTimeoutMs,
        walAutoCheckpoint,
        cacheSizeKiB,
        mmapSizeBytes,
    });
}

/* -------------------------------------------------------------------------- */
/* API root / path resolution                                                  */
/* -------------------------------------------------------------------------- */

function isLikelyApiRoot(dir: string): boolean {
    return (
         fileExists(path.join(dir, "package.json")) &&
         fileExists(path.join(dir, "src")) &&
         (
              fileExists(path.join(dir, "drizzle")) ||
              fileExists(path.join(dir, "drizzle.config.ts")) ||
              fileExists(path.join(dir, "drizzle.config.js")) ||
              fileExists(path.join(dir, "drizzle.config.mjs"))
         )
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
    const fromModule = apiRootFromModule();
    if (fromModule) return fromModule;

    const fromCwd = apiRootFromCwd();
    if (fromCwd) return fromCwd;

    return path.resolve(process.cwd(), "apps", "api");
}

function defaultDbPath(): string {
    return path.join(findApiRoot(), "data", DEFAULTS.DEFAULT_FILENAME);
}

/**
 * Resolve DB path.
 *
 * Priority:
 * 1) explicit arg
 * 2) BP_DB_PATH
 * 3) default apps/api/data/biblia.sqlite
 *
 * Rules:
 * - memory DB URIs are preserved as-is
 * - absolute file paths are preserved
 * - relative arg/env paths resolve against process.cwd()
 */
function resolveDbPath(input?: string): string {
    const envPath = process.env[ENV.DB_PATH]?.trim();
    const raw = (input?.trim() || envPath || defaultDbPath()).trim();

    if (!raw) {
        throw new Error("[bp/db] resolved DB path is empty");
    }

    if (isMemoryDb(raw)) return raw;
    return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(process.cwd(), raw);
}

function validateResolvedPath(
     finalPath: string,
     readonly: boolean,
     isMem: boolean,
): void {
    if (isMem) return;

    if (!finalPath.trim()) {
        throw new Error("[bp/db] resolved DB path is empty");
    }

    if (readonly) {
        if (!fileExists(finalPath)) {
            throw new Error(`[bp/db] readonly DB does not exist: ${finalPath}`);
        }
        return;
    }

    ensureDir(path.dirname(finalPath));
}

function formatOpenError(finalPath: string, error: unknown): Error {
    const err = error as SQLiteError | Error | undefined;
    const code =
         err && typeof err === "object" && "code" in err && typeof err.code === "string"
              ? ` code=${err.code}`
              : "";

    return new Error(
         `[bp/db] failed to open DB at ${normalizePathForLogs(finalPath)}:${code} ${formatUnknownError(error)}`,
    );
}

/* -------------------------------------------------------------------------- */
/* SQLite helpers                                                              */
/* -------------------------------------------------------------------------- */

function execSql(sqlite: Database, sqlText: string): void {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    sqlite.exec(sqlText);
}

function querySingleValue(
     sqlite: Database,
     sqlText: string,
): string | number | bigint | null {
    const row = sqlite.query(sqlText).get() as Record<string, unknown> | undefined;
    if (!row) return null;

    const first = Object.values(row)[0];
    if (
         typeof first === "string" ||
         typeof first === "number" ||
         typeof first === "bigint"
    ) {
        return first;
    }

    return null;
}

function queryPragmaString(sqlite: Database, sqlText: string): string {
    const value = querySingleValue(sqlite, sqlText);
    return typeof value === "string" ? value : String(value ?? "");
}

function queryPragmaNumber(sqlite: Database, sqlText: string): number {
    const value = querySingleValue(sqlite, sqlText);
    const n = Number(value);
    return Number.isFinite(n) ? n : Number.NaN;
}

function pragmaSql(opts: DbPragmas, readonly: boolean): string {
    const lines: string[] = [
        "PRAGMA foreign_keys = ON;",
        "PRAGMA temp_store = MEMORY;",
        `PRAGMA busy_timeout = ${opts.busyTimeoutMs};`,
    ];

    if (typeof opts.cacheSizeKiB === "number") {
        lines.push(`PRAGMA cache_size = -${Math.abs(Math.trunc(opts.cacheSizeKiB))};`);
    }

    if (typeof opts.mmapSizeBytes === "number") {
        lines.push(`PRAGMA mmap_size = ${Math.max(0, Math.trunc(opts.mmapSizeBytes))};`);
    }

    if (!readonly) {
        lines.push(`PRAGMA journal_mode = ${opts.journalMode};`);
        lines.push(`PRAGMA synchronous = ${opts.synchronous};`);
        lines.push(`PRAGMA wal_autocheckpoint = ${opts.walAutoCheckpoint};`);
    }

    return lines.join("\n");
}

function verifyCriticalPragmas(
     sqlite: Database,
     opts: DbPragmas,
     readonly: boolean,
): void {
    const foreignKeys = queryPragmaString(sqlite, "PRAGMA foreign_keys;");
    if (foreignKeys !== "1") {
        throw new Error("[bp/db] failed to enable PRAGMA foreign_keys=ON");
    }

    const tempStore = queryPragmaString(sqlite, "PRAGMA temp_store;");
    if (tempStore !== "2") {
        throw new Error(
             `[bp/db] failed to apply PRAGMA temp_store=MEMORY (got ${tempStore || "empty"})`,
        );
    }

    const busyTimeout = queryPragmaNumber(sqlite, "PRAGMA busy_timeout;");
    if (!Number.isFinite(busyTimeout) || busyTimeout < 0) {
        throw new Error("[bp/db] failed to apply PRAGMA busy_timeout");
    }

    if (readonly) return;

    const journalMode = queryPragmaString(sqlite, "PRAGMA journal_mode;").toUpperCase();
    if (opts.journalMode !== journalMode) {
        throw new Error(
             `[bp/db] requested journal_mode=${opts.journalMode} but got '${journalMode || "(empty)"}'`,
        );
    }

    const walAutoCheckpoint = queryPragmaNumber(sqlite, "PRAGMA wal_autocheckpoint;");
    if (!Number.isFinite(walAutoCheckpoint) || walAutoCheckpoint < 1) {
        throw new Error("[bp/db] failed to apply PRAGMA wal_autocheckpoint");
    }

    const synchronous = queryPragmaNumber(sqlite, "PRAGMA synchronous;");
    if (!Number.isFinite(synchronous)) {
        throw new Error("[bp/db] failed to read PRAGMA synchronous");
    }
}

function applyPragmas(
     sqlite: Database,
     opts: DbPragmas,
     readonly: boolean,
): void {
    execSql(sqlite, pragmaSql(opts, readonly));
    verifyCriticalPragmas(sqlite, opts, readonly);
}

function safeClose(sqlite: Database): void {
    try {
        sqlite.close(false);
    } catch {
        // ignore during shutdown / partial init failure
    }
}

function makeHandleSignature(
     finalPath: string,
     readonly: boolean,
     pragmas: DbPragmas,
): string {
    return JSON.stringify({
        finalPath,
        readonly,
        pragmas,
    });
}

function createDbHandle(options?: string | OpenDbOptions): DbHandle {
    const dbPathInput = typeof options === "string" ? options : options?.dbPath;
    const finalPath = resolveDbPath(dbPathInput);
    const isMem = isMemoryDb(finalPath);
    const readonly =
         typeof options === "object" && typeof options.readonly === "boolean"
              ? options.readonly
              : (!isMem && envBool(ENV.DB_READONLY, false));

    validateResolvedPath(finalPath, readonly, isMem);

    let sqlite: Database;
    try {
        sqlite = readonly
             ? new Database(finalPath, { readonly: true, create: false })
             : new Database(finalPath);
    } catch (error) {
        throw formatOpenError(finalPath, error);
    }

    const pragmas = parseDbPragmasFromEnv();

    try {
        applyPragmas(sqlite, pragmas, readonly);

        const db = drizzle(sqlite, { schema });
        const close = (): void => {
            const singleton = globalThis[GLOBAL_SINGLETON_KEY];
            if (singleton?.handle.sqlite === sqlite) {
                globalThis[GLOBAL_SINGLETON_KEY] = undefined;
            }
            safeClose(sqlite);
        };

        return Object.freeze({
            sqlite,
            db,
            dbPath: finalPath,
            close,
            pragmas,
            readonly,
            isMemory: isMem,
        });
    } catch (error) {
        safeClose(sqlite);
        throw new Error(
             `[bp/db] failed during DB initialization for ${normalizePathForLogs(finalPath)}: ${formatUnknownError(error)}`,
        );
    }
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

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
 *
 * Behavior:
 * - For the module default singleton exports, we reuse a global handle under Bun watch/hot reload.
 * - Direct calls to openDb(...) always return a fresh independent handle.
 */
export function openDb(): DbHandle;
export function openDb(dbPath: string): DbHandle;
export function openDb(options: OpenDbOptions): DbHandle;
export function openDb(arg?: string | OpenDbOptions): DbHandle {
    return createDbHandle(arg);
}

/**
 * Returns a stable process-global singleton handle.
 * Used by module-level exports below to avoid duplicate connections in dev/watch.
 */
export function getDbSingleton(options?: string | OpenDbOptions): DbHandle {
    const dbPathInput = typeof options === "string" ? options : options?.dbPath;
    const finalPath = resolveDbPath(dbPathInput);
    const isMem = isMemoryDb(finalPath);
    const readonly =
         typeof options === "object" && typeof options.readonly === "boolean"
              ? options.readonly
              : (!isMem && envBool(ENV.DB_READONLY, false));
    const pragmas = parseDbPragmasFromEnv();
    const signature = makeHandleSignature(finalPath, readonly, pragmas);

    const existing = globalThis[GLOBAL_SINGLETON_KEY];
    if (existing && existing.signature === signature) {
        return existing.handle;
    }

    if (existing) {
        try {
            existing.handle.close();
        } catch {
            // ignore
        }
    }

    const handle = createDbHandle(options);
    globalThis[GLOBAL_SINGLETON_KEY] = {
        handle,
        signature,
    };

    return handle;
}

/* -------------------------------------------------------------------------- */
/* Default singleton exports                                                   */
/* -------------------------------------------------------------------------- */

const handle = getDbSingleton();

export const sqlite = handle.sqlite;
export const db = handle.db;
export const dbPath = handle.dbPath;
export const pragmas = handle.pragmas;
export const dbReadonly = handle.readonly;
export const dbIsMemory = handle.isMemory;
export const closeDb = handle.close;