// export-repo.ts
// Run with: bun export-repo.ts
// Standalone, zero-dependency, clean codebase exporter

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.cwd();
const OUTPUT_FILE = join(ROOT, "bibliapopuli-code-export.md");

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
]);

const IGNORE_FILES = new Set<string>([
    ".DS_Store",
    "bun.lockb",
    "bun.lock",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    ".env.local",
    ".env.production",
    "Thumbs.db",
]);

const INCLUDE_EXTENSIONS = new Set<string>([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".css",
    ".html",
    ".md",
    ".env",
    ".gitignore",
    "tsconfig.json",
    "vite.config.ts",
    "package.json",
    "tailwind.config.ts",
    "postcss.config.cjs",
]);

function shouldIgnore(relPath: string): boolean {
    const parts = relPath.split(/[/\\]/);

    for (const part of parts) {
        if (IGNORE_DIRS.has(part)) return true;
    }

    const filename = parts[parts.length - 1];
    // @ts-ignore
    if (IGNORE_FILES.has(filename)) return true;

    return false;
}

function collectFiles(
    dir: string,
    files: Array<{ path: string; content: string }> = []
): Array<{ path: string; content: string }> {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relPath = relative(ROOT, fullPath).replace(/\\/g, "/");

        if (shouldIgnore(relPath)) continue;

        if (entry.isDirectory()) {
            collectFiles(fullPath, files);
        } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase();

            if (INCLUDE_EXTENSIONS.has(ext) || INCLUDE_EXTENSIONS.has(entry.name)) {
                try {
                    const content = readFileSync(fullPath, "utf-8");
                    files.push({ path: relPath, content });
                } catch {
                    // skip files we cannot read
                }
            }
        }
    }

    return files;
}

function main() {
    console.log("🚀 Starting clean export of CRA Tool codebase...");

    const start = Date.now();
    const files = collectFiles(ROOT);
    files.sort((a, b) => a.path.localeCompare(b.path));

    let md = `# CRA Tool - Clean Codebase Export\n\n`;
    md += `Generated: ${new Date().toISOString()}\n`;
    md += `Total files: ${files.length}\n`;
    md += `Export time: ${Date.now() - start}ms\n\n`;

    // Clean Directory Tree
    md += `## Directory Structure\n\n\`\`\`\n`;
    md += `cra-tool/\n`;

    const seen = new Set<string>();
    for (const file of files) {
        const parts = file.path.split("/");
        let current = "";
        for (let i = 0; i < parts.length - 1; i++) {
            current = current ? `${current}/${parts[i]}` : parts[i]!;
            if (!seen.has(current)) {
                seen.add(current);
                md += `${"│   ".repeat(i)}├── ${parts[i]}/\n`;
            }
        }
    }
    md += `\`\`\`\n\n`;

    // All Source Files
    md += `## Source Files\n\n`;

    for (const file of files) {
        const lang = extname(file.path).slice(1) || "text";
        md += `### ${file.path}\n\n`;
        md += `\`\`\`${lang}\n`;
        md += file.content.trim() + "\n";
        md += `\`\`\`\n\n`;
    }

    writeFileSync(OUTPUT_FILE, md, "utf-8");

    console.log(`✅ Export completed successfully!`);
    console.log(`📄 Saved to: ${OUTPUT_FILE}`);
    console.log(`\nOpen the file and copy-paste the entire content here.`);
}

main();