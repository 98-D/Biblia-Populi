// apps/api/src/server.ts
// Biblia.to — Production API server (Bun + Hono + Drizzle + bun:sqlite)
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
// - User annotations belong in separate user-data tables/modules, not canon tables.

import { Hono, type Context, type Next } from "hono";
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

/* --------------------------------- Helpers -------------------------------- */

type ApiOk<T> = Readonly<{ ok: true; data: T }>;
type ApiErr = Readonly<{ ok: false; error: { code: string; message: string } }>;

type JsonStatus = 200 | 201 | 302 | 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500;
type PortSource = "BP_API_PORT" | "PORT" | "default";

function toJsonStatus(n: number): JsonStatus {
    if (n === 200) return 200;
    if (n === 201) return 201;
    if (n === 302) return 302;
    if (n === 400) return 400;
    if (n === 401) return 401;
    if (n === 403) return 403;
    if (n === 404) return 404;
    if (n === 409) return 409;
    if (n === 422) return 422;
    if (n === 429) return 429;
    return 500;
}

function jsonOk<T>(
     c: Context,
     data: T,
     extraHeaders?: Record<string, string>,
     status: 200 | 201 = 200,
) {
    if (extraHeaders) {
        for (const [k, v] of Object.entries(extraHeaders)) {
            c.header(k, v);
        }
    }
    const body: ApiOk<T> = { ok: true, data };
    return c.json(body, { status });
}

function jsonErr(c: Context, status: number, code: string, message: string) {
    const body: ApiErr = { ok: false, error: { code, message } };
    return c.json(body, { status: toJsonStatus(status) });
}

function trimTrailingSlash(s: string): string {
    return s.trim().replace(/\/+$/g, "");
}

function nonEmptyOr(v: string | undefined, fallback: string): string {
    const s = (v ?? "").trim();
    return s || fallback;
}

function nonEmptyOrUndefined(v: string | undefined): string | undefined {
    const s = (v ?? "").trim();
    return s || undefined;
}

function splitCsv(s: string): string[] {
    return s
         .split(",")
         .map((v) => v.trim())
         .filter(Boolean);
}

function parseEnvBool(v: string | undefined, fallback: boolean): boolean {
    const s = (v ?? "").trim().toLowerCase();
    if (!s) return fallback;
    if (["1", "true", "yes", "on"].includes(s)) return true;
    if (["0", "false", "no", "off"].includes(s)) return false;
    return fallback;
}

function parseEnvInt(
     v: string | undefined,
     fallback: number,
     bounds?: { min?: number; max?: number },
): number {
    const s = (v ?? "").trim();
    const n = Number(s);
    let out = Number.isFinite(n) ? Math.trunc(n) : fallback;
    if (bounds?.min != null && out < bounds.min) out = bounds.min;
    if (bounds?.max != null && out > bounds.max) out = bounds.max;
    return out;
}

function parsePortCandidate(raw: string | undefined): number | null {
    const s = (raw ?? "").trim();
    if (!s) return null;
    if (!/^\d+$/.test(s)) return null;

    const n = Number(s);
    if (!Number.isInteger(n)) return null;
    if (n < 1024 || n > 65535) return null;

    return n;
}

function resolveListenPort(): { port: number; source: PortSource; raw: string | null } {
    const bpApiPortRaw = process.env.BP_API_PORT;
    const portRaw = process.env.PORT;

    const appPort = parsePortCandidate(bpApiPortRaw);
    if (appPort != null) {
        return { port: appPort, source: "BP_API_PORT", raw: bpApiPortRaw ?? null };
    }

    const genericPort = parsePortCandidate(portRaw);
    if (genericPort != null) {
        return { port: genericPort, source: "PORT", raw: portRaw ?? null };
    }

    return { port: 3000, source: "default", raw: null };
}

function assertAbsoluteHttpUrl(name: string, value: string): void {
    let u: URL;
    try {
        u = new URL(value);
    } catch {
        throw new Error(`[api] ${name} must be a valid absolute URL`);
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new Error(`[api] ${name} must use http or https`);
    }
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

function cacheNoStore(c: Context): void {
    c.header("Cache-Control", "no-store");
}

function cachePublic(c: Context, seconds: number): void {
    c.header("Cache-Control", `public, max-age=${seconds}`);
}

function cachePrivate(c: Context, seconds: number): void {
    c.header("Cache-Control", `private, max-age=${seconds}`);
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

function appendVary(current: string | null | undefined, value: string): string {
    const parts = new Set(
         (current ?? "")
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
    );
    for (const part of value.split(",")) {
        const clean = part.trim();
        if (clean) parts.add(clean);
    }
    return Array.from(parts).join(", ");
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

function normalizeOrigin(origin: string): string {
    const u = new URL(origin);
    return u.origin;
}

function isAllowedOrigin(origin: string): boolean {
    if (CORS_WILDCARD) return true;
    try {
        const normalized = normalizeOrigin(origin);
        return CORS_SET.has(normalized);
    } catch {
        return false;
    }
}

function assertRedirectUrlAllowed(name: string, value: string): void {
    assertAbsoluteHttpUrl(name, value);
    if (!isAllowedOrigin(value)) {
        throw new Error(`[api] ${name} origin must be one of the configured web origins`);
    }
}

function getClientIp(c: Context): string {
    if (TRUST_PROXY) {
        const xff = c.req.header("x-forwarded-for");
        if (xff) {
            const first = xff.split(",")[0]?.trim();
            if (first) return first;
        }

        const xr = c.req.header("x-real-ip")?.trim();
        if (xr) return xr;
    }

    const cf = c.req.header("cf-connecting-ip")?.trim();
    if (TRUST_PROXY && cf) return cf;

    return "unknown";
}

function escapeLike(input: string): string {
    return input.replace(/[\\%_]/g, "\\$&");
}

function safeUrlEquals(a: string, b: string): boolean {
    try {
        return normalizeOrigin(a) === normalizeOrigin(b);
    } catch {
        return false;
    }
}

/* --------------------------------- Config --------------------------------- */

const PORT_INFO = resolveListenPort();
const PORT = PORT_INFO.port;

const NODE_ENV = (process.env.NODE_ENV ?? "development").trim().toLowerCase();
const IS_PROD = NODE_ENV === "production";

// Bun listen
const LISTEN = parseEnvBool(process.env.BP_API_LISTEN, true);

// Public URLs
const BP_PUBLIC_URL = trimTrailingSlash(process.env.BP_PUBLIC_URL ?? `http://localhost:${PORT}`);
const BP_WEB_ORIGIN_RAW = (process.env.BP_WEB_ORIGIN ?? process.env.BP_CORS_ORIGIN ?? "").trim();

// Explicit env default translation, else DB default.
const ENV_TRANSLATION_ID = (process.env.BP_TRANSLATION_ID ?? "").trim();

// CORS
const CORS_LIST = splitCsv(BP_WEB_ORIGIN_RAW).map(trimTrailingSlash);
const CORS_WILDCARD = CORS_LIST.length === 0 || CORS_LIST.includes("*");
const CORS_SET = new Set(
     CORS_WILDCARD
          ? []
          : CORS_LIST.map((origin) => {
              assertAbsoluteHttpUrl("BP_WEB_ORIGIN/BP_CORS_ORIGIN entry", origin);
              return normalizeOrigin(origin);
          }),
);

// Auth
const AUTH_ENABLED = parseEnvBool(process.env.BP_AUTH_ENABLED, true);
const AUTH_COOKIE = nonEmptyOr(process.env.BP_AUTH_COOKIE, "bp_session");
const AUTH_COOKIE_DOMAIN = nonEmptyOrUndefined(process.env.BP_AUTH_COOKIE_DOMAIN);
const AUTH_COOKIE_PATH = nonEmptyOr(process.env.BP_AUTH_COOKIE_PATH, "/");
const AUTH_COOKIE_SECURE = parseEnvBool(process.env.BP_AUTH_COOKIE_SECURE, IS_PROD);
const AUTH_SESSION_DAYS = parseEnvInt(process.env.BP_AUTH_SESSION_DAYS, 30, { min: 1, max: 365 });
const AUTH_SESSION_REFRESH_WINDOW_MS = parseEnvInt(
     process.env.BP_AUTH_SESSION_REFRESH_WINDOW_MS,
     7 * 24 * 60 * 60 * 1000,
     { min: 60_000, max: 365 * 24 * 60 * 60 * 1000 },
);

// Cookie signing
const AUTH_COOKIE_SECRET = (process.env.BP_AUTH_COOKIE_SECRET ?? "").trim();
const AUTH_ALLOW_LEGACY_UNSIGNED_COOKIE = parseEnvBool(
     process.env.BP_AUTH_ALLOW_LEGACY_UNSIGNED_COOKIE,
     !IS_PROD,
);

// Proxy awareness
const TRUST_PROXY = parseEnvBool(process.env.BP_TRUST_PROXY, IS_PROD);

// Google OAuth
const GOOGLE_CLIENT_ID = (process.env.BP_GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? "").trim();
const GOOGLE_CLIENT_SECRET = (process.env.BP_GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
const GOOGLE_REDIRECT_URI = (
     process.env.BP_GOOGLE_REDIRECT_URI ??
     process.env.GOOGLE_REDIRECT_URI ??
     `${BP_PUBLIC_URL}/auth/google/callback`
).trim();
const GOOGLE_SCOPES = ["openid", "email", "profile"] as const;

// Redirects
const DEFAULT_WEB_ORIGIN = !CORS_WILDCARD ? CORS_LIST[0]! : BP_PUBLIC_URL;
const AUTH_AFTER_LOGIN_URL = (
     process.env.BP_AUTH_AFTER_LOGIN_URL ??
     `${trimTrailingSlash(DEFAULT_WEB_ORIGIN)}/reader`
).trim();
const AUTH_AFTER_LOGOUT_URL = (
     process.env.BP_AUTH_AFTER_LOGOUT_URL ??
     `${trimTrailingSlash(DEFAULT_WEB_ORIGIN)}/`
).trim();

// Network timeouts
const OAUTH_FETCH_TIMEOUT_MS = parseEnvInt(process.env.BP_OAUTH_FETCH_TIMEOUT_MS, 10_000, {
    min: 1_000,
    max: 60_000,
});

// Basic in-memory rate limits
const AUTH_RATE_LIMIT_WINDOW_MS = parseEnvInt(process.env.BP_AUTH_RATE_LIMIT_WINDOW_MS, 60_000, {
    min: 5_000,
    max: 3_600_000,
});
const AUTH_RATE_LIMIT_MAX = parseEnvInt(process.env.BP_AUTH_RATE_LIMIT_MAX, 30, {
    min: 1,
    max: 10_000,
});
const SEARCH_RATE_LIMIT_WINDOW_MS = parseEnvInt(process.env.BP_SEARCH_RATE_LIMIT_WINDOW_MS, 60_000, {
    min: 5_000,
    max: 3_600_000,
});
const SEARCH_RATE_LIMIT_MAX = parseEnvInt(process.env.BP_SEARCH_RATE_LIMIT_MAX, 120, {
    min: 1,
    max: 10_000,
});

/* ------------------------------ Startup checks ----------------------------- */

validateStartup();

function validateStartup(): void {
    assertAbsoluteHttpUrl("BP_PUBLIC_URL", BP_PUBLIC_URL);

    if (!AUTH_COOKIE.trim()) {
        throw new Error("[api] BP_AUTH_COOKIE resolved empty.");
    }

    if (!AUTH_COOKIE_PATH.startsWith("/")) {
        throw new Error("[api] BP_AUTH_COOKIE_PATH must start with '/'.");
    }

    if (AUTH_ENABLED) {
        if (CORS_WILDCARD) {
            throw new Error(
                 "[api] Auth is enabled but BP_WEB_ORIGIN/BP_CORS_ORIGIN resolves to wildcard/empty. Cookies require a specific origin.",
            );
        }

        if (IS_PROD && !AUTH_COOKIE_SECRET) {
            throw new Error("[api] BP_AUTH_COOKIE_SECRET is required in production when auth is enabled.");
        }

        assertAbsoluteHttpUrl("GOOGLE_REDIRECT_URI", GOOGLE_REDIRECT_URI);
        assertRedirectUrlAllowed("AUTH_AFTER_LOGIN_URL", AUTH_AFTER_LOGIN_URL);
        assertRedirectUrlAllowed("AUTH_AFTER_LOGOUT_URL", AUTH_AFTER_LOGOUT_URL);

        if (!safeUrlEquals(GOOGLE_REDIRECT_URI, `${BP_PUBLIC_URL}/auth/google/callback`)) {
            assertAbsoluteHttpUrl("GOOGLE_REDIRECT_URI", GOOGLE_REDIRECT_URI);
        }
    }
}

/* ------------------------------ Cookie signing ----------------------------- */

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

type UnpackCookieResult =
     | { ok: true; value: string }
     | { ok: false; reason: "empty" | "bad_sig" | "legacy_disallowed" };

function unpackCookieValue(packed: string): UnpackCookieResult {
    const s = packed.trim();
    if (!s) return { ok: false, reason: "empty" };

    if (!AUTH_COOKIE_SECRET) return { ok: true, value: s };

    const dot = s.lastIndexOf(".");
    if (dot <= 0) {
        if (AUTH_ALLOW_LEGACY_UNSIGNED_COOKIE) {
            return { ok: true, value: s };
        }
        return { ok: false, reason: "legacy_disallowed" };
    }

    const value = s.slice(0, dot);
    const sig = s.slice(dot + 1);
    const expected = hmacSig(value);

    if (!sig || !expected || !safeEqual(sig, expected)) {
        return { ok: false, reason: "bad_sig" };
    }

    return { ok: true, value };
}

/* --------------------------------- Schemas -------------------------------- */

const RefBookIdSchema = z.string().trim().min(2).max(8).regex(/^[A-Z0-9_]+$/);
const ChapterNumSchema = z.coerce.number().int().min(1).max(200);
const VerseNumSchema = z.coerce.number().int().min(1).max(300);

const SearchQuerySchema = z.string().trim().min(1).max(200);
const SliceFromSchema = z.coerce.number().int().min(1).max(1_000_000);
const SliceLimitSchema = z.coerce.number().int().min(1).max(2_000);

const TranslationIdSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/);
const EntityIdSchema = z.string().trim().min(1).max(128);

/* ---------------------------- Translation metadata -------------------------- */

type TranslationRow = Readonly<{
    translationId: string;
    name: string | null;
    language: string | null;
    derivedFrom: string | null;
    licenseKind: string | null;
    licenseText: string | null;
    sourceUrl: string | null;
    publisher: string | null;
    editionLabel: string | null;
    abbreviation: string | null;
    normalizationForm: string | null;
    isDefault: number;
    isPublic: number;
    createdAt: string | null;
    updatedAt: string | null;
}>;

type TranslationMeta = Readonly<{
    translationId: string;
    name: string | null;
    language: string | null;
    derivedFrom: string | null;
    licenseKind: string | null;
    licenseText: string | null;
    sourceUrl: string | null;
    publisher: string | null;
    editionLabel: string | null;
    abbreviation: string | null;
    normalizationForm: string | null;
    isDefault: boolean;
    isPublic: boolean;
    createdAt: string | null;
    updatedAt: string | null;
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
        publisher: r.publisher,
        editionLabel: r.editionLabel,
        abbreviation: r.abbreviation,
        normalizationForm: r.normalizationForm,
        isDefault: !!r.isDefault,
        isPublic: !!r.isPublic,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
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
                    translation_id      AS translationId,
                    name                AS name,
                    language            AS language,
                    derived_from        AS derivedFrom,
                    license_kind        AS licenseKind,
                    license_text        AS licenseText,
                    source_url          AS sourceUrl,
                    publisher           AS publisher,
                    edition_label       AS editionLabel,
                    abbreviation        AS abbreviation,
                    normalization_form  AS normalizationForm,
                    is_default          AS isDefault,
                    is_public           AS isPublic,
                    created_at          AS createdAt,
                    updated_at          AS updatedAt
                FROM bp_translation
                ORDER BY is_default DESC, name ASC, translation_id ASC;
            `,
         )
         .all() as TranslationRow[];

    return rows ?? [];
}

function invalidateTranslationsCache(): void {
    _translationsCache = null;
    _resolvedTranslationId = null;
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

function invalidateSpineStats(): void {
    _spineStats = null;
}

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

async function fetchChaptersForBook(bookId: string) {
    const fromChapter = await db
         .select({
             chapter: bpChapter.chapter,
             startVerseOrd: bpChapter.startVerseOrd,
             endVerseOrd: bpChapter.endVerseOrd,
             verseCount: bpChapter.verseCount,
         })
         .from(bpChapter)
         .where(eq(bpChapter.bookId, bookId))
         .orderBy(asc(bpChapter.chapter));

    if (fromChapter.length > 0) return fromChapter;

    return await db
         .select({
             chapter: bpVerse.chapter,
             startVerseOrd: dsql<number>`min(${bpVerse.verseOrd})`.as("start_verse_ord"),
             endVerseOrd: dsql<number>`max(${bpVerse.verseOrd})`.as("end_verse_ord"),
             verseCount: dsql<number>`count(*)`.as("verse_count"),
         })
         .from(bpVerse)
         .where(eq(bpVerse.bookId, bookId))
         .groupBy(bpVerse.chapter)
         .orderBy(asc(bpVerse.chapter));
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
             updatedAt: bpEntity.updatedAt,
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
         .orderBy(desc(bpEntityName.isPrimary), asc(bpEntityName.name));

    return { entity: ent[0], names };
}

/* ------------------------------ Rate limiting ------------------------------ */

type RateBucket = {
    count: number;
    resetAt: number;
};

class MemoryRateLimiter {
    private readonly buckets = new Map<string, RateBucket>();

    constructor(
         private readonly windowMs: number,
         private readonly maxHits: number,
    ) {}

    hit(
         key: string,
         now = Date.now(),
    ): { ok: true; remaining: number; resetAt: number } | { ok: false; retryAfterSec: number; resetAt: number } {
        const cur = this.buckets.get(key);
        if (!cur || now >= cur.resetAt) {
            const resetAt = now + this.windowMs;
            this.buckets.set(key, { count: 1, resetAt });
            this.maybeSweep(now);
            return { ok: true, remaining: Math.max(0, this.maxHits - 1), resetAt };
        }

        if (cur.count >= this.maxHits) {
            return {
                ok: false,
                retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)),
                resetAt: cur.resetAt,
            };
        }

        cur.count += 1;
        return { ok: true, remaining: Math.max(0, this.maxHits - cur.count), resetAt: cur.resetAt };
    }

    private maybeSweep(now: number): void {
        if (this.buckets.size < 10_000) return;
        for (const [k, v] of this.buckets) {
            if (now >= v.resetAt) this.buckets.delete(k);
        }
    }
}

const authLimiter = new MemoryRateLimiter(AUTH_RATE_LIMIT_WINDOW_MS, AUTH_RATE_LIMIT_MAX);
const searchLimiter = new MemoryRateLimiter(SEARCH_RATE_LIMIT_WINDOW_MS, SEARCH_RATE_LIMIT_MAX);

function withRateLimit(name: "auth" | "search") {
    const limiter = name === "auth" ? authLimiter : searchLimiter;
    const limit = name === "auth" ? AUTH_RATE_LIMIT_MAX : SEARCH_RATE_LIMIT_MAX;

    return async (c: Context, next: Next) => {
        const key = `${name}:${getClientIp(c)}`;
        const hit = limiter.hit(key);

        if (!hit.ok) {
            c.header("Retry-After", String(hit.retryAfterSec));
            c.header("X-RateLimit-Limit", String(limit));
            c.header("X-RateLimit-Reset", String(hit.resetAt));
            return jsonErr(c, 429, "RATE_LIMITED", "Too many requests.");
        }

        c.header("X-RateLimit-Limit", String(limit));
        c.header("X-RateLimit-Remaining", String(hit.remaining));
        c.header("X-RateLimit-Reset", String(hit.resetAt));
        return next();
    };
}

/* ------------------------------ Auth helpers ------------------------------- */

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

function authDisabledResponse(c: Context) {
    cacheNoStore(c);
    return jsonErr(c, 403, "AUTH_DISABLED", "Authentication is disabled.");
}

/* ------------------------------- Sessions ---------------------------------- */

async function loadUserFromSession(sessionId: string): Promise<{
    user: AuthedUser | null;
    sessionExpiresAt: number | null;
}> {
    const now = nowMs();

    const sess = await db
         .select({
             id: bpSession.id,
             userId: bpSession.userId,
             expiresAt: bpSession.expiresAt,
         })
         .from(bpSession)
         .where(eq(bpSession.id, sessionId))
         .limit(1);

    const s = sess[0];
    if (!s) return { user: null, sessionExpiresAt: null };

    if (Number(s.expiresAt) <= now) {
        try {
            await db.delete(bpSession).where(eq(bpSession.id, sessionId));
        } catch {
            // ignore cleanup failure
        }
        return { user: null, sessionExpiresAt: null };
    }

    const rows = await db
         .select({
             id: bpUser.id,
             displayName: bpUser.displayName,
             email: bpUser.email,
             emailVerifiedAt: bpUser.emailVerifiedAt,
             disabledAt: bpUser.disabledAt,
         })
         .from(bpUser)
         .where(eq(bpUser.id, s.userId))
         .limit(1);

    const u = rows[0];
    if (!u) return { user: null, sessionExpiresAt: Number(s.expiresAt) };
    if (u.disabledAt != null) return { user: null, sessionExpiresAt: Number(s.expiresAt) };

    return {
        user: {
            id: u.id,
            displayName: u.displayName ?? null,
            email: u.email ?? null,
            emailVerifiedAt: u.emailVerifiedAt != null ? msToDate(Number(u.emailVerifiedAt)) : null,
            disabledAt: u.disabledAt != null ? msToDate(Number(u.disabledAt)) : null,
        },
        sessionExpiresAt: Number(s.expiresAt),
    };
}

async function refreshSessionCookie(c: Context, sessionId: string): Promise<void> {
    const now = nowMs();
    const nextExpiresAt = now + daysMs(AUTH_SESSION_DAYS);

    await db
         .update(bpSession)
         .set({ expiresAt: nextExpiresAt })
         .where(eq(bpSession.id, sessionId));

    setCookie(c, AUTH_COOKIE, packCookieValue(sessionId), cookieOpts(msToDate(nextExpiresAt)));
}

async function createSessionForUser(c: Context, userId: string): Promise<string> {
    const sid = randId(24);
    const createdAt = nowMs();
    const expiresAt = createdAt + daysMs(AUTH_SESSION_DAYS);

    await db.insert(bpSession).values([
        {
            id: sid,
            createdAt,
            expiresAt,
            userId,
            ip: getClientIp(c),
            ua: c.req.header("user-agent") ?? null,
        },
    ]);

    setCookie(c, AUTH_COOKIE, packCookieValue(sid), cookieOpts(msToDate(expiresAt)));
    return sid;
}

async function destroySession(c: Context, sessionId: string | null): Promise<void> {
    if (sessionId) {
        try {
            await db.delete(bpSession).where(eq(bpSession.id, sessionId));
        } catch {
            // ignore
        }
    }
    deleteCookie(c, AUTH_COOKIE, cookieOpts());
}

/* ------------------------- Google OAuth minimal flow ------------------------ */

const OAUTH_STATE_COOKIE = "bp_oauth_state";
const OAUTH_VERIFIER_COOKIE = "bp_oauth_verifier";
const OAUTH_TMP_MS = 10 * 60 * 1000;

function oauthTmpCookieOpts(): CookieOptions {
    const exp = new Date(Date.now() + OAUTH_TMP_MS);
    return {
        ...cookieOpts(exp),
        httpOnly: true,
        sameSite: "Lax",
        secure: AUTH_COOKIE_SECURE,
        path: "/",
    };
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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    return await globalThis.fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
    });
}

async function googleExchangeCode(code: string, codeVerifier: string): Promise<GoogleTokenResponse> {
    const form = new URLSearchParams();
    form.set("client_id", GOOGLE_CLIENT_ID);
    form.set("client_secret", GOOGLE_CLIENT_SECRET);
    form.set("redirect_uri", GOOGLE_REDIRECT_URI);
    form.set("grant_type", "authorization_code");
    form.set("code", code);
    form.set("code_verifier", codeVerifier);

    const res = await fetchWithTimeout(
         "https://oauth2.googleapis.com/token",
         {
             method: "POST",
             headers: { "Content-Type": "application/x-www-form-urlencoded" },
             body: form.toString(),
         },
         OAUTH_FETCH_TIMEOUT_MS,
    );

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
    const res = await fetchWithTimeout(
         "https://openidconnect.googleapis.com/v1/userinfo",
         {
             headers: { Authorization: `Bearer ${accessToken}` },
         },
         OAUTH_FETCH_TIMEOUT_MS,
    );

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

    const email = info.email?.trim() ? info.email.trim().toLowerCase() : null;
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
             target: [bpAuthAccount.provider, bpAuthAccount.providerUserId],
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
    if (!AUTH_ENABLED) return false;
    return !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI;
}

/* ----------------------------------- App ---------------------------------- */

const app = new Hono<{ Variables: AppVars }>();

app.use("*", async (c, next) => {
    c.header("Vary", appendVary(c.res.headers.get("Vary"), "Origin, Accept-Encoding"));
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Frame-Options", "DENY");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (IS_PROD) {
        c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
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
                  try {
                      const normalized = normalizeOrigin(origin);
                      return CORS_SET.has(normalized) ? normalized : null;
                  } catch {
                      return null;
                  }
              },
         allowHeaders: ["Content-Type", "Authorization"],
         allowMethods: ["GET", "POST", "OPTIONS"],
         credentials: !CORS_WILDCARD,
         maxAge: 600,
     }),
);

app.use("*", async (c, next) => {
    if (!AUTH_ENABLED) {
        c.set("user", null);
        c.set("sessionId", null);
        return next();
    }

    const raw = (getCookie(c, AUTH_COOKIE) ?? "").trim();
    if (!raw) {
        c.set("user", null);
        c.set("sessionId", null);
        return next();
    }

    const unpacked = unpackCookieValue(raw);
    if (!unpacked.ok) {
        deleteCookie(c, AUTH_COOKIE, cookieOpts());
        c.set("user", null);
        c.set("sessionId", null);
        return next();
    }

    try {
        const sid = unpacked.value;
        const loaded = await loadUserFromSession(sid);
        const u = loaded.user;

        c.set("user", u);
        c.set("sessionId", u ? sid : null);

        if (!u) {
            deleteCookie(c, AUTH_COOKIE, cookieOpts());
        } else {
            if (AUTH_COOKIE_SECRET && raw !== packCookieValue(sid)) {
                setCookie(c, AUTH_COOKIE, packCookieValue(sid), cookieOpts());
            }

            const expiresAt = loaded.sessionExpiresAt ?? 0;
            if (expiresAt - nowMs() <= AUTH_SESSION_REFRESH_WINDOW_MS) {
                await refreshSessionCookie(c, sid);
            }
        }
    } catch {
        deleteCookie(c, AUTH_COOKIE, cookieOpts());
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

app.get("/", (c) => {
    cacheNoStore(c);
    return c.redirect("/health", 302);
});

app.get("/health", (c) => {
    cacheNoStore(c);
    return c.text("ok");
});

app.get("/auth/me", (c) => {
    cacheNoStore(c);
    return jsonOk(c, { user: c.get("user") });
});

app.get("/auth/google/start", withRateLimit("auth"), (c) => {
    cacheNoStore(c);

    if (!AUTH_ENABLED) return authDisabledResponse(c);

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

app.get("/auth/google/callback", withRateLimit("auth"), async (c) => {
    cacheNoStore(c);

    if (!AUTH_ENABLED) return authDisabledResponse(c);

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

    const stateCookieRes = unpackCookieValue(stateCookieRaw);
    const verifierCookieRes = unpackCookieValue(verifierCookieRaw);

    deleteCookie(c, OAUTH_STATE_COOKIE, { ...oauthTmpCookieOpts(), expires: new Date(0) });
    deleteCookie(c, OAUTH_VERIFIER_COOKIE, { ...oauthTmpCookieOpts(), expires: new Date(0) });

    const stateCookie = stateCookieRes.ok ? stateCookieRes.value : null;
    const verifierCookie = verifierCookieRes.ok ? verifierCookieRes.value : null;

    if (!stateCookie || !safeEqual(stateCookie, state) || !verifierCookie) {
        return jsonErr(c, 401, "OAUTH_STATE_MISMATCH", "Invalid OAuth state.");
    }

    try {
        const tokens = await googleExchangeCode(code, verifierCookie);
        const info = await googleFetchUserInfo(tokens.access_token);

        if (!info.sub) {
            return jsonErr(c, 401, "OAUTH_NO_SUB", "Provider did not return a user id.");
        }

        const { userId } = await upsertGoogleUser(info, tokens);
        await createSessionForUser(c, userId);

        return c.redirect(AUTH_AFTER_LOGIN_URL, 302);
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[auth] google callback error:", e);
        return jsonErr(c, 500, "OAUTH_FAILED", "OAuth exchange failed.");
    }
});

app.post("/auth/logout", withRateLimit("auth"), async (c) => {
    cacheNoStore(c);

    if (!AUTH_ENABLED) return authDisabledResponse(c);

    const sid = c.get("sessionId");
    await destroySession(c, sid);
    return jsonOk(c, { redirect: AUTH_AFTER_LOGOUT_URL });
});

app.get("/translations", (c) => {
    cachePublic(c, 60);
    const cached = getTranslationsCached();
    return jsonOk(c, { translations: cached.rows.map(toTranslationMeta) });
});

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
        listen: {
            port: PORT,
            source: PORT_INFO.source,
        },
    });
});

app.get("/spine", (c) => {
    cachePublic(c, 30);
    return jsonOk(c, getSpineStats());
});

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

app.get("/chapters/:bookId", async (c) => {
    cachePublic(c, 60);

    const bookIdP = RefBookIdSchema.safeParse(c.req.param("bookId"));
    if (!bookIdP.success) return jsonErr(c, 400, "BAD_BOOK", "Invalid bookId.");

    const bookId = bookIdP.data;
    const chapters = await fetchChaptersForBook(bookId);

    return jsonOk(c, { bookId, chapters });
});

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
             verseCount: bpRange.verseCount,
             chapterCount: bpRange.chapterCount,
             createdAt: bpRange.createdAt,
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
                       noteNeutral: bpCrossref.noteNeutral,
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

app.get("/people/:id", async (c) => {
    cachePublic(c, 60);

    const idP = EntityIdSchema.safeParse(c.req.param("id"));
    if (!idP.success) return jsonErr(c, 400, "BAD_ID", "Invalid id.");

    const id = idP.data;
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

app.get("/places/:id", async (c) => {
    cachePublic(c, 60);

    const idP = EntityIdSchema.safeParse(c.req.param("id"));
    if (!idP.success) return jsonErr(c, 400, "BAD_ID", "Invalid id.");

    const id = idP.data;
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

app.get("/events/:id", async (c) => {
    cachePublic(c, 60);

    const idP = EntityIdSchema.safeParse(c.req.param("id"));
    if (!idP.success) return jsonErr(c, 400, "BAD_ID", "Invalid id.");

    const id = idP.data;

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
             summaryNeutral: bpEvent.summaryNeutral,
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

app.get("/search", withRateLimit("search"), async (c) => {
    cachePrivate(c, 10);

    const qRaw = (c.req.query("q") ?? "").trim();
    const qP = SearchQuerySchema.safeParse(qRaw);
    if (!qP.success) return jsonOk(c, { q: qRaw, mode: "none" as const, results: [] as unknown[] });

    const q = qP.data;
    const limit = clamp(Number(c.req.query("limit") ?? "30"), 1, 100);

    const picked = await pickTranslation(c);
    if (picked instanceof Response) return picked;
    const translationId = picked.translationId;

    if (hasFts()) {
        try {
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
        } catch {
            // fall through to LIKE for malformed FTS query syntax
        }
    }

    const likeQ = `%${escapeLike(q)}%`;
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
            snippet: text.length > 200 ? `${text.slice(0, 197)}…` : text,
        };
    });

    return jsonOk(c, { q, mode: "like" as const, results });
});

app.notFound((c) => jsonErr(c, 404, "NOT_FOUND", "Route not found."));

/* ------------------------------ Bun entrypoint ----------------------------- */

export const apiFetch = app.fetch;
export { app };

if (LISTEN) {
    const spine = getSpineStats();
    const cachedTranslations = getTranslationsCached();
    const server = Bun.serve({ port: PORT, fetch: apiFetch });

    // eslint-disable-next-line no-console
    console.log(
         `[api] listening on http://localhost:${server.port} (source=${PORT_INFO.source}${
              PORT_INFO.raw ? ` raw=${JSON.stringify(PORT_INFO.raw)}` : ""
         })`,
    );

    // eslint-disable-next-line no-console
    console.log(
         `[api] translation=${ENV_TRANSLATION_ID || cachedTranslations.defaultId || "(none)"} fts=${
              hasFts() ? "on" : "off"
         } verses=${spine.verseCount} ordMax=${spine.verseOrdMax} auth=${AUTH_ENABLED ? "on" : "off"} env=${NODE_ENV}`,
    );

    let shuttingDown = false;

    const shutdown = () => {
        if (shuttingDown) return;
        shuttingDown = true;

        try {
            server.stop(true);
        } catch {
            // ignore
        }

        try {
            sqlite.close();
        } catch {
            // ignore
        }
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

/* ------------------------------- Dev exports ------------------------------- */

export const __internal = {
    invalidateTranslationsCache,
    invalidateSpineStats,
    hasFts,
    getSpineStats,
    getTranslationsCached,
    escapeLike,
};