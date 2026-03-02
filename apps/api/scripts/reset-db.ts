// apps/api/scripts/reset-db.ts
//
// Bun-only DB reset:
// - deletes the sqlite file (default or BP_DB_PATH)
// - runs db:migrate then db:seed
//
// Usage:
//   bun --cwd apps/api run db:reset

import * as path from "node:path";
import * as fs from "node:fs";
import { spawn } from "bun";

function log(...args: unknown[]) {
    // eslint-disable-next-line no-console
    console.log("[db:reset]", ...args);
}

function fatal(...args: unknown[]): never {
    // eslint-disable-next-line no-console
    console.error("[db:reset]", ...args);
    process.exit(1);
}

function isMemoryDb(p: string): boolean {
    return p === ":memory:" || p.startsWith("file::memory:");
}

function resolveDbPath(): string {
    const raw = (process.env.BP_DB_PATH ?? "").trim();
    if (!raw) return path.resolve(process.cwd(), "data", "biblia.sqlite");
    if (isMemoryDb(raw)) return path.resolve(process.cwd(), "data", "biblia.sqlite");
    return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

async function run(cmd: string[], env?: Record<string, string>) {
    const p = spawn({
        cmd,
        cwd: process.cwd(),
        stdout: "inherit",
        stderr: "inherit",
        env: { ...process.env, ...(env ?? {}) },
    });
    const code = await p.exited;
    if (code !== 0) fatal("command failed:", cmd.join(" "), "exit", code);
}

function safeUnlink(filePath: string): void {
    try {
        fs.unlinkSync(filePath);
    } catch (e: any) {
        if (e?.code === "ENOENT") return; // already gone
        throw e;
    }
}

function safeMkdir(dir: string): void {
    try {
        fs.mkdirSync(dir, { recursive: true });
    } catch {
        // ignore; will fail later if truly unwritable
    }
}

async function main() {
    const dbPath = resolveDbPath();
    log("dbPath:", dbPath);

    if (!isMemoryDb(dbPath)) {
        safeMkdir(path.dirname(dbPath));
    }

    // Delete DB file if it exists (and any common journal/wal artifacts)
    try {
        if (fs.existsSync(dbPath)) {
            log("deleting:", dbPath);
            safeUnlink(dbPath);
        } else {
            log("no db file to delete");
        }

        // If WAL mode was used, these may exist
        safeUnlink(dbPath + "-wal");
        safeUnlink(dbPath + "-shm");
        safeUnlink(dbPath + "-journal");
    } catch (e) {
        fatal("failed to delete db artifacts:", e);
    }

    // Recreate schema + extras + seed metadata
    await run(["bun", "src/db/migrate.ts"]);
    await run(["bun", "src/db/seed.ts"]);

    log("done.");
}

main().catch((e) => fatal(e));