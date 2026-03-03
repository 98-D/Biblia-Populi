// apps/api/drizzle.config.ts
import type { Config } from "drizzle-kit";
import * as path from "node:path";
import * as fs from "node:fs";

/**
 * Drizzle Kit runs under Node (bunx), so use file-based paths.
 *
 * Schema:
 * - ./src/db/schema.ts       (core Biblia Populi tables)
 * - ./src/db/authSchema.ts   (bp_user / bp_auth_account / bp_session)
 *
 * Migrations output: ./drizzle
 *
 * DB path resolution:
 * - If BP_DB_PATH is set:
 *    - ":memory:" is NOT supported by drizzle-kit (needs a file), so we fall back to repo-local file.
 *    - Relative paths are resolved against process.cwd().
 * - Otherwise:
 *    - Use apps/api/data/biblia.sqlite (relative to repo root if you run from root)
 *
 * IMPORTANT:
 * - drizzle-kit resolves schema paths relative to process.cwd().
 * - To make this robust whether you run bunx from repo root OR from apps/api,
 *   we generate absolute paths for schema + migrations folder.
 */

const HERE = path.dirname(new URL(import.meta.url).pathname);

// On Windows, URL pathname starts with /C:/...; normalize it.
function normalizeHere(p: string): string {
    if (process.platform === "win32" && p.startsWith("/")) return p.slice(1);
    return p;
}

const HERE_FS = normalizeHere(HERE);
const API_DIR = path.resolve(HERE_FS); // .../apps/api

function isMemoryDb(p: string): boolean {
    return p === ":memory:" || p.startsWith("file::memory:");
}

function resolveDbPath(): string {
    const raw = (process.env.BP_DB_PATH ?? "").trim();

    // default: repo-local file (works when running from repo root OR apps/api)
    if (!raw) return path.resolve(API_DIR, "data", "biblia.sqlite");

    // drizzle-kit needs a file path, not in-memory
    if (isMemoryDb(raw)) return path.resolve(API_DIR, "data", "biblia.sqlite");

    return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

const dbPath = resolveDbPath();

// Ensure directory exists so drizzle-kit can create the DB file if needed
try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
} catch {
    // ignore; drizzle-kit will error if it truly can't write
}

const schemaCore = path.resolve(API_DIR, "src", "db", "schema.ts");
const schemaAuth = path.resolve(API_DIR, "src", "db", "authSchema.ts");

export default {
    schema: [schemaCore, schemaAuth],
    out: path.resolve(API_DIR, "drizzle"),
    dialect: "sqlite",
    dbCredentials: {
        url: dbPath,
    },
    strict: true,
    verbose: true,
} satisfies Config;