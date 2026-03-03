// apps/api/src/server.ts
// Biblia Populi — Production API server (Bun + Hono + Drizzle + bun:sqlite)
//
// Endpoints:
//   GET   /health
//   GET   /meta
//   GET   /translations
//   GET   /spine
//   GET   /slice?fromOrd=...&limit=...[&t=KJV]              (alias: translationId)
//   GET   /loc?bookId=GEN&chapter=1&verse=1
//   GET   /books
//   GET   /chapters/:bookId
//   GET   /chapter/:bookId/:chapter[?t=KJV]                (alias: translationId)
//   GET   /search?q=...&limit=...[&t=KJV]                  (alias: translationId)
//   GET   /people/:id
//   GET   /places/:id
//   GET   /events/:id
//
// Auth (DB sessions + Google OAuth):
//   GET   /auth/google/start
//   GET   /auth/google/callback
//   POST  /auth/logout
//   GET   /auth/me
//
// Notes:
// - verse_ord in bp_verse is the global canonical scroll axis.
// - /slice is designed for @tanstack/react-virtual: index = verseOrd - 1.
// - Translation selection: ?t=KJV or ?translationId=KJV (query param wins over env/db default).
// - Orientation-only: no commentary/doctrine storage.

import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { compress } from "hono/compress";
import { etag } from "hono/etag";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { CookieOptions } from "hono/utils/cookie";

import { z } from "zod";
import { and, asc, desc, eq, like, sql as dsql, inArray } from "drizzle-orm";
import * as crypto from "node:crypto";

import { db, sqlite } from "./db/client";
import {
    bpBook,
    bpChapter,
    bpVerse,
    bpVerseText,
    bpTranslation,
    bpRange,
    bpLink,
    bpCrossref,
    bpEntity,
    bpEntityName,
    bpEntityRelation,
    bpPlaceGeo,
    bpEvent,
    bpEventParticipant,
} from "./db/schema";
import { bpUser, bpAuthAccount, bpSession } from "./db/authSchema";

/* --------------------------------- Config --------------------------------- */

const PORT = Number(process.env.PORT ?? "3000");

// Public URLs (use the actual env keys you gave)
const BP_PUBLIC_URL = (process.env.BP_PUBLIC_URL ?? `http://localhost:${PORT}`).trim().replace(/\/+$/g, "");
const BP_WEB_ORIGIN = (process.env.BP_WEB_ORIGIN ?? process.env.BP_CORS_ORIGIN ?? "*").trim();

// Prefer explicit env default, else fall back to DB default translation (bp_translation.is_default)
const ENV_TRANSLATION_ID = (process.env.BP_TRANSLATION_ID ?? "").trim();

// CORS: allow comma-separated list; cookies require non-wildcard
const CORS_RAW = BP_WEB_ORIGIN || "*";
const CORS_LIST = CORS_RAW.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const CORS_WILDCARD = CORS_LIST.length === 0 || CORS_LIST.includes("*");

// Auth
const AUTH_ENABLED = (process.env.BP_AUTH_ENABLED ?? "1").trim() !== "0";
const AUTH_COOKIE = (process.env.BP_AUTH_COOKIE ?? "bp_session").trim();
const AUTH_COOKIE_DOMAIN = (process.env.BP_AUTH_COOKIE_DOMAIN ?? "").trim() || undefined;
const AUTH_COOKIE_PATH = (process.env.BP_AUTH_COOKIE_PATH ?? "/").trim() || "/";
const AUTH_COOKIE_SECURE = (process.env.BP_AUTH_COOKIE_SECURE ?? "").trim()
    ? (process.env.BP_AUTH_COOKIE_SECURE ?? "").trim() === "1"
    : (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
const AUTH_SESSION_DAYS = Number(process.env.BP_AUTH_SESSION_DAYS ?? "30");

// Cookie signing (you provided BP_AUTH_COOKIE_SECRET)
const AUTH_COOKIE_SECRET = (process.env.BP_AUTH_COOKIE_SECRET ?? "").trim();

// Google OAuth (use your BP_* keys; keep legacy fallbacks)
const GOOGLE_CLIENT_ID = (process.env.BP_GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? "").trim();
const GOOGLE_CLIENT_SECRET = (process.env.BP_GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
const GOOGLE_REDIRECT_URI = (
    process.env.BP_GOOGLE_REDIRECT_URI ??
    process.env.GOOGLE_REDIRECT_URI ??
    `${BP_PUBLIC_URL}/auth/google/callback`
).trim();
const GOOGLE_SCOPES = ["openid", "email", "profile"] as const;

// Where to send the user after login (your web app)
const AUTH_AFTER_LOGIN_URL = (process.env.BP_AUTH_AFTER_LOGIN_URL ?? `${BP_WEB_ORIGIN}/reader`).trim();
const AUTH_AFTER_LOGOUT_URL = (process.env.BP_AUTH_AFTER_LOGOUT_URL ?? `${BP_WEB_ORIGIN}/`).trim();

// Start the Bun server unless disabled (useful for tests)
const LISTEN = (process.env.BP_API_LISTEN ?? "1").trim() !== "0";

/* --------------------------------- Helpers -------------------------------- */

type ApiOk<T> = Readonly<{ ok: true; data: T }>;
type ApiErr = Readonly<{ ok: false; error: { code: string; message: string } }>;

type JsonStatus = 200 | 201 | 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500;

function toJsonStatus(n: number): JsonStatus {
    if (n === 200) return 200;
    if (n === 201) return 201;
    if (n === 400) return 400;
    if (n === 401) return 401;
    if (n === 403) return 403;
    if (n === 404) return 404;
    if (n === 409) return 409;
    if (n === 422) return 422;
    if (n === 429) return 429;
    return 500;
}

function jsonOk<T>(c: Context, data: T, extraHeaders?: Record<string, string>) {
    if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders)) c.header(k, v);
    const body: ApiOk<T> = { ok: true, data };
    return c.json(body);
}

// IMPORTANT: use the init overload so Hono accepts our union status cleanly.
function jsonErr(c: Context, status: number, code: string, message: string) {
    const body: ApiErr = { ok: false, error: { code, message } };
    return c.json(body, { status: toJsonStatus(status) });
}

function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
}

function cacheNoStore(c: Context) {
    c.header("Cache-Control", "no-store");
}

function cachePublic(c: Context, seconds: number) {
    c.header("Cache-Control", `public, max-age=${seconds}`);
}

function qstr(c: Context, key: string): string | null {
    const v = (c.req.query(key) ?? "").trim();
    return v ? v : null;
}

function b64url(bytes: Uint8Array): string {
    return Buffer.from(bytes)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function randId(bytes = 18): string {
    return b64url(crypto.randomBytes(bytes));
}

// Use ms timestamps for DB columns (drizzle sqlite { mode: "timestamp_ms" } => number).
function nowMs(): number {
    return Date.now();
}
function msToDate(ms: number): Date {
    return new Date(ms);
}

function daysMs(days: number): number {
    const d = Number.isFinite(days) ? days : 30;
    return Math.max(1, Math.trunc(d)) * 24 * 60 * 60 * 1000;
}

function cookieOpts(expiresAt?: Date): CookieOptions {
    const base: CookieOptions = {
        httpOnly: true,
        sameSite: "Lax",
        secure: AUTH_COOKIE_SECURE,
        path: AUTH_COOKIE_PATH,
    };
    if (AUTH_COOKIE_DOMAIN) base.domain = AUTH_COOKIE_DOMAIN;
    if (expiresAt) base.expires = expiresAt;
    return base;
}

/* ------------------------------ Cookie signing ----------------------------- */
/**
 * Prevents trivial cookie tampering; session ids are still DB-validated.
 * Format: <value>.<sig> where sig = base64url(hmacSha256(secret, value)).
 * If secret is empty, we fall back to raw cookie values (dev).
 */

function hmacSig(value: string): string {
    if (!AUTH_COOKIE_SECRET) return "";
    const h = crypto.createHmac("sha256", AUTH_COOKIE_SECRET).update(value, "utf8").digest();
    return b64url(h);
}

function safeEqual(a: string, b: string): boolean {
    try {
        const aa = Buffer.from(a, "utf8");
        const bb = Buffer.from(b, "utf8");
        if (aa.length !== bb.length) return false;
        return crypto.timingSafeEqual(aa, bb);
    } catch {
        return false;
    }
}

function packCookieValue(value: string): string {
    if (!AUTH_COOKIE_SECRET) return value;
    return `${value}.${hmacSig(value)}`;
}

function unpackCookieValue(packed: string): string | null {
    const s = packed.trim();
    if (!s) return null;

    // dev / legacy
    if (!AUTH_COOKIE_SECRET) return s;

    const dot = s.lastIndexOf(".");
    if (dot <= 0) {
        // allow legacy raw sid during transition; DB validation still applies
        return s;
    }

    const value = s.slice(0, dot);
    const sig = s.slice(dot + 1);
    const expected = hmacSig(value);
    if (!sig || !expected) return null;
    if (!safeEqual(sig, expected)) return null;
    return value;
}

/* --------------------------------- Schemas -------------------------------- */

const RefBookIdSchema = z.string().min(2).max(8).regex(/^[A-Z0-9_]+$/);
const ChapterNumSchema = z.coerce.number().int().min(1).max(200);
const VerseNumSchema = z.coerce.number().int().min(1).max(200);

const SearchQuerySchema = z.string().trim().min(1).max(200);
const SliceFromSchema = z.coerce.number().int().min(1).max(1_000_000);
const SliceLimitSchema = z.coerce.number().int().min(1).max(2_000);

const TranslationIdSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/);

/* ---------------------------- Translation metadata -------------------------- */

type TranslationRow = Readonly<{
    translationId: string;
    name: string | null;
    language: string | null;
    derivedFrom: string | null;
    licenseKind: string | null;
    licenseText: string | null;
    sourceUrl: string | null;
    isDefault: number; // 0/1
    createdAt: string | null;
}>;

type TranslationMeta = Readonly<{
    translationId: string;
    name: string | null;
    language: string | null;
    derivedFrom: string | null;
    licenseKind: string | null;
    licenseText: string | null;
    sourceUrl: string | null;
    isDefault: boolean;
    createdAt: string | null;
}>;

function toTranslationMeta(r: TranslationRow): TranslationMeta {
    return {
        translationId: r.translationId,
        name: r.name,
        language: r.language,
        derivedFrom: r.derivedFrom,
        licenseKind: r.licenseKind,
        licenseText: r.licenseText,
        sourceUrl: r.sourceUrl,
        isDefault: !!r.isDefault,
        createdAt: r.createdAt,
    };
}

/* ------------------------ Translation selection cache ----------------------- */

const TRANSLATIONS_CACHE_MS = 30_000;

let _translationsCache:
    | null
    | Readonly<{
    at: number;
    rows: TranslationRow[];
    byId: Map<string, TranslationRow>;
    defaultId: string | null;
}> = null;

function readTranslationsRaw(): TranslationRow[] {
    const rows = sqlite
        .query(
            `
                SELECT
                    translation_id AS translationId,
                    name           AS name,
                    language       AS language,
                    derived_from   AS derivedFrom,
                    license_kind   AS licenseKind,
                    license_text   AS licenseText,
                    source_url     AS sourceUrl,
                    is_default     AS isDefault,
                    created_at     AS createdAt
                FROM bp_translation
                ORDER BY is_default DESC, name ASC, translation_id ASC;
            `,
        )
        .all() as TranslationRow[];

    return rows ?? [];
}

function getTranslationsCached(): Readonly<{
    rows: TranslationRow[];
    byId: Map<string, TranslationRow>;
    defaultId: string | null;
}> {
    const now = Date.now();
    const hit = _translationsCache;
    if (hit && now - hit.at < TRANSLATIONS_CACHE_MS) return hit;

    const rows = readTranslationsRaw();
    const byId = new Map<string, TranslationRow>();
    for (const r of rows) byId.set(r.translationId, r);

    const defaultId = rows.find((r) => r.isDefault)?.translationId ?? null;

    _translationsCache = Object.freeze({ at: now, rows, byId, defaultId });
    return _translationsCache;
}

let _resolvedTranslationId: string | null = null;
async function resolveDefaultTranslationId(): Promise<string | null> {
    if (_resolvedTranslationId) return _resolvedTranslationId;

    if (ENV_TRANSLATION_ID) {
        _resolvedTranslationId = ENV_TRANSLATION_ID;
        return _resolvedTranslationId;
    }

    const cached = getTranslationsCached();
    if (cached.defaultId) {
        _resolvedTranslationId = cached.defaultId;
        return _resolvedTranslationId;
    }

    const rows = await db
        .select({ translationId: bpTranslation.translationId })
        .from(bpTranslation)
        .where(eq(bpTranslation.isDefault, true))
        .limit(1);

    _resolvedTranslationId = rows[0]?.translationId ?? null;
    return _resolvedTranslationId;
}

function getQueryTranslationId(c: Context): string | null {
    return (qstr(c, "translationId") ?? qstr(c, "t") ?? "").trim() || null;
}

type PickedTranslation = Readonly<{ translationId: string; row: TranslationRow }>;

async function pickTranslation(c: Context): Promise<PickedTranslation | Response> {
    const q = getQueryTranslationId(c);

    if (q) {
        const p = TranslationIdSchema.safeParse(q);
        if (!p.success) return jsonErr(c, 400, "BAD_TRANSLATION", "Invalid translationId.");

        const cached = getTranslationsCached();
        const row = cached.byId.get(p.data);
        if (!row) return jsonErr(c, 404, "NO_TRANSLATION_ID", `Unknown translationId '${p.data}'.`);

        return { translationId: row.translationId, row };
    }

    const def = await resolveDefaultTranslationId();
    if (!def) {
        return jsonErr(
            c,
            404,
            "NO_TRANSLATION",
            "No translation configured. Seed bp_translation (is_default=1) or set BP_TRANSLATION_ID.",
        );
    }

    const cached = getTranslationsCached();
    const row = cached.byId.get(def);
    if (!row) return jsonErr(c, 404, "NO_TRANSLATION_ID", `Unknown translationId '${def}'.`);

    return { translationId: row.translationId, row };
}

/* ----------------------------- Other fast caches ---------------------------- */

let _hasFts: boolean | null = null;
function hasFts(): boolean {
    if (_hasFts != null) return _hasFts;

    const row = sqlite
        .query(`SELECT 1 AS one FROM sqlite_master WHERE type='table' AND name='bp_verse_text_fts' LIMIT 1;`)
        .get() as { one?: number } | undefined;

    _hasFts = row != null;
    return _hasFts;
}

type SpineStats = Readonly<{ verseOrdMin: number; verseOrdMax: number; verseCount: number }>;
let _spineStats: SpineStats | null = null;

function getSpineStats(): SpineStats {
    if (_spineStats) return _spineStats;

    const row = sqlite
        .query(
            `
                SELECT
                    MIN(verse_ord) AS mn,
                    MAX(verse_ord) AS mx,
                    COUNT(*)       AS c
                FROM bp_verse;
            `,
        )
        .get() as { mn?: number; mx?: number; c?: number } | undefined;

    const mn = Number(row?.mn ?? 0);
    const mx = Number(row?.mx ?? 0);
    const c = Number(row?.c ?? 0);

    _spineStats = Object.freeze({
        verseOrdMin: Number.isFinite(mn) && mn > 0 ? Math.trunc(mn) : 1,
        verseOrdMax: Number.isFinite(mx) && mx > 0 ? Math.trunc(mx) : 0,
        verseCount: Number.isFinite(c) && c >= 0 ? Math.trunc(c) : 0,
    });

    return _spineStats;
}

type ChapterBounds = Readonly<{
    startVerseOrd: number;
    endVerseOrd: number;
    verseCount?: number;
    source: "bp_chapter" | "computed";
}>;

async function getChapterBounds(bookId: string, chapter: number): Promise<ChapterBounds | null> {
    const byChapter = await db
        .select({
            startVerseOrd: bpChapter.startVerseOrd,
            endVerseOrd: bpChapter.endVerseOrd,
            verseCount: bpChapter.verseCount,
        })
        .from(bpChapter)
        .where(and(eq(bpChapter.bookId, bookId), eq(bpChapter.chapter, chapter)))
        .limit(1);

    if (byChapter[0]) {
        return {
            startVerseOrd: byChapter[0].startVerseOrd,
            endVerseOrd: byChapter[0].endVerseOrd,
            verseCount: byChapter[0].verseCount,
            source: "bp_chapter",
        };
    }

    const agg = await db
        .select({
            startVerseOrd: dsql<number>`min(${bpVerse.verseOrd})`.as("start_verse_ord"),
            endVerseOrd: dsql<number>`max(${bpVerse.verseOrd})`.as("end_verse_ord"),
            verseCount: dsql<number>`count(*)`.as("verse_count"),
        })
        .from(bpVerse)
        .where(and(eq(bpVerse.bookId, bookId), eq(bpVerse.chapter, chapter)))
        .limit(1);

    const row = agg[0];
    if (!row || row.startVerseOrd == null || row.endVerseOrd == null) return null;

    return {
        startVerseOrd: Number(row.startVerseOrd),
        endVerseOrd: Number(row.endVerseOrd),
        verseCount: Number(row.verseCount ?? 0),
        source: "computed",
    };
}

async function fetchEntityBase(kind: "PERSON" | "PLACE", id: string) {
    const ent = await db
        .select({
            entityId: bpEntity.entityId,
            kind: bpEntity.kind,
            canonicalName: bpEntity.canonicalName,
            slug: bpEntity.slug,
            summaryNeutral: bpEntity.summaryNeutral,
            confidence: bpEntity.confidence,
            createdAt: bpEntity.createdAt,
        })
        .from(bpEntity)
        .where(and(eq(bpEntity.entityId, id), eq(bpEntity.kind, kind)))
        .limit(1);

    if (!ent[0]) return null;

    const names = await db
        .select({
            entityNameId: bpEntityName.entityNameId,
            name: bpEntityName.name,
            language: bpEntityName.language,
            isPrimary: bpEntityName.isPrimary,
            source: bpEntityName.source,
            confidence: bpEntityName.confidence,
        })
        .from(bpEntityName)
        .where(eq(bpEntityName.entityId, id))
        .orderBy(asc(bpEntityName.name));

    return { entity: ent[0], names };
}

/* ------------------------------ Auth helpers -------------------------------- */

type AuthedUser = Readonly<{
    id: string;
    displayName: string | null;
    email: string | null;
    emailVerifiedAt: Date | null;
    disabledAt: Date | null;
}>;

type AppVars = {
    user: AuthedUser | null;
    sessionId: string | null;
};

/* ------------------------------- Sessions ---------------------------------- */

async function loadUserFromSession(sessionId: string): Promise<AuthedUser | null> {
    const now = nowMs();

    const sess = await db
        .select({
            id: bpSession.id,
            userId: bpSession.userId,
            expiresAt: bpSession.expiresAt, // number (timestamp_ms)
        })
        .from(bpSession)
        .where(eq(bpSession.id, sessionId))
        .limit(1);

    const s = sess[0];
    if (!s) return null;

    if (Number(s.expiresAt) <= now) {
        // best-effort cleanup
        db.delete(bpSession).where(eq(bpSession.id, sessionId)).run();
        return null;
    }

    const rows = await db
        .select({
            id: bpUser.id,
            displayName: bpUser.displayName,
            email: bpUser.email,
            emailVerifiedAt: bpUser.emailVerifiedAt, // number | null
            disabledAt: bpUser.disabledAt, // number | null
        })
        .from(bpUser)
        .where(eq(bpUser.id, s.userId))
        .limit(1);

    const u = rows[0];
    if (!u) return null;
    if (u.disabledAt != null) return null;

    return {
        id: u.id,
        displayName: u.displayName ?? null,
        email: u.email ?? null,
        emailVerifiedAt: u.emailVerifiedAt != null ? msToDate(Number(u.emailVerifiedAt)) : null,
        disabledAt: u.disabledAt != null ? msToDate(Number(u.disabledAt)) : null,
    };
}

async function createSessionForUser(c: Context, userId: string): Promise<string> {
    const sid = randId(24);
    const createdAt = nowMs();
    const expiresAt = createdAt + daysMs(AUTH_SESSION_DAYS);

    // NOTE: drizzle sqlite insert typing in some versions prefers array-form.
    await db.insert(bpSession).values([
        {
            id: sid,
            createdAt,
            expiresAt,
            userId,
            ip: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
            ua: c.req.header("user-agent") ?? null,
        },
    ]);

    setCookie(c, AUTH_COOKIE, packCookieValue(sid), cookieOpts(msToDate(expiresAt)));
    return sid;
}

async function destroySession(c: Context, sessionId: string | null): Promise<void> {
    if (sessionId) {
        db.delete(bpSession).where(eq(bpSession.id, sessionId)).run();
    }
    deleteCookie(c, AUTH_COOKIE, cookieOpts());
}

/* ------------------------- Google OAuth minimal flow ------------------------ */
/**
 * Minimal OAuth 2.0 Authorization Code + PKCE:
 * - /auth/google/start generates state + verifier, stores both in short cookies, redirects to Google
 * - /auth/google/callback validates state, exchanges code for tokens, fetches userinfo, upserts user+account, issues session cookie
 *
 * Requirements (your env keys):
 * - BP_GOOGLE_CLIENT_ID, BP_GOOGLE_CLIENT_SECRET
 * - BP_PUBLIC_URL (or BP_GOOGLE_REDIRECT_URI)
 * - BP_WEB_ORIGIN for CORS + redirects
 */

const OAUTH_STATE_COOKIE = "bp_oauth_state";
const OAUTH_VERIFIER_COOKIE = "bp_oauth_verifier";
const OAUTH_TMP_MS = 10 * 60 * 1000;

function oauthTmpCookieOpts(): CookieOptions {
    const exp = new Date(Date.now() + OAUTH_TMP_MS);
    const base: CookieOptions = {
        ...cookieOpts(exp),
        httpOnly: true,
        sameSite: "Lax",
        secure: AUTH_COOKIE_SECURE,
        path: "/",
    };
    return base;
}

function sha256Base64Url(s: string): string {
    const h = crypto.createHash("sha256").update(s, "utf8").digest();
    return b64url(h);
}

function googleAuthUrl(state: string, codeChallenge: string): string {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    u.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
    u.searchParams.set("state", state);
    u.searchParams.set("code_challenge", codeChallenge);
    u.searchParams.set("code_challenge_method", "S256");
    u.searchParams.set("access_type", "offline");
    u.searchParams.set("prompt", "consent");
    return u.toString();
}

type GoogleTokenResponse = {
    access_token: string;
    expires_in: number;
    scope?: string;
    token_type: string;
    id_token?: string;
    refresh_token?: string;
};

async function googleExchangeCode(code: string, codeVerifier: string): Promise<GoogleTokenResponse> {
    const form = new URLSearchParams();
    form.set("client_id", GOOGLE_CLIENT_ID);
    form.set("client_secret", GOOGLE_CLIENT_SECRET);
    form.set("redirect_uri", GOOGLE_REDIRECT_URI);
    form.set("grant_type", "authorization_code");
    form.set("code", code);
    form.set("code_verifier", codeVerifier);

    const res = await globalThis.fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`google token exchange failed: ${res.status} ${text}`);
    }

    return (await res.json()) as GoogleTokenResponse;
}

type GoogleUserInfo = {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
};

async function googleFetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const res = await globalThis.fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`google userinfo failed: ${res.status} ${text}`);
    }
    return (await res.json()) as GoogleUserInfo;
}

async function upsertGoogleUser(
    info: GoogleUserInfo,
    tokens: GoogleTokenResponse,
): Promise<{ userId: string; displayName: string | null; email: string | null }> {
    const now = nowMs();
    const provider = "google";
    const providerUserId = info.sub;

    const existingAcc = await db
        .select({ id: bpAuthAccount.id, userId: bpAuthAccount.userId })
        .from(bpAuthAccount)
        .where(and(eq(bpAuthAccount.provider, provider), eq(bpAuthAccount.providerUserId, providerUserId)))
        .limit(1);

    let userId: string | null = existingAcc[0]?.userId ?? null;

    const email = info.email?.trim() ? info.email.trim() : null;
    const displayName = info.name?.trim() ? info.name.trim() : null;
    const emailVerifiedAt: number | null = info.email_verified ? now : null;

    if (!userId && email) {
        const byEmail = await db.select({ id: bpUser.id }).from(bpUser).where(eq(bpUser.email, email)).limit(1);
        userId = byEmail[0]?.id ?? null;
    }

    if (!userId) {
        userId = randId(18);
        await db.insert(bpUser).values([
            {
                id: userId,
                createdAt: now,
                updatedAt: now,
                displayName,
                email,
                emailVerifiedAt,
                passwordHash: null,
                disabledAt: null,
            },
        ]);
    } else {
        await db
            .update(bpUser)
            .set({
                updatedAt: now,
                displayName: displayName ?? null,
                email: email ?? null,
                emailVerifiedAt: emailVerifiedAt ?? null,
            })
            .where(eq(bpUser.id, userId));
    }

    const accId = existingAcc[0]?.id ?? randId(18);
    const accessTokenExpiresAt: number | null = tokens.expires_in ? now + tokens.expires_in * 1000 : null;

    await db
        .insert(bpAuthAccount)
        .values([
            {
                id: accId,
                createdAt: now,
                updatedAt: now,
                userId,
                provider,
                providerUserId,
                accessToken: tokens.access_token ?? null,
                refreshToken: tokens.refresh_token ?? null,
                accessTokenExpiresAt,
                scope: tokens.scope ?? null,
            },
        ])
        .onConflictDoUpdate({
            target: bpAuthAccount.id,
            set: {
                updatedAt: now,
                userId,
                accessToken: tokens.access_token ?? null,
                refreshToken: tokens.refresh_token ?? null,
                accessTokenExpiresAt,
                scope: tokens.scope ?? null,
            },
        });

    return { userId, displayName, email };
}

function authMisconfigured(): boolean {
    return !!(AUTH_ENABLED && (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI));
}

/* ----------------------------------- App ---------------------------------- */

const app = new Hono<{ Variables: AppVars }>();

app.use("*", async (c, next) => {
    c.header("Vary", "Origin, Accept-Encoding");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    await next();
});

app.use("*", logger());
app.use("*", compress());
app.use("*", etag());

app.use(
    "*",
    cors({
        origin: CORS_WILDCARD
            ? "*"
            : (origin: string) => {
                if (!origin) return null;
                return CORS_LIST.includes(origin) ? origin : null;
            },
        allowHeaders: ["Content-Type"],
        allowMethods: ["GET", "POST", "OPTIONS"],
        credentials: !CORS_WILDCARD,
    }),
);

app.use("*", async (c, next) => {
    // session middleware
    if (!AUTH_ENABLED) {
        c.set("user", null);
        c.set("sessionId", null);
        return next();
    }

    const raw = (getCookie(c, AUTH_COOKIE) ?? "").trim();
    const sid = raw ? unpackCookieValue(raw) : null;

    if (!sid) {
        c.set("user", null);
        c.set("sessionId", null);
        return next();
    }

    try {
        const u = await loadUserFromSession(sid);
        c.set("user", u);
        c.set("sessionId", u ? sid : null);

        // If invalid session, clear cookie
        if (!u) {
            deleteCookie(c, AUTH_COOKIE, cookieOpts());
        } else if (AUTH_COOKIE_SECRET && raw !== packCookieValue(sid)) {
            // upgrade legacy cookie to signed
            setCookie(c, AUTH_COOKIE, packCookieValue(sid), cookieOpts());
        }
    } catch {
        c.set("user", null);
        c.set("sessionId", null);
    }

    return next();
});

app.onError((err, c) => {
    // eslint-disable-next-line no-console
    console.error("[api] error:", err);
    return jsonErr(c, 500, "INTERNAL", "Internal server error.");
});

/* ---------------------------------- Routes -------------------------------- */

// Root
app.get("/", (c) => {
    cacheNoStore(c);
    return c.redirect("/health", 302);
});

// Health
app.get("/health", (c) => {
    cacheNoStore(c);
    return c.text("ok");
});

// Auth: me
app.get("/auth/me", (c) => {
    cacheNoStore(c);
    return jsonOk(c, { user: c.get("user") });
});

// Auth: start google
app.get("/auth/google/start", (c) => {
    cacheNoStore(c);

    if (authMisconfigured()) {
        return jsonErr(
            c,
            500,
            "AUTH_MISCONFIGURED",
            "Google OAuth is not configured. Set BP_GOOGLE_CLIENT_ID/BP_GOOGLE_CLIENT_SECRET (and BP_PUBLIC_URL or BP_GOOGLE_REDIRECT_URI) and enable auth.",
        );
    }

    const state = randId(18);
    const verifier = randId(32);
    const challenge = sha256Base64Url(verifier);

    setCookie(c, OAUTH_STATE_COOKIE, packCookieValue(state), oauthTmpCookieOpts());
    setCookie(c, OAUTH_VERIFIER_COOKIE, packCookieValue(verifier), oauthTmpCookieOpts());

    return c.redirect(googleAuthUrl(state, challenge), 302);
});

// Auth: callback
app.get("/auth/google/callback", async (c) => {
    cacheNoStore(c);

    if (authMisconfigured()) {
        return jsonErr(
            c,
            500,
            "AUTH_MISCONFIGURED",
            "Google OAuth is not configured. Set BP_GOOGLE_CLIENT_ID/BP_GOOGLE_CLIENT_SECRET (and BP_PUBLIC_URL or BP_GOOGLE_REDIRECT_URI) and enable auth.",
        );
    }

    const code = (c.req.query("code") ?? "").trim();
    const state = (c.req.query("state") ?? "").trim();

    if (!code || !state) {
        return jsonErr(c, 400, "BAD_OAUTH_CALLBACK", "Missing code/state.");
    }

    const stateCookieRaw = (getCookie(c, OAUTH_STATE_COOKIE) ?? "").trim();
    const verifierCookieRaw = (getCookie(c, OAUTH_VERIFIER_COOKIE) ?? "").trim();

    const stateCookie = stateCookieRaw ? unpackCookieValue(stateCookieRaw) : null;
    const verifierCookie = verifierCookieRaw ? unpackCookieValue(verifierCookieRaw) : null;

    // clear temp cookies regardless (one-shot)
    deleteCookie(c, OAUTH_STATE_COOKIE, { ...oauthTmpCookieOpts(), expires: new Date(0) });
    deleteCookie(c, OAUTH_VERIFIER_COOKIE, { ...oauthTmpCookieOpts(), expires: new Date(0) });

    if (!stateCookie || stateCookie !== state || !verifierCookie) {
        return jsonErr(c, 401, "OAUTH_STATE_MISMATCH", "Invalid OAuth state.");
    }

    try {
        const tokens = await googleExchangeCode(code, verifierCookie);
        const info = await googleFetchUserInfo(tokens.access_token);

        if (!info.sub) return jsonErr(c, 401, "OAUTH_NO_SUB", "Provider did not return a user id.");

        const { userId } = await upsertGoogleUser(info, tokens);
        await createSessionForUser(c, userId);

        return c.redirect(AUTH_AFTER_LOGIN_URL, 302);
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[auth] google callback error:", e);
        return jsonErr(c, 500, "OAUTH_FAILED", "OAuth exchange failed.");
    }
});

// Auth: logout
app.post("/auth/logout", async (c) => {
    cacheNoStore(c);
    const sid = c.get("sessionId");
    await destroySession(c, sid);
    return jsonOk(c, { redirect: AUTH_AFTER_LOGOUT_URL });
});

// List available translations
app.get("/translations", (c) => {
    cachePublic(c, 60);
    const cached = getTranslationsCached();
    return jsonOk(c, { translations: cached.rows.map(toTranslationMeta) });
});

// Meta: selected translation + all translations + fts + spine stats
app.get("/meta", async (c) => {
    cacheNoStore(c);

    const picked = await pickTranslation(c);
    if (picked instanceof Response) return picked;

    const cached = getTranslationsCached();

    return jsonOk(c, {
        translation: toTranslationMeta(picked.row),
        translations: cached.rows.map(toTranslationMeta),
        ftsEnabled: hasFts(),
        spine: getSpineStats(),
        auth: {
            enabled: AUTH_ENABLED,
            user: c.get("user"),
        },
    });
});

// Global spine stats (for virtualization / infinite scroll)
app.get("/spine", (c) => {
    cachePublic(c, 30);
    return jsonOk(c, getSpineStats());
});

// Contiguous verse window keyed by global verse_ord
app.get("/slice", async (c) => {
    cachePublic(c, 10);

    const picked = await pickTranslation(c);
    if (picked instanceof Response) return picked;
    const translationId = picked.translationId;

    const fromP = SliceFromSchema.safeParse(c.req.query("fromOrd") ?? "1");
    if (!fromP.success) return jsonErr(c, 400, "BAD_FROM", "Invalid fromOrd.");

    const limitP = SliceLimitSchema.safeParse(c.req.query("limit") ?? "240");
    if (!limitP.success) return jsonErr(c, 400, "BAD_LIMIT", "Invalid limit.");

    const spine = getSpineStats();
    if (spine.verseOrdMax <= 0) {
        return jsonOk(c, {
            translationId,
            fromOrd: fromP.data,
            limit: limitP.data,
            verses: [],
            done: true,
            nextFromOrd: null,
            spine,
        });
    }

    const fromOrd = clamp(fromP.data, spine.verseOrdMin, spine.verseOrdMax);
    const limit = clamp(limitP.data, 1, 2000);

    const verses = sqlite
        .query(
            `
                SELECT
                    v.verse_key  AS verseKey,
                    v.verse_ord  AS verseOrd,
                    v.book_id    AS bookId,
                    v.chapter    AS chapter,
                    v.verse      AS verse,
                    t.text       AS text,
                    t.updated_at AS updatedAt
                FROM bp_verse v
                         LEFT JOIN bp_verse_text t
                                   ON t.verse_key = v.verse_key
                                       AND t.translation_id = ?
                WHERE v.verse_ord >= ?
                ORDER BY v.verse_ord
                    LIMIT ?;
            `,
        )
        .all(translationId, fromOrd, limit) as Array<{
        verseKey: string;
        verseOrd: number;
        bookId: string;
        chapter: number;
        verse: number;
        text: string | null;
        updatedAt: string | null;
    }>;

    const lastOrd = verses.length ? Number(verses[verses.length - 1]!.verseOrd) : fromOrd - 1;
    const done = lastOrd >= spine.verseOrdMax || verses.length === 0;
    const nextFromOrd = done ? null : lastOrd + 1;

    return jsonOk(c, { translationId, fromOrd, limit, verses, done, nextFromOrd, spine });
});

// Resolve a reference to verse_ord (supports chapter-only).
app.get("/loc", async (c) => {
    cachePublic(c, 60);

    const bookIdP = RefBookIdSchema.safeParse((c.req.query("bookId") ?? "").trim());
    if (!bookIdP.success) return jsonErr(c, 400, "BAD_BOOK", "Invalid bookId.");

    const chapterP = ChapterNumSchema.safeParse(c.req.query("chapter") ?? "");
    if (!chapterP.success) return jsonErr(c, 400, "BAD_CHAPTER", "Invalid chapter.");

    const verseRaw = (c.req.query("verse") ?? "").trim();
    const verseP = verseRaw ? VerseNumSchema.safeParse(verseRaw) : null;
    if (verseP && !verseP.success) return jsonErr(c, 400, "BAD_VERSE", "Invalid verse.");

    const bookId = bookIdP.data;
    const chapter = chapterP.data;

    if (verseP?.success) {
        const verse = verseP.data;

        const row = sqlite
            .query(
                `
                    SELECT
                        verse_key AS verseKey,
                        verse_ord AS verseOrd,
                        book_id   AS bookId,
                        chapter   AS chapter,
                        verse     AS verse
                    FROM bp_verse
                    WHERE book_id = ?
                      AND chapter = ?
                      AND verse = ?
                        LIMIT 1;
                `,
            )
            .get(bookId, chapter, verse) as
            | { verseKey: string; verseOrd: number; bookId: string; chapter: number; verse: number }
            | undefined;

        return jsonOk(c, row ?? null);
    }

    const first = sqlite
        .query(
            `
                SELECT
                    verse_key AS verseKey,
                    verse_ord AS verseOrd,
                    book_id   AS bookId,
                    chapter   AS chapter,
                    verse     AS verse
                FROM bp_verse
                WHERE book_id = ?
                  AND chapter = ?
                ORDER BY verse
                    LIMIT 1;
            `,
        )
        .get(bookId, chapter) as
        | { verseKey: string; verseOrd: number; bookId: string; chapter: number; verse: number }
        | undefined;

    return jsonOk(c, first ?? null);
});

// Books (canonical order)
app.get("/books", async (c) => {
    cachePublic(c, 60);

    const books = await db
        .select({
            bookId: bpBook.bookId,
            ordinal: bpBook.ordinal,
            testament: bpBook.testament,
            name: bpBook.name,
            nameShort: bpBook.nameShort,
            chapters: bpBook.chapters,
            osised: bpBook.osised,
            abbrs: bpBook.abbrs,
        })
        .from(bpBook)
        .orderBy(asc(bpBook.ordinal));

    return jsonOk(c, { books });
});

// Chapters meta for a book
app.get("/chapters/:bookId", async (c) => {
    cachePublic(c, 60);

    const bookIdP = RefBookIdSchema.safeParse(c.req.param("bookId"));
    if (!bookIdP.success) return jsonErr(c, 400, "BAD_BOOK", "Invalid bookId.");

    const bookId = bookIdP.data;

    const rows = await db
        .select({
            chapter: bpChapter.chapter,
            startVerseOrd: bpChapter.startVerseOrd,
            endVerseOrd: bpChapter.endVerseOrd,
            verseCount: bpChapter.verseCount,
        })
        .from(bpChapter)
        .where(eq(bpChapter.bookId, bookId))
        .orderBy(asc(bpChapter.chapter));

    return jsonOk(c, { bookId, chapters: rows });
});

// Chapter payload (+ orientation overlays)
app.get("/chapter/:bookId/:chapter", async (c) => {
    cachePublic(c, 30);

    const bookIdP = RefBookIdSchema.safeParse(c.req.param("bookId"));
    if (!bookIdP.success) return jsonErr(c, 400, "BAD_BOOK", "Invalid bookId.");

    const chapterP = ChapterNumSchema.safeParse(c.req.param("chapter"));
    if (!chapterP.success) return jsonErr(c, 400, "BAD_CHAPTER", "Invalid chapter number.");

    const picked = await pickTranslation(c);
    if (picked instanceof Response) return picked;
    const translationId = picked.translationId;

    const bookId = bookIdP.data;
    const chapterNum = chapterP.data;

    const bounds = await getChapterBounds(bookId, chapterNum);
    if (!bounds) return jsonErr(c, 404, "CHAPTER_NOT_FOUND", "Chapter not found in bp_verse.");

    const verses = await db
        .select({
            verseKey: bpVerse.verseKey,
            verseOrd: bpVerse.verseOrd,
            chapter: bpVerse.chapter,
            verse: bpVerse.verse,
            text: bpVerseText.text,
            updatedAt: bpVerseText.updatedAt,
        })
        .from(bpVerse)
        .leftJoin(
            bpVerseText,
            and(eq(bpVerseText.verseKey, bpVerse.verseKey), eq(bpVerseText.translationId, translationId)),
        )
        .where(and(eq(bpVerse.bookId, bookId), eq(bpVerse.chapter, chapterNum)))
        .orderBy(asc(bpVerse.verse));

    const ranges = await db
        .select({
            rangeId: bpRange.rangeId,
            startVerseOrd: bpRange.startVerseOrd,
            endVerseOrd: bpRange.endVerseOrd,
            startVerseKey: bpRange.startVerseKey,
            endVerseKey: bpRange.endVerseKey,
            label: bpRange.label,
        })
        .from(bpRange)
        .where(
            and(
                dsql`${bpRange.startVerseOrd} <= ${bounds.endVerseOrd}`,
                dsql`${bpRange.endVerseOrd} >= ${bounds.startVerseOrd}`,
            ),
        )
        .orderBy(asc(bpRange.startVerseOrd), asc(bpRange.endVerseOrd));

    const rangeIds = ranges.map((r) => r.rangeId);

    const links =
        rangeIds.length === 0
            ? []
            : await db
                .select({
                    linkId: bpLink.linkId,
                    rangeId: bpLink.rangeId,
                    targetKind: bpLink.targetKind,
                    targetId: bpLink.targetId,
                    linkKind: bpLink.linkKind,
                    weight: bpLink.weight,
                    source: bpLink.source,
                    confidence: bpLink.confidence,
                })
                .from(bpLink)
                .where(inArray(bpLink.rangeId, rangeIds))
                .orderBy(asc(bpLink.rangeId), asc(bpLink.linkKind));

    const crossrefs =
        rangeIds.length === 0
            ? []
            : await db
                .select({
                    crossrefId: bpCrossref.crossrefId,
                    fromRangeId: bpCrossref.fromRangeId,
                    toRangeId: bpCrossref.toRangeId,
                    kind: bpCrossref.kind,
                    source: bpCrossref.source,
                    confidence: bpCrossref.confidence,
                })
                .from(bpCrossref)
                .where(inArray(bpCrossref.fromRangeId, rangeIds))
                .orderBy(asc(bpCrossref.fromRangeId));

    return jsonOk(c, {
        translationId,
        bookId,
        chapter: chapterNum,
        chapterBounds: bounds,
        verses,
        ranges,
        links,
        crossrefs,
        marks: [] as unknown[],
        mentions: [] as unknown[],
        footnotes: [] as unknown[],
    });
});

// PERSON drawer
app.get("/people/:id", async (c) => {
    cachePublic(c, 60);
    const id = c.req.param("id");

    const base = await fetchEntityBase("PERSON", id);
    if (!base) return jsonOk(c, null);

    const relFrom = await db
        .select({
            relationId: bpEntityRelation.relationId,
            fromEntityId: bpEntityRelation.fromEntityId,
            toEntityId: bpEntityRelation.toEntityId,
            kind: bpEntityRelation.kind,
            timeSpanId: bpEntityRelation.timeSpanId,
            source: bpEntityRelation.source,
            confidence: bpEntityRelation.confidence,
            noteNeutral: bpEntityRelation.noteNeutral,
        })
        .from(bpEntityRelation)
        .where(eq(bpEntityRelation.fromEntityId, id));

    const relTo = await db
        .select({
            relationId: bpEntityRelation.relationId,
            fromEntityId: bpEntityRelation.fromEntityId,
            toEntityId: bpEntityRelation.toEntityId,
            kind: bpEntityRelation.kind,
            timeSpanId: bpEntityRelation.timeSpanId,
            source: bpEntityRelation.source,
            confidence: bpEntityRelation.confidence,
            noteNeutral: bpEntityRelation.noteNeutral,
        })
        .from(bpEntityRelation)
        .where(eq(bpEntityRelation.toEntityId, id));

    return jsonOk(c, { ...base, relations: { from: relFrom, to: relTo } });
});

// PLACE drawer (+ geo)
app.get("/places/:id", async (c) => {
    cachePublic(c, 60);
    const id = c.req.param("id");

    const base = await fetchEntityBase("PLACE", id);
    if (!base) return jsonOk(c, null);

    const geos = await db
        .select({
            placeGeoId: bpPlaceGeo.placeGeoId,
            geoType: bpPlaceGeo.geoType,
            lat: bpPlaceGeo.lat,
            lng: bpPlaceGeo.lng,
            bbox: bpPlaceGeo.bbox,
            polygon: bpPlaceGeo.polygon,
            precisionM: bpPlaceGeo.precisionM,
            source: bpPlaceGeo.source,
            confidence: bpPlaceGeo.confidence,
        })
        .from(bpPlaceGeo)
        .where(eq(bpPlaceGeo.entityId, id));

    return jsonOk(c, { ...base, geos });
});

// EVENT drawer (+ participants)
app.get("/events/:id", async (c) => {
    cachePublic(c, 60);
    const id = c.req.param("id");

    const ev = await db
        .select({
            eventId: bpEvent.eventId,
            canonicalTitle: bpEvent.canonicalTitle,
            kind: bpEvent.kind,
            primaryRangeId: bpEvent.primaryRangeId,
            timeSpanId: bpEvent.timeSpanId,
            primaryPlaceId: bpEvent.primaryPlaceId,
            source: bpEvent.source,
            confidence: bpEvent.confidence,
        })
        .from(bpEvent)
        .where(eq(bpEvent.eventId, id))
        .limit(1);

    if (!ev[0]) return jsonOk(c, null);

    const participants = await db
        .select({
            eventParticipantId: bpEventParticipant.eventParticipantId,
            entityId: bpEventParticipant.entityId,
            role: bpEventParticipant.role,
            confidence: bpEventParticipant.confidence,
        })
        .from(bpEventParticipant)
        .where(eq(bpEventParticipant.eventId, id));

    return jsonOk(c, { event: ev[0], participants });
});

// Search (FTS5 preferred; fallback to LIKE)
app.get("/search", async (c) => {
    cachePublic(c, 10);

    const qRaw = (c.req.query("q") ?? "").trim();
    const qP = SearchQuerySchema.safeParse(qRaw);
    if (!qP.success) return jsonOk(c, { q: qRaw, mode: "none" as const, results: [] as unknown[] });

    const q = qP.data;
    const limit = clamp(Number(c.req.query("limit") ?? "30"), 1, 100);

    const picked = await pickTranslation(c);
    if (picked instanceof Response) return picked;
    const translationId = picked.translationId;

    if (hasFts()) {
        const rows = sqlite
            .query(
                `
                    SELECT
                        v.book_id    AS bookId,
                        v.chapter    AS chapter,
                        v.verse      AS verse,
                        v.verse_key  AS verseKey,
                        v.verse_ord  AS verseOrd,
                        snippet(bp_verse_text_fts, 2, '‹', '›', '…', 24) AS snippet
                    FROM bp_verse_text_fts
                             JOIN bp_verse_text t ON t.rowid = bp_verse_text_fts.rowid
                             JOIN bp_verse v      ON v.verse_key = t.verse_key
                    WHERE bp_verse_text_fts MATCH ?
                      AND t.translation_id = ?
                    ORDER BY bm25(bp_verse_text_fts)
                        LIMIT ?;
                `,
            )
            .all(q, translationId, limit) as Array<{
            bookId: string;
            chapter: number;
            verse: number;
            verseKey: string;
            verseOrd: number;
            snippet: string;
        }>;

        return jsonOk(c, { q, mode: "fts" as const, results: rows });
    }

    const likeQ = `%${q}%`;
    const rows = await db
        .select({
            verseKey: bpVerse.verseKey,
            bookId: bpVerse.bookId,
            chapter: bpVerse.chapter,
            verse: bpVerse.verse,
            verseOrd: bpVerse.verseOrd,
            text: bpVerseText.text,
        })
        .from(bpVerseText)
        .innerJoin(bpVerse, eq(bpVerse.verseKey, bpVerseText.verseKey))
        .where(and(eq(bpVerseText.translationId, translationId), like(bpVerseText.text, likeQ)))
        .orderBy(desc(bpVerse.verseOrd))
        .limit(limit);

    const results = rows.map((r) => {
        const text = r.text ?? "";
        return {
            bookId: r.bookId,
            chapter: r.chapter,
            verse: r.verse,
            verseKey: r.verseKey,
            verseOrd: r.verseOrd,
            snippet: text.length > 200 ? text.slice(0, 197) + "…" : text,
        };
    });

    return jsonOk(c, { q, mode: "like" as const, results });
});

app.notFound((c) => jsonErr(c, 404, "NOT_FOUND", "Route not found."));

/* ------------------------------ Bun entrypoint ----------------------------- */

export const apiFetch = app.fetch;

if (LISTEN) {
    const spine = getSpineStats();
    const cachedTranslations = getTranslationsCached();

    const server = Bun.serve({ port: PORT, fetch: apiFetch });

    // eslint-disable-next-line no-console
    console.log(`[api] listening on http://localhost:${server.port}`);

    // eslint-disable-next-line no-console
    console.log(
        `[api] translation=${ENV_TRANSLATION_ID || cachedTranslations.defaultId || "(none)"} fts=${
            hasFts() ? "on" : "off"
        } verses=${spine.verseCount} ordMax=${spine.verseOrdMax} auth=${AUTH_ENABLED ? "on" : "off"}`,
    );

    if (AUTH_ENABLED && CORS_WILDCARD) {
        // eslint-disable-next-line no-console
        console.warn(
            "[api] WARNING: BP_WEB_ORIGIN/BP_CORS_ORIGIN is '*' while auth is enabled. Cookies require a specific origin + credentials.",
        );
    }

    const shutdown = () => {
        try {
            sqlite.close();
        } catch {
            // ignore
        }
        try {
            server.stop(true);
        } catch {
            // ignore
        }
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

export { app };