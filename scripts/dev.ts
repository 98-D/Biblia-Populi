// scripts/dev.ts (run from repo root with: bun run dev)
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

type Proc = { name: string; child: ReturnType<typeof spawn> };

function run(name: string, cwd: string, args: string[], extraEnv?: Record<string, string>): Proc {
    const child = spawn(process.execPath, args, {
        cwd,
        stdio: "inherit",
        env: { ...process.env, ...(extraEnv ?? {}) },
    });

    child.on("exit", (code, signal) => {
        // If one process dies, we shut everything down.
        console.error(`\n[dev] ${name} exited (${code ?? "null"}${signal ? `, ${signal}` : ""})`);
        shutdown(1);
    });

    return { name, child };
}

const ROOT = process.cwd();
const API_CWD = path.join(ROOT, "apps", "api");
const WEB_CWD = path.join(ROOT, "apps", "web");

const procs: Proc[] = [];

function shutdown(exitCode = 0) {
    for (const p of procs) {
        try {
            p.child.kill("SIGTERM");
        } catch {}
    }
    // Give children a moment then hard-exit
    setTimeout(() => process.exit(exitCode), 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("\n=== Biblia Populi Dev ===");
console.log("API:", API_CWD);
console.log("WEB:", WEB_CWD);
console.log("");

// API (Hono)
procs.push(run("api", API_CWD, ["bun", "run", "dev"]));

// Web (Vite)
procs.push(
    run("web", WEB_CWD, ["bun", "run", "dev"], {
        // Optional, only if you want to override; with Vite proxy you can omit.
        // VITE_API_BASE: "http://localhost:3000",
    }),
);

console.log("\n[dev] running. Ctrl+C to stop.\n");