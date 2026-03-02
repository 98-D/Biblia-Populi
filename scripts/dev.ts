// scripts/dev.ts
// Biblia Populi — root dev runner (Bun-first)
// Run from repo root:
//   bun run dev
//
// Starts:
// - apps/api (bun --watch src/server.ts via package script "dev")
// - apps/web (vite via package script "dev")
//
// Extras:
// - Ensures API DB is bootstrapped (migrate + seed) unless BP_DEV_SKIP_DB=1
// - Optionally runs OSIS import if BP_DEV_IMPORT_OSIS points to a file
// - Clean shutdown on Ctrl+C / SIGTERM
//
// Notes:
// - Uses Bun.spawn (global). No Node child_process.
// - Uses Bun.which to locate bun if needed.

import * as path from "node:path";
import * as process from "node:process";
import * as fs from "node:fs";

type BunSubprocess = ReturnType<typeof Bun.spawn>;
type Proc = { name: string; proc: BunSubprocess };

const ROOT = process.cwd();
const API_CWD = path.join(ROOT, "apps", "api");
const WEB_CWD = path.join(ROOT, "apps", "web");

const procs: Proc[] = [];
let shuttingDown = false;

function envBool(name: string): boolean {
    const v = (process.env[name] ?? "").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
}

function bunBin(): string {
    // Usually bun is the current execPath, but if not, resolve via PATH.
    if (process.execPath.toLowerCase().includes("bun")) return process.execPath;
    return Bun.which("bun") ?? "bun";
}

async function runOnce(name: string, cwd: string, cmd: string[], extraEnv?: Record<string, string>): Promise<void> {
    console.log(`[dev] > (${name}) ${cmd.join(" ")}`);

    const p = Bun.spawn({
        cmd,
        cwd,
        stdout: "inherit",
        stderr: "inherit",
        env: { ...process.env, ...(extraEnv ?? {}) },
    });

    const code: number = await p.exited;
    if (code !== 0) {
        throw new Error(`[dev] ${name} failed (exit ${code})`);
    }
}

function runLong(name: string, cwd: string, cmd: string[], extraEnv?: Record<string, string>): Proc {
    console.log(`[dev] + (${name}) ${cmd.join(" ")}`);

    const p = Bun.spawn({
        cmd,
        cwd,
        stdout: "inherit",
        stderr: "inherit",
        env: { ...process.env, ...(extraEnv ?? {}) },
    });

    // If any long-running process exits unexpectedly, shut everything down.
    p.exited.then((code: number) => {
        if (shuttingDown) return;
        console.error(`\n[dev] ${name} exited (exit ${code})`);
        shutdown(code === 0 ? 0 : 1);
    });

    return { name, proc: p };
}

function shutdown(exitCode = 0): void {
    if (shuttingDown) return;
    shuttingDown = true;

    for (const p of procs) {
        try {
            p.proc.kill();
        } catch {
            // ignore
        }
    }

    setTimeout(() => process.exit(exitCode), 200);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function apiHasScript(scriptName: string): boolean {
    // check apps/api/package.json scripts
    try {
        const pjPath = path.join(API_CWD, "package.json");
        const txt = fs.readFileSync(pjPath, "utf8");
        const json = JSON.parse(txt) as { scripts?: Record<string, string> };
        return Boolean(json.scripts && Object.prototype.hasOwnProperty.call(json.scripts, scriptName));
    } catch {
        return false;
    }
}

async function bootstrapDb(bunPath: string): Promise<void> {
    if (envBool("BP_DEV_SKIP_DB")) {
        console.log("[dev] BP_DEV_SKIP_DB=1 -> skipping db bootstrap");
        return;
    }

    await runOnce("api:db:bootstrap", API_CWD, [bunPath, "run", "db:bootstrap"]);

    const osisPath = (process.env.BP_DEV_IMPORT_OSIS ?? "").trim();
    if (osisPath) {
        await runOnce("api:import:osis", API_CWD, [bunPath, "run", "import:osis", osisPath], {
            // If you want import to set KJV default automatically:
            // BP_IMPORT_SET_DEFAULT: "1",
        });

        if (apiHasScript("db:verify")) {
            await runOnce("api:db:verify", API_CWD, [bunPath, "run", "db:verify"]);
        } else {
            console.log("[dev] (note) apps/api has no db:verify script; skipping");
        }
    }
}

async function main(): Promise<void> {
    const bunPath = bunBin();

    console.log("\n=== Biblia Populi Dev ===");
    console.log("ROOT:", ROOT);
    console.log("API :", API_CWD);
    console.log("WEB :", WEB_CWD);
    console.log("BUN :", bunPath);
    console.log("");

    try {
        await bootstrapDb(bunPath);
    } catch (e) {
        console.error(String(e));
        process.exit(1);
    }

    procs.push(runLong("api", API_CWD, [bunPath, "run", "dev"]));
    procs.push(
        runLong("web", WEB_CWD, [bunPath, "run", "dev"], {
            // Optional:
            // VITE_API_BASE: "http://localhost:3000",
        }),
    );

    console.log("\n[dev] running. Ctrl+C to stop.\n");
}

main().catch((e) => {
    console.error("[dev] fatal:", e);
    shutdown(1);
});