// scripts/dev.ts
// Biblia.to — root dev runner (Bun-first, production-grade)
//
// Run from repo root:
//   bun run dev
//
// Starts:
// - apps/api (bun run dev)
// - apps/web (bun run dev)
//
// Features:
// - Bun-only process management
// - repo-root discovery (does not blindly trust process.cwd())
// - DB bootstrap unless BP_DEV_SKIP_DB=1
// - optional OSIS import + verify
// - API port preflight to prevent false-positive health checks / EADDRINUSE confusion
// - optional API health wait before starting web
// - prefixed child stdout/stderr logs
// - graceful shutdown with escalation
// - stronger package/script sanity checks
//
// Important fix:
// - if the API port is already in use before starting the child, fail fast with a clear error.
//   This prevents the old "health check passed against some other process" bug.

import * as fs from "node:fs";
import * as path from "node:path";
import * as process from "node:process";

type BunSubprocess = ReturnType<typeof Bun.spawn>;
type ServiceName = "api" | "web";

type Proc = Readonly<{
    name: ServiceName;
    proc: BunSubprocess;
    stdoutDone: Promise<void>;
    stderrDone: Promise<void>;
}>;

type PackageJson = Readonly<{
    name?: string;
    scripts?: Record<string, string>;
}>;

type RepoPaths = Readonly<{
    root: string;
    api: string;
    web: string;
}>;

const DEV_NAME = "Biblia.to Dev";

const procs: Proc[] = [];
let shuttingDown = false;
let finalized = false;
let shutdownReason: string | null = null;

/* -------------------------------------------------------------------------- */
/* env / misc helpers                                                          */
/* -------------------------------------------------------------------------- */

function envStr(name: string, fallback = ""): string {
    const value = process.env[name];
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    return trimmed || fallback;
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

function envInt(name: string, fallback: number): number {
    const raw = envStr(name, "");
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function nowStamp(): string {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
}

function log(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.log(`[dev ${nowStamp()}]`, ...args);
}

function warn(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.warn(`[dev ${nowStamp()}]`, ...args);
}

function errlog(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.error(`[dev ${nowStamp()}]`, ...args);
}

function serviceLog(name: ServiceName, stream: "stdout" | "stderr", line: string): void {
    const prefix = `[${name}:${stream}]`;
    if (stream === "stderr") {
        // eslint-disable-next-line no-console
        console.error(prefix, line);
        return;
    }
    // eslint-disable-next-line no-console
    console.log(prefix, line);
}

function bunBin(): string {
    const execPath = String(process.execPath ?? "");
    if (execPath.toLowerCase().includes("bun")) return execPath;
    return Bun.which("bun") ?? "bun";
}

function fileExists(p: string): boolean {
    try {
        return fs.existsSync(p);
    } catch {
        return false;
    }
}

function dirExists(p: string): boolean {
    try {
        return fs.existsSync(p) && fs.statSync(p).isDirectory();
    } catch {
        return false;
    }
}

function normalizeAbs(root: string, p: string): string {
    return path.isAbsolute(p) ? path.normalize(p) : path.resolve(root, p);
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
    if (!pkg) {
        throw new Error(`invalid or missing package.json at ${pkgPath}`);
    }
    return pkg;
}

function hasScript(pkgDir: string, scriptName: string): boolean {
    const pkg = readPackageJson(pkgDir);
    return Boolean(pkg.scripts && Object.prototype.hasOwnProperty.call(pkg.scripts, scriptName));
}

function waitMs(ms: number): Promise<void> {
    return Bun.sleep(ms);
}

function formatUnknownError(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message.trim();
    if (typeof error === "string" && error.trim()) return error.trim();
    return String(error);
}

/* -------------------------------------------------------------------------- */
/* repo discovery                                                               */
/* -------------------------------------------------------------------------- */

function looksLikeRepoRoot(dir: string): boolean {
    return (
         dirExists(path.join(dir, "apps")) &&
         dirExists(path.join(dir, "apps", "api")) &&
         dirExists(path.join(dir, "apps", "web")) &&
         fileExists(path.join(dir, "package.json"))
    );
}

function findRepoRoot(): string {
    let cur = process.cwd();

    for (let i = 0; i < 12; i += 1) {
        if (looksLikeRepoRoot(cur)) return cur;
        const parent = path.dirname(cur);
        if (parent === cur) break;
        cur = parent;
    }

    throw new Error(
         `Could not locate repo root from cwd=${process.cwd()} (expected apps/api + apps/web + package.json)`,
    );
}

function resolveRepoPaths(): RepoPaths {
    const root = findRepoRoot();
    return Object.freeze({
        root,
        api: path.join(root, "apps", "api"),
        web: path.join(root, "apps", "web"),
    });
}

function assertRepoShape(paths: RepoPaths): void {
    if (!dirExists(paths.api)) {
        throw new Error(`apps/api not found at ${paths.api}`);
    }
    if (!dirExists(paths.web)) {
        throw new Error(`apps/web not found at ${paths.web}`);
    }
    if (!fileExists(path.join(paths.api, "package.json"))) {
        throw new Error(`missing package.json in ${paths.api}`);
    }
    if (!fileExists(path.join(paths.web, "package.json"))) {
        throw new Error(`missing package.json in ${paths.web}`);
    }
}

function assertScript(pkgDir: string, scriptName: string, label: string): void {
    if (!hasScript(pkgDir, scriptName)) {
        throw new Error(`${label} script "${scriptName}" not found in ${path.join(pkgDir, "package.json")}`);
    }
}

/* -------------------------------------------------------------------------- */
/* stream pumping                                                               */
/* -------------------------------------------------------------------------- */

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

            while (true) {
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
        if (finalLine.length > 0) {
            serviceLog(name, streamName, finalLine);
        }
    } catch (error) {
        if (!shuttingDown) {
            errlog(`${name} ${streamName} pump failed:`, formatUnknownError(error));
        }
    } finally {
        try {
            reader.releaseLock();
        } catch {
            // ignore
        }
    }
}

/* -------------------------------------------------------------------------- */
/* subprocess helpers                                                           */
/* -------------------------------------------------------------------------- */

async function runOnce(
     name: string,
     cwd: string,
     cmd: string[],
     extraEnv?: Record<string, string>,
): Promise<void> {
    log(`> (${name}) ${cmd.join(" ")}`);

    const proc = Bun.spawn({
        cmd,
        cwd,
        env: { ...process.env, ...(extraEnv ?? {}) },
        stdout: "inherit",
        stderr: "inherit",
    });

    const code = await proc.exited;
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

    log(`${name} pid=${proc.pid}`);

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

/* -------------------------------------------------------------------------- */
/* network / health helpers                                                     */
/* -------------------------------------------------------------------------- */

function parsePortFromUrl(rawUrl: string): number | null {
    try {
        const url = new URL(rawUrl);
        if (url.port) {
            const n = Number(url.port);
            return Number.isInteger(n) && n > 0 ? n : null;
        }
        if (url.protocol === "http:") return 80;
        if (url.protocol === "https:") return 443;
        return null;
    } catch {
        return null;
    }
}

async function isTcpPortOpen(host: string, port: number): Promise<boolean> {
    try {
        const socket = await Bun.connect({
            hostname: host,
            port,
            socket: {
                data() {
                    socket.end();
                },
                open() {
                    socket.end();
                },
                close() {
                    // no-op
                },
                error() {
                    // no-op
                },
            },
        });

        socket.end();
        return true;
    } catch {
        return false;
    }
}

async function assertApiPortFreeBeforeSpawn(): Promise<void> {
    const enabled = envBool("BP_DEV_WAIT_FOR_API", true);
    if (!enabled) return;

    const url = envStr("BP_DEV_API_HEALTH_URL", "http://localhost:3000/health");
    const port = parsePortFromUrl(url);
    if (!port) {
        warn(`could not infer API port from BP_DEV_API_HEALTH_URL=${url}; skipping preflight port check`);
        return;
    }

    const occupied = await isTcpPortOpen("127.0.0.1", port);
    if (occupied) {
        throw new Error(
             `API port ${port} is already in use before startup. Kill the existing process or change the port.`
        );
    }
}

async function waitForApiHealth(): Promise<void> {
    const enabled = envBool("BP_DEV_WAIT_FOR_API", true);
    if (!enabled) {
        log("BP_DEV_WAIT_FOR_API=0 -> skipping API health wait");
        return;
    }

    const url = envStr("BP_DEV_API_HEALTH_URL", "http://localhost:3000/health");
    const timeoutMs = Math.max(1_000, envInt("BP_DEV_API_HEALTH_TIMEOUT_MS", 45_000));
    const intervalMs = Math.max(100, envInt("BP_DEV_API_HEALTH_INTERVAL_MS", 350));

    log(`waiting for API health: ${url}`);

    const start = Date.now();
    let lastErr: unknown = null;

    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(url, {
                method: "GET",
                headers: {
                    accept: "application/json,text/plain,*/*",
                },
            });

            if (res.ok) {
                log(`API healthy (${res.status})`);
                return;
            }

            lastErr = new Error(`health returned ${res.status}`);
        } catch (error) {
            lastErr = error;
        }

        await waitMs(intervalMs);
    }

    throw new Error(
         `API health check timed out after ${timeoutMs}ms (${formatUnknownError(lastErr ?? "unknown error")})`,
    );
}

/* -------------------------------------------------------------------------- */
/* shutdown                                                                     */
/* -------------------------------------------------------------------------- */

async function shutdown(exitCode = 0, reason = "shutdown"): Promise<never> {
    if (finalized) {
        process.exit(exitCode);
    }

    if (shuttingDown) {
        return new Promise<never>(() => {
            // intentionally never resolves; primary shutdown path owns exit
        });
    }

    shuttingDown = true;
    shutdownReason = reason;

    const graceMs = Math.max(100, envInt("BP_DEV_SHUTDOWN_GRACE_MS", 2_500));
    log(`shutting down (${reason})...`);

    for (const entry of procs) {
        try {
            entry.proc.kill("SIGTERM");
        } catch {
            // ignore
        }
    }

    await Promise.allSettled(
         procs.map(async (entry) => {
             try {
                 await Promise.race([entry.proc.exited, waitMs(graceMs)]);
             } catch {
                 // ignore
             }
         }),
    );

    for (const entry of procs) {
        try {
            entry.proc.kill("SIGKILL");
        } catch {
            // ignore
        }
    }

    await Promise.allSettled(procs.flatMap((entry) => [entry.stdoutDone, entry.stderrDone]));

    finalized = true;
    process.exit(exitCode);
}

/* -------------------------------------------------------------------------- */
/* bootstrap                                                                    */
/* -------------------------------------------------------------------------- */

function resolveOsisPath(root: string, raw: string): string {
    return normalizeAbs(root, raw);
}

async function bootstrapDb(bunPath: string, paths: RepoPaths): Promise<void> {
    if (envBool("BP_DEV_SKIP_DB")) {
        log("BP_DEV_SKIP_DB=1 -> skipping DB bootstrap");
        return;
    }

    const apiCwd = paths.api;

    if (hasScript(apiCwd, "db:bootstrap")) {
        await runOnce("api:db:bootstrap", apiCwd, [bunPath, "run", "db:bootstrap"]);
    } else {
        warn(`apps/api has no "db:bootstrap"; falling back to db:migrate + db:seed`);

        const hasMigrate = hasScript(apiCwd, "db:migrate");
        const hasSeed = hasScript(apiCwd, "db:seed");

        if (!hasMigrate && !hasSeed) {
            throw new Error(`apps/api has neither "db:bootstrap" nor "db:migrate"/"db:seed"`);
        }

        if (hasMigrate) {
            await runOnce("api:db:migrate", apiCwd, [bunPath, "run", "db:migrate"]);
        } else {
            warn(`apps/api missing "db:migrate"`);
        }

        if (hasSeed) {
            await runOnce("api:db:seed", apiCwd, [bunPath, "run", "db:seed"]);
        } else {
            warn(`apps/api missing "db:seed"`);
        }
    }

    const osisRaw = envStr("BP_DEV_IMPORT_OSIS", "");
    if (osisRaw) {
        const osisPath = resolveOsisPath(paths.root, osisRaw);

        if (!fileExists(osisPath)) {
            warn(`BP_DEV_IMPORT_OSIS set but file does not exist: ${osisPath}`);
        } else if (hasScript(apiCwd, "import:osis")) {
            const extraEnv: Record<string, string> = {};
            if (envBool("BP_DEV_IMPORT_SET_DEFAULT")) {
                extraEnv.BP_IMPORT_SET_DEFAULT = "1";
            }

            await runOnce("api:import:osis", apiCwd, [bunPath, "run", "import:osis", osisPath], extraEnv);
        } else {
            warn(`apps/api has no "import:osis" script; skipping OSIS import`);
        }
    }

    if (envBool("BP_DEV_VERIFY_DB")) {
        if (hasScript(apiCwd, "db:verify")) {
            await runOnce("api:db:verify", apiCwd, [bunPath, "run", "db:verify"]);
        } else {
            warn(`BP_DEV_VERIFY_DB=1 but apps/api has no "db:verify" script`);
        }
    }
}

/* -------------------------------------------------------------------------- */
/* main                                                                         */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
    const bunPath = bunBin();
    const paths = resolveRepoPaths();

    const noApi = envBool("BP_DEV_NO_API");
    const noWeb = envBool("BP_DEV_NO_WEB");

    const apiScript = envStr("BP_DEV_API_SCRIPT", "dev");
    const webScript = envStr("BP_DEV_WEB_SCRIPT", "dev");

    log(`=== ${DEV_NAME} ===`);
    log("ROOT:", paths.root);
    log("API :", paths.api);
    log("WEB :", paths.web);
    log("BUN :", bunPath);

    assertRepoShape(paths);

    if (noApi && noWeb) {
        throw new Error("both BP_DEV_NO_API=1 and BP_DEV_NO_WEB=1 were set; nothing to run");
    }

    if (!noApi) {
        assertScript(paths.api, apiScript, "apps/api");
    }
    if (!noWeb) {
        assertScript(paths.web, webScript, "apps/web");
    }

    if (!noApi) {
        await bootstrapDb(bunPath, paths);
        await assertApiPortFreeBeforeSpawn();
        procs.push(runLong("api", paths.api, [bunPath, "run", apiScript]));
    } else {
        log("BP_DEV_NO_API=1 -> skipping API bootstrap and API process start");
    }

    if (!noApi && !noWeb) {
        await waitForApiHealth();
    }

    if (!noWeb) {
        const viteApiBase = envStr("BP_DEV_VITE_API_BASE", "");
        const webEnv = viteApiBase ? { VITE_API_BASE: viteApiBase } : undefined;
        procs.push(runLong("web", paths.web, [bunPath, "run", webScript], webEnv));
    } else {
        log("BP_DEV_NO_WEB=1 -> skipping web process start");
    }

    log("running. Press Ctrl+C to stop.");
}

/* -------------------------------------------------------------------------- */
/* lifecycle                                                                    */
/* -------------------------------------------------------------------------- */

process.on("SIGINT", () => {
    void shutdown(0, "SIGINT");
});

process.on("SIGTERM", () => {
    void shutdown(0, "SIGTERM");
});

process.on("uncaughtException", (error) => {
    errlog("uncaughtException:", formatUnknownError(error));
    void shutdown(1, "uncaughtException");
});

process.on("unhandledRejection", (error) => {
    errlog("unhandledRejection:", formatUnknownError(error));
    void shutdown(1, "unhandledRejection");
});

void main().catch((error) => {
    errlog("fatal:", formatUnknownError(error));
    if (shutdownReason) {
        errlog("shutdown reason:", shutdownReason);
    }
    void shutdown(1, "startup failure");
});