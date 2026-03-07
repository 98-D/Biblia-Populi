// apps/api/scripts/reset-db.ts
//
// Biblia.to — hardened Bun-only DB reset
//
// Purpose:
// - delete the SQLite database file and sidecar artifacts
// - run migrate then seed
//
// Usage:
//   bun --cwd apps/api run db:reset
//
// Env:
//   BP_DB_PATH=./data/biblia.sqlite
//   BP_ALLOW_DB_RESET=1               optional explicit guard
//   BP_DB_RESET_SKIP_SEED=1           optional
//   BP_DB_RESET_SKIP_MIGRATE=1        optional
//   BP_DB_RESET_FORCE=1               bypass env guard / prod-ish refusal
//
// Notes:
// - Handles WAL / SHM / JOURNAL artifacts
// - Refuses to operate on memory DB targets; falls back to default file path
// - Uses Bun.spawn only
// - Resolves Bun executable robustly
// - Anchors paths from apps/api root, not arbitrary cwd
// - Guards destructive reset in prod-ish environments unless forced

import * as fs from "node:fs";
import * as path from "node:path";
import * as process from "node:process";

type Spawned = ReturnType<typeof Bun.spawn>;

const APP_ROOT = path.resolve(import.meta.dir, "..");
const DEFAULT_DB_PATH = path.join(APP_ROOT, "data", "biblia.sqlite");

function log(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.log("[db:reset]", ...args);
}

function warn(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.warn("[db:reset]", ...args);
}

function fatal(...args: unknown[]): never {
    // eslint-disable-next-line no-console
    console.error("[db:reset]", ...args);
    process.exit(1);
}

function envStr(name: string, fallback = ""): string {
    const raw = process.env[name];
    if (typeof raw !== "string") return fallback;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

function envBool(name: string, fallback = false): boolean {
    const raw = envStr(name, "");
    if (!raw) return fallback;

    switch (raw.toLowerCase()) {
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

function formatError(error: unknown): string {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
    }
    return String(error);
}

function inspectErrorCode(error: unknown): string | undefined {
    if (typeof error !== "object" || error === null) return undefined;
    if (!("code" in error)) return undefined;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
}

function isMemoryDb(p: string): boolean {
    const s = p.trim().toLowerCase();
    return s === ":memory:" || s.startsWith("file::memory:");
}

function isLikelyProdEnv(): boolean {
    const nodeEnv = envStr("NODE_ENV", "").toLowerCase();
    const appEnv = envStr("BP_ENV", "").toLowerCase();

    return nodeEnv === "production" || appEnv === "production";
}

function resolveDbPath(): string {
    const raw = envStr("BP_DB_PATH", "");

    if (!raw) return DEFAULT_DB_PATH;
    if (isMemoryDb(raw)) {
        warn(`BP_DB_PATH=${raw} points to memory DB; using file-backed fallback instead: ${DEFAULT_DB_PATH}`);
        return DEFAULT_DB_PATH;
    }

    return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(APP_ROOT, raw);
}

function resolveBunExecutable(): string {
    const fromExecPath = envStr("BUN_EXEC_PATH", "") || (process.execPath ?? "").trim();
    if (fromExecPath && fromExecPath.toLowerCase().includes("bun")) {
        return fromExecPath;
    }

    const fromWhich = Bun.which("bun");
    if (fromWhich) return fromWhich;

    fatal(
         "unable to resolve Bun executable path",
         JSON.stringify({
             processExecPath: process.execPath ?? null,
             appRoot: APP_ROOT,
             hint: "Run this script with Bun, not node.",
         }),
    );
}

function ensureSafeToReset(dbPath: string): void {
    const force = envBool("BP_DB_RESET_FORCE", false);
    const allow = envBool("BP_ALLOW_DB_RESET", false);

    if (force) {
        warn("BP_DB_RESET_FORCE=1 -> bypassing reset safety guard");
        return;
    }

    if (isLikelyProdEnv()) {
        fatal("refusing db reset in production environment; set BP_DB_RESET_FORCE=1 to override");
    }

    if (!allow) {
        fatal("db reset is destructive; set BP_ALLOW_DB_RESET=1 to proceed");
    }

    if (!path.isAbsolute(dbPath)) {
        fatal("resolved DB path is not absolute:", dbPath);
    }

    const normalizedAppRoot = path.normalize(APP_ROOT + path.sep);
    const normalizedDbPath = path.normalize(dbPath);

    if (!normalizedDbPath.startsWith(normalizedAppRoot)) {
        fatal("refusing to delete DB outside apps/api root:", dbPath);
    }
}

function safeMkdir(dirPath: string): void {
    try {
        fs.mkdirSync(dirPath, { recursive: true });
    } catch (error: unknown) {
        fatal("failed to create directory:", dirPath, formatError(error));
    }
}

function safeUnlink(filePath: string): boolean {
    try {
        fs.unlinkSync(filePath);
        return true;
    } catch (error: unknown) {
        const code = inspectErrorCode(error);
        if (code === "ENOENT") return false;
        throw error;
    }
}

function deleteDbArtifacts(dbPath: string): { deleted: string[]; missing: string[] } {
    const targets = [
        dbPath,
        `${dbPath}-wal`,
        `${dbPath}-shm`,
        `${dbPath}-journal`,
    ];

    const deleted: string[] = [];
    const missing: string[] = [];

    for (const target of targets) {
        const removed = safeUnlink(target);
        if (removed) {
            deleted.push(target);
        } else {
            missing.push(target);
        }
    }

    return { deleted, missing };
}

async function run(args: string[], extraEnv?: Record<string, string>): Promise<void> {
    const bunExe = resolveBunExecutable();
    const cmd = [bunExe, ...args];

    log("spawn:", cmd.join(" "));

    const proc: Spawned = Bun.spawn({
        cmd,
        cwd: APP_ROOT,
        stdout: "inherit",
        stderr: "inherit",
        env: {
            ...process.env,
            ...(extraEnv ?? {}),
        },
    });

    const code = await proc.exited;
    if (code !== 0) {
        fatal("command failed:", cmd.join(" "), "exit", code);
    }
}

async function main(): Promise<void> {
    const dbPath = resolveDbPath();
    const skipMigrate = envBool("BP_DB_RESET_SKIP_MIGRATE", false);
    const skipSeed = envBool("BP_DB_RESET_SKIP_SEED", false);

    ensureSafeToReset(dbPath);

    log("appRoot:", APP_ROOT);
    log("dbPath:", dbPath);

    safeMkdir(path.dirname(dbPath));

    try {
        const { deleted, missing } = deleteDbArtifacts(dbPath);

        if (deleted.length > 0) {
            for (const filePath of deleted) {
                log("deleted:", filePath);
            }
        } else {
            log("no db artifacts deleted");
        }

        if (missing.length > 0) {
            log("missing:", missing.length, "artifact(s)");
        }
    } catch (error: unknown) {
        fatal("failed to delete db artifacts:", formatError(error));
    }

    if (!skipMigrate) {
        await run(["run", "src/db/migrate.ts"]);
    } else {
        warn("BP_DB_RESET_SKIP_MIGRATE=1 -> skipping migrate");
    }

    if (!skipSeed) {
        await run(["run", "src/db/seed.ts"]);
    } else {
        warn("BP_DB_RESET_SKIP_SEED=1 -> skipping seed");
    }

    log("done.");
}

void main().catch((error: unknown) => {
    fatal("unhandled failure:", formatError(error));
});