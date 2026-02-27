// apps/api/drizzle.config.ts
import type { Config } from "drizzle-kit";
import * as path from "node:path";

// Drizzle Kit runs under Node (bunx), so use file-based paths.
// We keep schema in src/db/schema.ts, and migrations output to ./drizzle
// DB path is driven by BP_DB_PATH, with a sensible repo-local default.

const dbPath = process.env.BP_DB_PATH
    ? path.resolve(process.env.BP_DB_PATH)
    : path.resolve(process.cwd(), "apps", "api", "data", "biblia.sqlite");

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