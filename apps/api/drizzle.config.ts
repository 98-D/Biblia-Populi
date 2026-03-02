// apps/api/drizzle.config.ts
import type { Config } from "drizzle-kit";
import * as path from "node:path";
import * as fs from "node:fs";

/**
 * Drizzle Kit runs under Node (bunx), so use file-based paths.
 *
 * Schema: ./src/db/schema.ts
 * Migrations output: ./drizzle
 *
 * DB path resolution:
 * - If BP_DB_PATH is set:
 *    - ":memory:" is NOT supported by drizzle-kit (needs a file), so we fall back to repo-local file.
 *    - Relative paths are resolved against process.cwd().
 * - Otherwise:
 *    - Use repo-local apps/api/data/biblia.sqlite (based on cwd).
 */
function resolveDbPath(): string {
    const raw = (process.env.BP_DB_PATH ?? "").trim();
    if (!raw) return path.resolve(process.cwd(), "apps", "api", "data", "biblia.sqlite");

    // drizzle-kit needs a file path, not in-memory
    if (raw === ":memory:" || raw.startsWith("file::memory:")) {
        return path.resolve(process.cwd(), "apps", "api", "data", "biblia.sqlite");
    }

    return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

const dbPath = resolveDbPath();

// Ensure directory exists so drizzle-kit can create the DB file if needed
try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
} catch {
    // ignore; drizzle-kit will error if it truly can't write
}

export default {
    schema: "./src/db/schema.ts",
    out: "./drizzle",
    dialect: "sqlite",
    dbCredentials: {
        url: dbPath,
    },
    strict: true,
    verbose: true,
} satisfies Config;