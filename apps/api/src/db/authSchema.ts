// apps/api/src/db/authSchema.ts
// Biblia Populi — Auth/Identity schema (DB-backed sessions + OAuth accounts)
//
// Goals:
// - Minimal + durable identity core
// - Provider accounts (Google) keyed by (provider, provider_user_id)
// - Server-side sessions (opaque id in HttpOnly cookie)
// - Safe optional token storage (you can omit tokens entirely if you want)
//
// Notes:
// - SQLite FKs are best enforced in migrations; we keep schema portable.
// - Timestamps are ms since epoch (timestamp_ms).
// - email is optional (some providers can omit it), but we keep a unique index for when present.

import { sqliteTable, text, integer, index, uniqueIndex, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const bpUser = sqliteTable(
    "bp_user",
    {
        id: text("id").primaryKey(), // url-safe random id

        createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
        updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),

        displayName: text("display_name"),

        // Optional (but common). Unique when present.
        email: text("email"),
        emailVerifiedAt: integer("email_verified_at", { mode: "timestamp_ms" }),

        // Optional future: local password login
        passwordHash: text("password_hash"),

        // Account status
        disabledAt: integer("disabled_at", { mode: "timestamp_ms" }),
    },
    (t) => ({
        emailUq: uniqueIndex("bp_user_email_uq").on(t.email),
        idCheck: check("bp_user_id_check", sql`length(${t.id}) > 0`),
        emailCheck: check("bp_user_email_check", sql`${t.email} is null or length(${t.email}) > 3`),
    }),
);

export const bpAuthAccount = sqliteTable(
    "bp_auth_account",
    {
        id: text("id").primaryKey(),

        createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
        updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),

        userId: text("user_id").notNull(),

        provider: text("provider").notNull(), // "google"
        providerUserId: text("provider_user_id").notNull(), // Google "sub"

        // Optional storage (keep nullable; many apps don't persist these)
        accessToken: text("access_token"),
        refreshToken: text("refresh_token"),
        accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
        scope: text("scope"),
    },
    (t) => ({
        userIdx: index("bp_auth_account_user_idx").on(t.userId),
        providerUq: uniqueIndex("bp_auth_account_provider_uq").on(t.provider, t.providerUserId),
        providerCheck: check("bp_auth_account_provider_check", sql`length(${t.provider}) > 0`),
        providerUserIdCheck: check("bp_auth_account_provider_user_id_check", sql`length(${t.providerUserId}) > 0`),
        userIdCheck: check("bp_auth_account_user_id_check", sql`length(${t.userId}) > 0`),
    }),
);

export const bpSession = sqliteTable(
    "bp_session",
    {
        id: text("id").primaryKey(), // stored in HttpOnly cookie (opaque)

        createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
        expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),

        userId: text("user_id").notNull(),

        // Optional hardening / audit
        ip: text("ip"),
        ua: text("ua"),
    },
    (t) => ({
        userIdx: index("bp_session_user_idx").on(t.userId),
        expIdx: index("bp_session_exp_idx").on(t.expiresAt),
        idCheck: check("bp_session_id_check", sql`length(${t.id}) > 0`),
        userIdCheck: check("bp_session_user_id_check", sql`length(${t.userId}) > 0`),
        expiresCheck: check("bp_session_expires_check", sql`${t.expiresAt} > ${t.createdAt}`),
    }),
);