// scripts/prod.ts
// Biblia.to — root production runner (Bun-first, hardened)
//
// Run from repo root:
//   bun scripts/prod.ts
//   bun run prod
//
// Purpose:
// - Optional root preflight
// - Optional API DB bootstrap / verify
// - Build web/api if requested
// - Start API and/or preview web in "production-ish" local mode
// - Graceful shutdown with escalation
// - Prefixed child logs
//
// This is for local/staging/prod-like orchestration from the monorepo root.
// It is not a replacement for Docker/systemd/k8s, but it's excellent for
// single-machine deployment and validation.
//
// Env / flags:
//
// Service control:
//   BP_PROD_NO_API=1
//   BP_PROD_NO_WEB=1
//
// Scripts:
//   BP_PROD_API_START_SCRIPT=start        default: start
//   BP_PROD_WEB_START_SCRIPT=preview      default: preview
//   BP_PROD_BUILD_API_SCRIPT=build        default: build
//   BP_PROD_BUILD_WEB_SCRIPT=build        default: build
//
// Build / bootstrap:
//   BP_PROD_SKIP_BUILD=1
//   BP_PROD_SKIP_DB=1
//   BP_PROD_VERIFY_DB=1
//
// API health:
//   BP_PROD_WAIT_FOR_API=1                default: 1
//   BP_PROD_API_HEALTH_URL=http://localhost:3000/health
//   BP_PROD_API_HEALTH_TIMEOUT_MS=45000
//   BP_PROD_API_HEALTH_INTERVAL_MS=500
//
// Web preview env passthrough:
//   BP_PROD_VITE_API_BASE=http://localhost:3000
//
// Shutdown:
//   BP_PROD_SHUTDOWN_GRACE_MS=4000
//
// Examples:
//   bun scripts/prod.ts
//   BP_PROD_VERIFY_DB=1 bun scripts/prod.ts
//   BP_PROD_NO_WEB=1 bun scripts/prod.ts
//   BP_PROD_SKIP_BUILD=1 bun scripts/prod.ts

import * as fs from "node:fs";
import * as path from "node:path";
import * as process from "node:process";

type BunSubprocess = ReturnType<typeof Bun.spawn>;
type ServiceName = "api" | "web";

type Proc = {
    name: ServiceName;
    proc: BunSubprocess;
    stdoutDone: Promise<void>;
    stderrDone: Promise<void>;
};

type PackageJson = {
    name?: string;
    scripts?: Record<string, string>;
};

const ROOT = process.cwd();
const API_CWD = path.join(ROOT, "apps", "api");
const WEB_CWD = path.join(ROOT, "apps", "web");

const procs: Proc[] = [];
let shuttingDown = false;
let finalized = false;

/* -------------------------------------------------------------------------- */
/*                                   helpers                                  */
/* -------------------------------------------------------------------------- */

function nowStamp(): string {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
}

function log(...args: unknown[]): void {
    console.log(`[prod ${nowStamp()}]`, ...args);
}

function warn(...args: unknown[]): void {
    console.warn(`[prod ${nowStamp()}]`, ...args);
}

function errlog(...args: unknown[]): void {
    console.error(`[prod ${nowStamp()}]`, ...args);
}

function envStr(name: string, fallback = ""): string {
    const v = process.env[name];
    if (typeof v !== "string") return fallback;
    const s = v.trim();
    return s || fallback;
}

function envInt(name: string, fallback: number): number {
    const raw = envStr(name, "");
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
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

function exists(p: string): boolean {
    try {
        return fs.existsSync(p);
    } catch {
        return false;
    }
}

function isDirectory(p: string): boolean {
    try {
        return fs.statSync(p).isDirectory();
    } catch {
        return false;
    }
}

function bunBin(): string {
    const execPath = String(process.execPath ?? "");
    if (execPath.toLowerCase().includes("bun")) return execPath;
    return Bun.which("bun") ?? "bun";
}

function readJsonFile<T>(filePath: string): T | null {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
    } catch {
        return null;
    }
}

function readPackageJson(pkgDir: string): PackageJson {
    const pkgPath = path.join(pkgDir, "package.json");
    const pkg = readJsonFile<PackageJson>(pkgPath);
    if (!pkg) throw new Error(`invalid or missing package.json at ${pkgPath}`);
    return pkg;
}

function hasScript(pkgDir: string, scriptName: string): boolean {
    const pkg = readPackageJson(pkgDir);
    return Boolean(pkg.scripts && Object.prototype.hasOwnProperty.call(pkg.scripts, scriptName));
}

function assertRepoShape(): void {
    if (!exists(path.join(ROOT, "package.json"))) {
        throw new Error(`missing package.json at ${ROOT}`);
    }
    if (!isDirectory(API_CWD)) {
        throw new Error(`apps/api not found at ${API_CWD}`);
    }
    if (!isDirectory(WEB_CWD)) {
        throw new Error(`apps/web not found at ${WEB_CWD}`);
    }
}

function assertScript(pkgDir: string, scriptName: string, label: string): void {
    if (!hasScript(pkgDir, scriptName)) {
        throw new Error(`${label} script "${scriptName}" not found in ${path.join(pkgDir, "package.json")}`);
    }
}

async function waitMs(ms: number): Promise<void> {
    await Bun.sleep(ms);
}

function serviceLog(name: ServiceName, stream: "stdout" | "stderr", line: string): void {
    const prefix = `[${name}:${stream}]`;
    if (stream === "stderr") console.error(prefix, line);
    else console.log(prefix, line);
}

async function pumpStream(
    name: ServiceName,
    streamName: "stdout" | "stderr",
    stream: ReadableStream<Uint8Array> | null | undefined,
): Promise<void> {
    if (!stream) return;

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let carry = "";

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            carry += decoder.decode(value, { stream: true });

            for (;;) {
                const nl = carry.indexOf("\n");
                if (nl < 0) break;

                let line = carry.slice(0, nl);
                carry = carry.slice(nl + 1);

                if (line.endsWith("\r")) line = line.slice(0, -1);
                if (line.length > 0) serviceLog(name, streamName, line);
            }
        }

        carry += decoder.decode();
        const finalLine = carry.replace(/\r$/, "");
        if (finalLine.length > 0) serviceLog(name, streamName, finalLine);
    } catch (e) {
        if (!shuttingDown) errlog(`${name} ${streamName} pump failed:`, e);
    } finally {
        try {
            reader.releaseLock();
        } catch {
            // ignore
        }
    }
}

async function runOnce(
    name: string,
    cwd: string,
    cmd: string[],
    extraEnv?: Record<string, string>,
): Promise<void> {
    log(`> (${name}) ${cmd.join(" ")}`);

    const p = Bun.spawn({
        cmd,
        cwd,
        env: { ...process.env, ...(extraEnv ?? {}) },
        stdout: "inherit",
        stderr: "inherit",
    });

    const code = await p.exited;
    if (code !== 0) {
        throw new Error(`${name} failed (exit ${code})`);
    }
}

function runLong(
    name: ServiceName,
    cwd: string,
    cmd: string[],
    extraEnv?: Record<string, string>,
): Proc {
    log(`+ (${name}) ${cmd.join(" ")}`);

    const proc = Bun.spawn({
        cmd,
        cwd,
        env: { ...process.env, ...(extraEnv ?? {}) },
        stdout: "pipe",
        stderr: "pipe",
    });

    const stdoutDone = pumpStream(name, "stdout", proc.stdout);
    const stderrDone = pumpStream(name, "stderr", proc.stderr);

    proc.exited.then((code) => {
        if (shuttingDown) return;
        const exitCode = typeof code === "number" ? code : 1;
        errlog(`${name} exited with code ${exitCode}`);
        void shutdown(exitCode === 0 ? 1 : exitCode, `${name} exited`);
    });

    return { name, proc, stdoutDone, stderrDone };
}

async function shutdown(exitCode = 0, reason = "shutdown"): Promise<never> {
    if (finalized) process.exit(exitCode);

    if (shuttingDown) {
        return new Promise<never>(() => {
            /* never resolves */
        });
    }

    shuttingDown = true;

    const graceMs = Math.max(100, envInt("BP_PROD_SHUTDOWN_GRACE_MS", 4000));
    log(`shutting down (${reason})...`);

    for (const p of procs) {
        try {
            p.proc.kill("SIGTERM");
        } catch {
            // ignore
        }
    }

    await Promise.allSettled(
        procs.map(async (p) => {
            try {
                await Promise.race([p.proc.exited, waitMs(graceMs)]);
            } catch {
                // ignore
            }
        }),
    );

    for (const p of procs) {
        try {
            p.proc.kill("SIGKILL");
        } catch {
            // ignore
        }
    }

    await Promise.allSettled(
        procs.flatMap((p) => [p.stdoutDone, p.stderrDone]),
    );

    finalized = true;
    process.exit(exitCode);
}

async function waitForApiHealth(): Promise<void> {
    const enabled = envBool("BP_PROD_WAIT_FOR_API", true);
    if (!enabled) {
        log("BP_PROD_WAIT_FOR_API=0 -> skipping API health wait");
        return;
    }

    const url = envStr("BP_PROD_API_HEALTH_URL", "http://localhost:3000/health");
    const timeoutMs = Math.max(1000, envInt("BP_PROD_API_HEALTH_TIMEOUT_MS", 45_000));
    const intervalMs = Math.max(100, envInt("BP_PROD_API_HEALTH_INTERVAL_MS", 500));

    log(`waiting for API health: ${url}`);

    const start = Date.now();
    let lastErr: unknown = null;

    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(url, {
                method: "GET",
                headers: { accept: "application/json,text/plain,*/*" },
            });

            if (res.ok) {
                log(`API healthy (${res.status})`);
                return;
            }

            lastErr = new Error(`health returned ${res.status}`);
        } catch (e) {
            lastErr = e;
        }

        await waitMs(intervalMs);
    }

    throw new Error(`API health check timed out after ${timeoutMs}ms (${String(lastErr ?? "unknown error")})`);
}

/* -------------------------------------------------------------------------- */
/*                                prod workflow                               */
/* -------------------------------------------------------------------------- */

async function bootstrapDb(bunPath: string): Promise<void> {
    if (envBool("BP_PROD_SKIP_DB")) {
        log("BP_PROD_SKIP_DB=1 -> skipping DB bootstrap");
        return;
    }

    if (hasScript(API_CWD, "db:bootstrap")) {
        await runOnce("api:db:bootstrap", API_CWD, [bunPath, "run", "db:bootstrap"]);
    } else {
        warn(`apps/api has no "db:bootstrap"; falling back to db:migrate + db:seed`);

        if (hasScript(API_CWD, "db:migrate")) {
            await runOnce("api:db:migrate", API_CWD, [bunPath, "run", "db:migrate"]);
        }
        if (hasScript(API_CWD, "db:seed")) {
            await runOnce("api:db:seed", API_CWD, [bunPath, "run", "db:seed"]);
        }
    }

    if (envBool("BP_PROD_VERIFY_DB") && hasScript(API_CWD, "db:verify")) {
        await runOnce("api:db:verify", API_CWD, [bunPath, "run", "db:verify"]);
    }
}

async function buildIfNeeded(
    bunPath: string,
    noApi: boolean,
    noWeb: boolean,
    apiBuildScript: string,
    webBuildScript: string,
): Promise<void> {
    if (envBool("BP_PROD_SKIP_BUILD")) {
        log("BP_PROD_SKIP_BUILD=1 -> skipping builds");
        return;
    }

    if (!noApi) {
        assertScript(API_CWD, apiBuildScript, "apps/api");
        await runOnce("api:build", API_CWD, [bunPath, "run", apiBuildScript]);
    }

    if (!noWeb) {
        assertScript(WEB_CWD, webBuildScript, "apps/web");
        await runOnce("web:build", WEB_CWD, [bunPath, "run", webBuildScript]);
    }
}

/* -------------------------------------------------------------------------- */
/*                                    main                                    */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
    const bunPath = bunBin();

    const noApi = envBool("BP_PROD_NO_API");
    const noWeb = envBool("BP_PROD_NO_WEB");

    const apiStartScript = envStr("BP_PROD_API_START_SCRIPT", "start");
    const webStartScript = envStr("BP_PROD_WEB_START_SCRIPT", "preview");
    const apiBuildScript = envStr("BP_PROD_BUILD_API_SCRIPT", "build");
    const webBuildScript = envStr("BP_PROD_BUILD_WEB_SCRIPT", "build");

    log("=== Biblia.to Prod ===");
    log("ROOT:", ROOT);
    log("API :", API_CWD);
    log("WEB :", WEB_CWD);
    log("BUN :", bunPath);

    assertRepoShape();

    if (noApi && noWeb) {
        throw new Error("both BP_PROD_NO_API=1 and BP_PROD_NO_WEB=1 were set; nothing to run");
    }

    if (!noApi) {
        assertScript(API_CWD, apiStartScript, "apps/api");
    }
    if (!noWeb) {
        assertScript(WEB_CWD, webStartScript, "apps/web");
    }

    if (!noApi) {
        await bootstrapDb(bunPath);
    } else {
        log("BP_PROD_NO_API=1 -> skipping DB bootstrap");
    }

    await buildIfNeeded(bunPath, noApi, noWeb, apiBuildScript, webBuildScript);

    if (!noApi) {
        procs.push(runLong("api", API_CWD, [bunPath, "run", apiStartScript]));
    }

    if (!noApi && !noWeb) {
        await waitForApiHealth();
    }

    if (!noWeb) {
        const viteApiBase = envStr("BP_PROD_VITE_API_BASE", "");
        const webEnv = viteApiBase ? { VITE_API_BASE: viteApiBase } : undefined;
        procs.push(runLong("web", WEB_CWD, [bunPath, "run", webStartScript], webEnv));
    }

    log("running. Press Ctrl+C to stop.");
}

/* -------------------------------------------------------------------------- */
/*                              process lifecycle                              */
/* -------------------------------------------------------------------------- */

process.on("SIGINT", () => {
    void shutdown(0, "SIGINT");
});

process.on("SIGTERM", () => {
    void shutdown(0, "SIGTERM");
});

process.on("uncaughtException", (e) => {
    errlog("uncaughtException:", e);
    void shutdown(1, "uncaughtException");
});

process.on("unhandledRejection", (e) => {
    errlog("unhandledRejection:", e);
    void shutdown(1, "unhandledRejection");
});

void main().catch((e) => {
    errlog("fatal:", e);
    void shutdown(1, "startup failure");
});