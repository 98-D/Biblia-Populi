// scripts/dev.ts (run from repo root with: bun run dev)
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import process from "node:process";

type Proc = { name: string; child: ChildProcess };

const ROOT = process.cwd();
const API_CWD = path.join(ROOT, "apps", "api");
const WEB_CWD = path.join(ROOT, "apps", "web");

// If this script is executed with Bun, process.execPath is bun.
// If executed with Node, fall back to "bun" on PATH.
const BUN_BIN = process.execPath.toLowerCase().includes("bun") ? process.execPath : "bun";

const procs: Proc[] = [];
let shuttingDown = false;

function run(name: string, cwd: string, args: string[], extraEnv?: Record<string, string>): Proc {
    const child = spawn(BUN_BIN, args, {
        cwd,
        stdio: "inherit",
        env: { ...process.env, ...(extraEnv ?? {}) },
        // Helps on Windows when using "bun" from PATH (when BUN_BIN === "bun")
        shell: process.platform === "win32" && BUN_BIN === "bun",
    });

    child.on("exit", (code, signal) => {
        if (shuttingDown) return;
        console.error(`\n[dev] ${name} exited (${code ?? "null"}${signal ? `, ${signal}` : ""})`);
        shutdown(code === 0 ? 0 : 1);
    });

    return { name, child };
}

function shutdown(exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;

    for (const p of procs) {
        try {
            // On Windows, signals are limited; plain kill() is fine.
            p.child.kill();
        } catch {}
    }

    setTimeout(() => process.exit(exitCode), 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("\n=== Biblia Populi Dev ===");
console.log("API:", API_CWD);
console.log("WEB:", WEB_CWD);
console.log("");

// ✅ NOTE: no leading "bun" here — BUN_BIN is already bun
procs.push(run("api", API_CWD, ["run", "dev"]));
procs.push(
    run("web", WEB_CWD, ["run", "dev"], {
        // VITE_API_BASE: "http://localhost:3000",
    }),
);

console.log("\n[dev] running. Ctrl+C to stop.\n");