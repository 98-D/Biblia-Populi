// scripts/clean.ts
// Biblia.to — root clean script (Bun-first, cross-platform, hardened)
//
// Run from repo root:
//   bun scripts/clean.ts
//   bun run clean
//
// Features:
// - Cross-platform recursive deletion (no rm -rf)
// - Cleans common build/cache outputs across root/apps/packages
// - Safe root guard (won't run outside expected repo shape)
// - Optional aggressive mode for lockfiles/install state
// - Optional dry-run mode
//
// Flags:
//   --dry-run                  Print what would be removed
//   --aggressive               Also remove node_modules and lockfiles
//   --include-dot-env          Also remove common local env files
//
// Examples:
//   bun scripts/clean.ts
//   bun scripts/clean.ts --dry-run
//   bun scripts/clean.ts --aggressive
//   bun scripts/clean.ts --aggressive --include-dot-env

import * as fs from "node:fs";
import * as path from "node:path";
import * as process from "node:process";

const ROOT = process.cwd();

type Options = {
    dryRun: boolean;
    aggressive: boolean;
    includeDotEnv: boolean;
};

function nowStamp(): string {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
}

function log(...args: unknown[]): void {
    console.log(`[clean ${nowStamp()}]`, ...args);
}

function errlog(...args: unknown[]): void {
    console.error(`[clean ${nowStamp()}]`, ...args);
}

function hasFlag(flag: string): boolean {
    return process.argv.slice(2).includes(flag);
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

function readDirNames(p: string): string[] {
    try {
        return fs.readdirSync(p, { withFileTypes: true }).map((d) => d.name);
    } catch {
        return [];
    }
}

function normalizeAbs(p: string): string {
    return path.normalize(path.resolve(ROOT, p));
}

function pathWithinRoot(absPath: string): boolean {
    const rel = path.relative(ROOT, absPath);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function assertRepoRoot(): void {
    const appsDir = path.join(ROOT, "apps");
    const packagesDir = path.join(ROOT, "packages");
    const pkgJson = path.join(ROOT, "package.json");

    if (!exists(pkgJson) || !isDirectory(appsDir) || !isDirectory(packagesDir)) {
        throw new Error(
            `repo root shape not detected at ${ROOT}. Expected package.json, apps/, and packages/. Run from repo root.`,
        );
    }
}

async function rmPath(absPath: string, dryRun: boolean): Promise<boolean> {
    if (!pathWithinRoot(absPath)) {
        throw new Error(`refusing to delete outside repo root: ${absPath}`);
    }

    if (!exists(absPath)) return false;

    const rel = path.relative(ROOT, absPath) || ".";

    if (dryRun) {
        log(`[dry-run] remove ${rel}`);
        return true;
    }

    await fs.promises.rm(absPath, {
        recursive: true,
        force: true,
        maxRetries: 2,
        retryDelay: 80,
    });

    log(`removed ${rel}`);
    return true;
}

function gatherWorkspaceDirs(baseDir: string): string[] {
    const absBase = path.join(ROOT, baseDir);
    if (!isDirectory(absBase)) return [];

    return readDirNames(absBase)
        .map((name) => path.join(absBase, name))
        .filter((p) => isDirectory(p));
}

function uniqueSorted(paths: string[]): string[] {
    return [...new Set(paths.map((p) => normalizeAbs(p)))].sort((a, b) => a.localeCompare(b));
}

function buildDeletionPlan(opts: Options): string[] {
    const targets: string[] = [];

    const rootTargets = [
        ".turbo",
        ".cache",
        ".eslintcache",
        "coverage",
        "dist",
        "build",
        "tmp",
        "temp",
        ".DS_Store",
    ];

    for (const rel of rootTargets) {
        targets.push(path.join(ROOT, rel));
    }

    const workspaceDirs = [
        ...gatherWorkspaceDirs("apps"),
        ...gatherWorkspaceDirs("packages"),
    ];

    const perWorkspaceTargets = [
        "dist",
        "build",
        ".vite",
        ".turbo",
        ".cache",
        "coverage",
        ".svelte-kit",
        ".next",
        ".nuxt",
        ".output",
        "storybook-static",
        ".rpt2_cache",
        ".tsbuildinfo",
    ];

    for (const ws of workspaceDirs) {
        for (const rel of perWorkspaceTargets) {
            targets.push(path.join(ws, rel));
        }
    }

    if (opts.aggressive) {
        targets.push(path.join(ROOT, "node_modules"));

        for (const ws of workspaceDirs) {
            targets.push(path.join(ws, "node_modules"));
        }

        targets.push(path.join(ROOT, "bun.lock"));
        targets.push(path.join(ROOT, "bun.lockb"));
        targets.push(path.join(ROOT, "package-lock.json"));
        targets.push(path.join(ROOT, "pnpm-lock.yaml"));
        targets.push(path.join(ROOT, "yarn.lock"));
    }

    if (opts.includeDotEnv) {
        const envFiles = [
            ".env",
            ".env.local",
            ".env.development.local",
            ".env.production.local",
            ".env.test.local",
        ];

        for (const rel of envFiles) {
            targets.push(path.join(ROOT, rel));
        }

        for (const ws of workspaceDirs) {
            for (const rel of envFiles) {
                targets.push(path.join(ws, rel));
            }
        }
    }

    return uniqueSorted(targets);
}

async function main(): Promise<void> {
    const opts: Options = {
        dryRun: hasFlag("--dry-run"),
        aggressive: hasFlag("--aggressive"),
        includeDotEnv: hasFlag("--include-dot-env"),
    };

    assertRepoRoot();

    log("=== Biblia.to Clean ===");
    log("ROOT:", ROOT);
    log("dryRun:", opts.dryRun);
    log("aggressive:", opts.aggressive);
    log("includeDotEnv:", opts.includeDotEnv);

    const plan = buildDeletionPlan(opts);

    let removed = 0;
    let skipped = 0;
    let hadErrors = false;

    for (const absPath of plan) {
        try {
            const didRemove = await rmPath(absPath, opts.dryRun);
            if (didRemove) removed += 1;
            else skipped += 1;
        } catch (e) {
            hadErrors = true;
            errlog(`failed to remove ${path.relative(ROOT, absPath) || "."}:`, e);
        }
    }

    log(`done. removed=${removed} skipped=${skipped}`);

    if (hadErrors) {
        process.exit(1);
    }
}

void main().catch((e) => {
    errlog("fatal:", e);
    process.exit(1);
});