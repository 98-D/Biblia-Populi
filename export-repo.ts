// export-repo.ts
// Run with: bun export-repo.ts
// Biblia.to — standalone, zero-dependency repo exporter (clean + safe + deterministic-ish)

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative, extname, basename } from "node:path";

const ROOT = process.cwd();

// Branding + output naming
const BRAND = "Biblia.to";
const OUTPUT_FILE = join(ROOT, "biblia.to-code-export.md");

// Safety / quality limits
const MAX_FILE_BYTES = 512_000; // 512 KB per file
const MAX_TOTAL_BYTES = 12_000_000; // 12 MB overall content budget
const PREVIEW_BYTES_WHEN_TOO_LARGE = 48_000; // show head when file is too big

const IGNORE_DIRS = new Set<string>([
    "node_modules",
    "dist",
    ".git",
    "coverage",
    "build",
    "tmp",
    "cache",
    ".next",
    ".turbo",
    ".vscode",
    ".idea",
    "out",
    ".bun",
    ".vercel",
]);

const IGNORE_FILES = new Set<string>([
    ".DS_Store",
    "bun.lockb",
    "bun.lock",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "Thumbs.db",
    ".env.local",
    ".env.production",
    ".env.development",
    ".env.test",
    ".env",
    ".env.*",
]);

// Extra guardrails: avoid accidentally exporting secrets by name pattern
const IGNORE_FILE_PATTERNS: RegExp[] = [
    /^\.?env(\..+)?$/i,
    /(^|\/)\.npmrc$/i,
    /(^|\/)\.netrc$/i,
    /(^|\/)id_rsa(\.pub)?$/i,
    /(^|\/)id_ed25519(\.pub)?$/i,
    /(^|\/)secrets?(\.|\/|$)/i,
    /(^|\/)private(\.|\/|$)/i,
];

// Include by extension + a few exact basenames
const INCLUDE_EXTENSIONS = new Set<string>([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".css",
    ".html",
    ".md",
    ".yml",
    ".yaml",
    ".cjs",
    ".mjs",
    ".toml",
]);

const INCLUDE_BASENAMES = new Set<string>([
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "tailwind.config.ts",
    "postcss.config.cjs",
    ".gitignore",
    ".editorconfig",
    "README.md",
]);

type Collected = {
    path: string; // repo-relative posix
    content: string; // utf-8 text
    bytes: number; // raw bytes from fs stats
    truncated: boolean;
    note?: string;
};

function nowIso(): string {
    return new Date().toISOString();
}

function toPosix(p: string): string {
    return p.replace(/\\/g, "/");
}

function splitParts(relPath: string): string[] {
    return relPath.split(/[/\\]/).filter(Boolean);
}

function matchesIgnorePatterns(relPath: string): boolean {
    const p = relPath;
    const base = basename(relPath);
    if (IGNORE_FILES.has(base)) return true;

    for (const rx of IGNORE_FILE_PATTERNS) {
        if (rx.test(base) || rx.test(p)) return true;
    }
    return false;
}

function shouldIgnore(relPath: string): boolean {
    const parts = splitParts(relPath);
    for (const part of parts) {
        if (IGNORE_DIRS.has(part)) return true;
    }
    if (matchesIgnorePatterns(relPath)) return true;
    return false;
}

function shouldInclude(relPath: string): boolean {
    const base = basename(relPath);
    if (INCLUDE_BASENAMES.has(base)) return true;

    const ext = extname(base).toLowerCase();
    if (INCLUDE_EXTENSIONS.has(ext)) return true;

    return false;
}

function safeReadText(fullPath: string, sizeBytes: number): { content: string; truncated: boolean; note?: string } | null {
    // Skip non-regular files (symlinks, devices, etc.)
    try {
        const st = statSync(fullPath);
        if (!st.isFile()) return null;
    } catch {
        return null;
    }

    // If huge, read a preview
    const truncated = sizeBytes > MAX_FILE_BYTES;
    const readLen = truncated ? PREVIEW_BYTES_WHEN_TOO_LARGE : undefined;

    try {
        // readFileSync supports specifying an encoding; for previews we read full then slice to keep it simple/portable.
        // This is fine because preview cap is still modest, and MAX_FILE_BYTES prevents most huge reads.
        const raw = readFileSync(fullPath, "utf-8");
        if (!truncated) return { content: raw, truncated: false };

        const preview = raw.slice(0, PREVIEW_BYTES_WHEN_TOO_LARGE);
        return {
            content: preview,
            truncated: true,
            note: `TRUNCATED: file was ${sizeBytes} bytes; showing first ${PREVIEW_BYTES_WHEN_TOO_LARGE} chars`,
        };
    } catch {
        return null;
    }
}

function collectFiles(dir: string, out: Collected[] = [], budgets = { totalBytes: 0 }): Collected[] {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relPath = toPosix(relative(ROOT, fullPath));

        if (shouldIgnore(relPath)) continue;

        if (entry.isDirectory()) {
            collectFiles(fullPath, out, budgets);
            continue;
        }

        if (!entry.isFile()) continue;

        if (!shouldInclude(relPath)) continue;

        let sizeBytes = 0;
        try {
            sizeBytes = statSync(fullPath).size;
        } catch {
            continue;
        }

        // overall budget guard (prevents gigantic exports)
        if (budgets.totalBytes >= MAX_TOTAL_BYTES) {
            out.push({
                path: relPath,
                content: "",
                bytes: sizeBytes,
                truncated: true,
                note: `SKIPPED: overall export content budget (${MAX_TOTAL_BYTES} bytes) exceeded`,
            });
            continue;
        }

        const r = safeReadText(fullPath, sizeBytes);
        if (!r) continue;

        // update budget by content length (approx; utf-16 in JS, but good enough as a cap)
        budgets.totalBytes += Math.min(sizeBytes, MAX_FILE_BYTES);

        out.push({
            path: relPath,
            content: r.content,
            bytes: sizeBytes,
            truncated: r.truncated,
            note: r.note,
        });
    }

    return out;
}

function fenceLang(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    if (!ext) return "text";

    // normalize a few common ones
    if (ext === ".tsx") return "tsx";
    if (ext === ".ts") return "ts";
    if (ext === ".jsx") return "jsx";
    if (ext === ".js") return "js";
    if (ext === ".json") return "json";
    if (ext === ".css") return "css";
    if (ext === ".html") return "html";
    if (ext === ".md") return "md";
    if (ext === ".yml" || ext === ".yaml") return "yaml";
    if (ext === ".cjs") return "js";
    if (ext === ".mjs") return "js";
    if (ext === ".toml") return "toml";
    return ext.slice(1);
}

function buildDirectoryTree(paths: string[]): string {
    // Build a set of dirs to print in a stable way
    const dirs = new Set<string>();
    for (const p of paths) {
        const parts = p.split("/");
        let cur = "";
        for (let i = 0; i < parts.length - 1; i++) {
            cur = cur ? `${cur}/${parts[i]}` : parts[i]!;
            dirs.add(cur);
        }
    }
    const dirList = Array.from(dirs).sort((a, b) => a.localeCompare(b));

    let out = "/\n";
    for (const d of dirList) {
        const depth = d.split("/").length - 1;
        const name = d.split("/").pop()!;
        out += `${"│   ".repeat(depth)}├── ${name}/\n`;
    }
    return out;
}

function main() {
    console.log(`🚀 Starting clean export of ${BRAND} repo...`);

    const start = Date.now();
    const files = collectFiles(ROOT);
    files.sort((a, b) => a.path.localeCompare(b.path));

    const elapsed = Date.now() - start;
    const totalFiles = files.length;

    const totalBytes = files.reduce((s, f) => s + f.bytes, 0);
    const truncatedCount = files.filter((f) => f.truncated).length;

    let md = `# ${BRAND} — Clean Codebase Export\n\n`;
    md += `Generated: ${nowIso()}\n`;
    md += `Root: ${ROOT}\n`;
    md += `Total files: ${totalFiles}\n`;
    md += `Total raw bytes (all included files): ${totalBytes}\n`;
    md += `Truncated/skipped files: ${truncatedCount}\n`;
    md += `Export time: ${elapsed}ms\n\n`;

    md += `## Notes\n\n`;
    md += `- Secret-ish files are excluded by name/pattern (env, keys, npmrc/netrc, etc.).\n`;
    md += `- Files over ${MAX_FILE_BYTES} bytes are truncated to a preview.\n`;
    md += `- Overall export content is capped at ~${MAX_TOTAL_BYTES} bytes.\n\n`;

    md += `## Directory Structure\n\n\`\`\`\n`;
    md += buildDirectoryTree(files.map((f) => f.path));
    md += `\`\`\`\n\n`;

    md += `## Source Files\n\n`;

    for (const file of files) {
        md += `### ${file.path}\n\n`;
        if (file.note) md += `> ${file.note}\n\n`;

        const lang = fenceLang(file.path);

        // Keep empty placeholders for skipped files
        md += `\`\`\`${lang}\n`;
        const body = (file.content ?? "").trimEnd();
        md += body.length ? `${body}\n` : ``;
        md += `\`\`\`\n\n`;
    }

    writeFileSync(OUTPUT_FILE, md, "utf-8");

    console.log(`✅ Export completed successfully!`);
    console.log(`📄 Saved to: ${OUTPUT_FILE}`);
    console.log(`\nOpen the file and copy-paste the entire content here.`);
}

main();