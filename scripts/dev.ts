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
// - Optional: verify DB after bootstrap/import if apps/api has db:verify script
// - Clean shutdown on Ctrl+C / SIGTERM
//
// Notes:
// - Uses Bun.spawn only (no Node child_process).
// - Uses Bun.which to locate bun if needed.
// - Better logs, env toggles, and stronger shutdown behavior.

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

/* --------------------------------- helpers -------------------------------- */

function envStr(name: string, fallback = ""): string {
    const v = (process.env[name] ?? "").trim();
    return v || fallback;
}

function envBool(name: string): boolean {
    const v = (process.env[name] ?? "").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
}

function nowStamp(): string {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
}

function log(...args: unknown[]) {
    // eslint-disable-next-line no-console
    console.log(`[dev ${nowStamp()}]`, ...args);
}

function warn(...args: unknown[]) {
    // eslint-disable-next-line no-console
    console.warn(`[dev ${nowStamp()}]`, ...args);
}

function errlog(...args: unknown[]) {
    // eslint-disable-next-line no-console
    console.error(`[dev ${nowStamp()}]`, ...args);
}

function bunBin(): string {
    // Usually bun is the current execPath, but if not, resolve via PATH.
    const ep = (process.execPath ?? "").toLowerCase();
    if (ep.includes("bun")) return process.execPath;
    return Bun.which("bun") ?? "bun";
}

async function runOnce(name: string, cwd: string, cmd: string[], extraEnv?: Record<string, string>): Promise<void> {
    log(`> (${name}) ${cmd.join(" ")}`);

    const p = Bun.spawn({
        cmd,
        cwd,
        stdout: "inherit",
        stderr: "inherit",
        env: { ...process.env, ...(extraEnv ?? {}) },
    });

    const code = await p.exited;
    if (code !== 0) throw new Error(`${name} failed (exit ${code})`);
}

function runLong(name: string, cwd: string, cmd: string[], extraEnv?: Record<string, string>): Proc {
    log(`+ (${name}) ${cmd.join(" ")}`);

    const p = Bun.spawn({
        cmd,
        cwd,
        stdout: "inherit",
        stderr: "inherit",
        env: { ...process.env, ...(extraEnv ?? {}) },
    });

    // If any long-running process exits unexpectedly, shut everything down.
    p.exited.then((code) => {
        if (shuttingDown) return;
        errlog(`${name} exited (exit ${code})`);
        shutdown(code === 0 ? 0 : 1);
    });

    return { name, proc: p };
}

function shutdown(exitCode = 0): void {
    if (shuttingDown) return;
    shuttingDown = true;

    // Try graceful first
    for (const p of procs) {
        try {
            p.proc.kill("SIGTERM");
        } catch {
            // ignore
        }
    }

    // Then hard-kill if still around
    setTimeout(() => {
        for (const p of procs) {
            try {
                p.proc.kill("SIGKILL");
            } catch {
                // ignore
            }
        }
        process.exit(exitCode);
    }, 300);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("uncaughtException", (e) => {
    errlog("uncaughtException:", e);
    shutdown(1);
});
process.on("unhandledRejection", (e) => {
    errlog("unhandledRejection:", e);
    shutdown(1);
});

function readJsonFile<T>(filePath: string): T | null {
    try {
        const txt = fs.readFileSync(filePath, "utf8");
        return JSON.parse(txt) as T;
    } catch {
        return null;
    }
}

function apiHasScript(scriptName: string): boolean {
    const pjPath = path.join(API_CWD, "package.json");
    const json = readJsonFile<{ scripts?: Record<string, string> }>(pjPath);
    return Boolean(json?.scripts && Object.prototype.hasOwnProperty.call(json.scripts, scriptName));
}

function fileExists(p: string): boolean {
    try {
        return fs.existsSync(p);
    } catch {
        return false;
    }
}

/* -------------------------------- bootstrap -------------------------------- */

async function bootstrapDb(bunPath: string): Promise<void> {
    if (envBool("BP_DEV_SKIP_DB")) {
        log("BP_DEV_SKIP_DB=1 -> skipping db bootstrap");
        return;
    }

    // Prefer db:bootstrap if present; otherwise migrate+seed.
    if (apiHasScript("db:bootstrap")) {
        await runOnce("api:db:bootstrap", API_CWD, [bunPath, "run", "db:bootstrap"]);
    } else {
        warn("apps/api has no db:bootstrap script; falling back to db:migrate + db:seed");
        if (apiHasScript("db:migrate")) await runOnce("api:db:migrate", API_CWD, [bunPath, "run", "db:migrate"]);
        if (apiHasScript("db:seed")) await runOnce("api:db:seed", API_CWD, [bunPath, "run", "db:seed"]);
    }

    // Optional OSIS import
    const osisPath = envStr("BP_DEV_IMPORT_OSIS", "");
    if (osisPath) {
        if (!fileExists(osisPath)) {
            warn("BP_DEV_IMPORT_OSIS was set but file does not exist:", osisPath);
        } else if (apiHasScript("import:osis")) {
            // Prefer script; if it expects a path argument, pass it.
            await runOnce("api:import:osis", API_CWD, [bunPath, "run", "import:osis", osisPath], {
                // Optional knobs:
                // BP_IMPORT_SET_DEFAULT: "1",
            });
        } else {
            warn("apps/api has no import:osis script; skipping import");
        }
    }

    // Optional verify
    if (envBool("BP_DEV_VERIFY_DB") && apiHasScript("db:verify")) {
        await runOnce("api:db:verify", API_CWD, [bunPath, "run", "db:verify"]);
    }
}

/* ---------------------------------- main ---------------------------------- */

async function main(): Promise<void> {
    const bunPath = bunBin();

    log("=== Biblia Populi Dev ===");
    log("ROOT:", ROOT);
    log("API :", API_CWD);
    log("WEB :", WEB_CWD);
    log("BUN :", bunPath);

    // Basic sanity (helps when run from wrong folder)
    if (!fileExists(path.join(API_CWD, "package.json"))) {
        throw new Error(`apps/api not found at ${API_CWD} (run from repo root)`);
    }
    if (!fileExists(path.join(WEB_CWD, "package.json"))) {
        throw new Error(`apps/web not found at ${WEB_CWD} (run from repo root)`);
    }

    await bootstrapDb(bunPath);

    // Optional env overrides for web dev server (handy for remote api)
    const viteApiBase = envStr("BP_DEV_VITE_API_BASE", "");
    const webEnv = viteApiBase ? { VITE_API_BASE: viteApiBase } : undefined;

    procs.push(runLong("api", API_CWD, [bunPath, "run", "dev"]));
    procs.push(runLong("web", WEB_CWD, [bunPath, "run", "dev"], webEnv));

    log("running. Ctrl+C to stop.");
}

main().catch((e) => {
    errlog("fatal:", e);
    shutdown(1);
});