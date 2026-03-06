// apps/api/src/db/authSchema.ts
// Biblia.to — Auth/Identity schema (DB-backed sessions + OAuth accounts)
//
// Goals:
// - Minimal, durable identity core
// - Provider accounts keyed by (provider, provider_user_id)
// - Server-side sessions (opaque id in HttpOnly cookie)
// - Optional provider tokens, nullable
// - Stronger invariants for timestamps / required fields
// - Production-friendly indexes for auth/session lookups
//
// IMPORTANT:
// - Timestamps are stored as INTEGER milliseconds since epoch (number).
// - Do NOT use { mode: "timestamp_ms" } here, because that types columns as Date
//   and conflicts with the rest of the API/server code which uses number ms everywhere.
//
// Notes:
// - SQLite UNIQUE allows multiple NULLs, so email remains “unique when present”.
// - Canon data is intentionally separate; auth is app/user infrastructure only.

import { sqliteTable, text, integer, index, uniqueIndex, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/* -------------------------------- Helpers --------------------------------- */

const lenGt0 = (col: unknown) => sql`length(${col as any}) > 0`;
const lenGe = (col: unknown, n: number) => sql`length(${col as any}) >= ${n}`;

/* --------------------------------- Users ---------------------------------- */

export const bpUser = sqliteTable(
    "bp_user",
    {
        id: text("id").primaryKey(), // url-safe random id

        createdAt: integer("created_at").notNull(), // ms epoch
        updatedAt: integer("updated_at").notNull(), // ms epoch

        displayName: text("display_name"),

        // Optional, but common. Unique when present.
        email: text("email"),
        emailVerifiedAt: integer("email_verified_at"), // ms epoch (nullable)

        // Optional future: local password login
        passwordHash: text("password_hash"),

        // Account status
        disabledAt: integer("disabled_at"), // ms epoch (nullable)
    },
    (t) => ({
        emailUq: uniqueIndex("bp_user_email_uq").on(t.email),

        updatedIdx: index("bp_user_updated_idx").on(t.updatedAt),
        emailIdx: index("bp_user_email_idx").on(t.email),
        disabledIdx: index("bp_user_disabled_idx").on(t.disabledAt),

        idCheck: check("bp_user_id_check", lenGt0(t.id)),
        emailCheck: check(
            "bp_user_email_check",
            sql`${t.email} is null or length(trim(${t.email})) >= 3`,
        ),
        displayNameCheck: check(
            "bp_user_display_name_check",
            sql`${t.displayName} is null or length(trim(${t.displayName})) > 0`,
        ),
        chronologyCheck: check(
            "bp_user_chronology_check",
            sql`${t.updatedAt} >= ${t.createdAt}`,
        ),
        emailVerifiedCheck: check(
            "bp_user_email_verified_check",
            sql`${t.emailVerifiedAt} is null or ${t.emailVerifiedAt} >= ${t.createdAt}`,
        ),
        disabledCheck: check(
            "bp_user_disabled_check",
            sql`${t.disabledAt} is null or ${t.disabledAt} >= ${t.createdAt}`,
        ),
    }),
);

/* ----------------------------- Provider Accounts --------------------------- */

export const bpAuthAccount = sqliteTable(
    "bp_auth_account",
    {
        id: text("id").primaryKey(),

        createdAt: integer("created_at").notNull(), // ms epoch
        updatedAt: integer("updated_at").notNull(), // ms epoch

        userId: text("user_id")
            .notNull()
            .references(() => bpUser.id, { onDelete: "cascade", onUpdate: "cascade" }),

        provider: text("provider").notNull(), // e.g. "google"
        providerUserId: text("provider_user_id").notNull(), // Google "sub"

        // Optional storage (nullable; many apps don't persist these)
        accessToken: text("access_token"),
        refreshToken: text("refresh_token"),
        accessTokenExpiresAt: integer("access_token_expires_at"), // ms epoch (nullable)
        scope: text("scope"),
    },
    (t) => ({
        userIdx: index("bp_auth_account_user_idx").on(t.userId),
        providerLookupIdx: index("bp_auth_account_provider_lookup_idx").on(t.provider, t.providerUserId),
        accessExpIdx: index("bp_auth_account_access_exp_idx").on(t.accessTokenExpiresAt),
        providerUq: uniqueIndex("bp_auth_account_provider_uq").on(t.provider, t.providerUserId),

        idCheck: check("bp_auth_account_id_check", lenGt0(t.id)),
        userIdCheck: check("bp_auth_account_user_id_check", lenGt0(t.userId)),
        providerCheck: check("bp_auth_account_provider_check", lenGt0(t.provider)),
        providerUserIdCheck: check(
            "bp_auth_account_provider_user_id_check",
            lenGt0(t.providerUserId),
        ),
        chronologyCheck: check(
            "bp_auth_account_chronology_check",
            sql`${t.updatedAt} >= ${t.createdAt}`,
        ),
        accessTokenExpiresCheck: check(
            "bp_auth_account_access_token_expires_check",
            sql`${t.accessTokenExpiresAt} is null or ${t.accessTokenExpiresAt} >= ${t.createdAt}`,
        ),
        scopeCheck: check(
            "bp_auth_account_scope_check",
            sql`${t.scope} is null or length(trim(${t.scope})) > 0`,
        ),
    }),
);

/* -------------------------------- Sessions -------------------------------- */

export const bpSession = sqliteTable(
    "bp_session",
    {
        id: text("id").primaryKey(), // stored in HttpOnly cookie (opaque)

        createdAt: integer("created_at").notNull(), // ms epoch
        expiresAt: integer("expires_at").notNull(), // ms epoch

        userId: text("user_id")
            .notNull()
            .references(() => bpUser.id, { onDelete: "cascade", onUpdate: "cascade" }),

        // Optional hardening / audit
        ip: text("ip"),
        ua: text("ua"),
    },
    (t) => ({
        userIdx: index("bp_session_user_idx").on(t.userId),
        userExpIdx: index("bp_session_user_exp_idx").on(t.userId, t.expiresAt),
        expIdx: index("bp_session_exp_idx").on(t.expiresAt),

        idCheck: check("bp_session_id_check", lenGt0(t.id)),
        userIdCheck: check("bp_session_user_id_check", lenGt0(t.userId)),
        expiresCheck: check(
            "bp_session_expires_check",
            sql`${t.expiresAt} > ${t.createdAt}`,
        ),
        ipCheck: check(
            "bp_session_ip_check",
            sql`${t.ip} is null or length(trim(${t.ip})) > 0`,
        ),
        uaCheck: check(
            "bp_session_ua_check",
            sql`${t.ua} is null or length(trim(${t.ua})) > 0`,
        ),
    }),
);

/* ----------------------------- Export surface ------------------------------ */

export const authSchema = {
    bpUser,
    bpAuthAccount,
    bpSession,
} as const;