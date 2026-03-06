// apps/api/scripts/reset-db.ts
//
// Bun-only DB reset:
// - deletes the sqlite file (default or BP_DB_PATH)
// - runs migrate then seed (through TS entrypoints)
//
// Usage:
//   bun --cwd apps/api run db:reset
//
// Notes:
// - Handles WAL / SHM / JOURNAL artifacts
// - Refuses to delete ":memory:" paths (will fall back to default file path)
// - Uses Bun.spawn (bun-only), no Node child_process
// - On Windows, resolves the real Bun executable path instead of assuming "bun" is on spawn PATH

import * as path from "node:path";
import * as fs from "node:fs";

type Spawned = ReturnType<typeof Bun.spawn>;

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
    const s = (p ?? "").trim();
    return s === ":memory:" || s.startsWith("file::memory:");
}

function resolveDbPath(): string {
    const raw = (process.env.BP_DB_PATH ?? "").trim();

    if (!raw) return path.resolve(process.cwd(), "data", "biblia.sqlite");
    if (isMemoryDb(raw)) return path.resolve(process.cwd(), "data", "biblia.sqlite");

    return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

function resolveBunExecutable(): string {
    // Bun exposes the current executable path here in Bun runtime.
    const fromExecPath = (process.execPath ?? "").trim();
    if (fromExecPath) return fromExecPath;

    const fromWhich = Bun.which("bun");
    if (fromWhich) return fromWhich;

    fatal(
        "unable to resolve Bun executable path.",
        JSON.stringify({
            processExecPath: process.execPath ?? null,
            hint: "Run this script with Bun, not node.",
        }),
    );
}

async function run(cmd: string[], env?: Record<string, string>) {
    const bunExe = resolveBunExecutable();
    const fullCmd = [bunExe, ...cmd];

    log("spawn:", fullCmd.join(" "));

    const p: Spawned = Bun.spawn({
        cmd: fullCmd,
        cwd: process.cwd(),
        stdout: "inherit",
        stderr: "inherit",
        env: { ...process.env, ...(env ?? {}) },
    });

    const code = await p.exited;
    if (code !== 0) fatal("command failed:", fullCmd.join(" "), "exit", code);
}

function safeUnlink(filePath: string): void {
    try {
        fs.unlinkSync(filePath);
    } catch (e: any) {
        if (e?.code === "ENOENT") return;
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

function deleteDbArtifacts(dbPath: string) {
    if (fs.existsSync(dbPath)) {
        log("deleting:", dbPath);
        safeUnlink(dbPath);
    } else {
        log("no db file to delete");
    }

    safeUnlink(dbPath + "-wal");
    safeUnlink(dbPath + "-shm");
    safeUnlink(dbPath + "-journal");
}

async function main() {
    const dbPath = resolveDbPath();
    log("dbPath:", dbPath);

    if (!isMemoryDb(dbPath)) {
        safeMkdir(path.dirname(dbPath));
    }

    try {
        deleteDbArtifacts(dbPath);
    } catch (e) {
        fatal("failed to delete db artifacts:", e);
    }

    await run(["src/db/migrate.ts"]);
    await run(["src/db/seed.ts"]);

    log("done.");
}

main().catch((e) => fatal(e));