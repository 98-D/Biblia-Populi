// apps/web/src/Reader.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGetBooks, apiGetSpine, apiResolveLoc, type BookRow } from "./api";
import type { ReaderLocation } from "./Search";
import type { Mode } from "./theme";
import { ReaderShell } from "./reader/ReaderShell";
import { ReaderSelectionToolbar } from "./reader/ReaderSelectionToolbar";
import type { ReaderPosition, SpineStats } from "./reader/types";
import type { ReaderViewportHandle } from "./reader/ReaderViewport";
import { applyReaderTypographyFromStorage } from "./reader/typography";
import { useReaderAnnotations } from "./reader/useReaderAnnotations";

type Props = Readonly<{
    styles: Record<string, React.CSSProperties>;
    onBackHome: () => void;
    initialLocation?: ReaderLocation;
    mode?: Mode;
    onToggleTheme?: () => void;
}>;

type ScrollMode = "auto" | "smooth";

const LS_LAST_ORD = "bp_last_pos_ord_v1";
const LS_LAST_LOC = "bp_last_pos_loc_v1";

const POSITION_SAVE_DEBOUNCE_MS = 220;
const PROGRAMMATIC_JUMP_SETTLE_MS = 1200;
const PROGRAMMATIC_JUMP_ORD_TOLERANCE = 1;

type QueuedJump = Readonly<{
    ord: number;
    behavior: ScrollMode;
    token: number;
}>;

type StoredLocation = Readonly<{
    bookId: string;
    chapter: number;
    verse: number | null;
}>;

type JumpSession = Readonly<{
    token: number;
    targetOrd: number;
    targetLocKey: string | null;
    startedAt: number;
}>;

const INITIAL_POSITION: ReaderPosition = {
    ord: 1,
    verse: null,
    book: null,
};

function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function safeGetLS(key: string): string | null {
    try {
        if (!isBrowser()) return null;
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeSetLS(key: string, value: string): void {
    try {
        if (!isBrowser()) return;
        localStorage.setItem(key, value);
    } catch {
        // ignore
    }
}

function safeJsonStringify(value: unknown): string | null {
    try {
        return JSON.stringify(value);
    } catch {
        return null;
    }
}

function parseFiniteInt(value: string | null): number | null {
    if (!value) return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.trunc(n);
}

function normalizeBookId(value: string): string {
    return value.trim().toUpperCase();
}

function clampOrd(ord: number, spine: SpineStats): number {
    const n = Math.trunc(ord);
    return Math.max(spine.verseOrdMin, Math.min(spine.verseOrdMax, n));
}

function normalizeLocationInput(loc: ReaderLocation): StoredLocation | null {
    const bookId = normalizeBookId(loc.bookId);
    const chapter = Math.trunc(loc.chapter);
    const verse = loc.verse == null ? null : Math.trunc(loc.verse);

    if (!bookId) return null;
    if (!Number.isFinite(chapter) || chapter < 1) return null;
    if (verse != null && (!Number.isFinite(verse) || verse < 1)) return null;

    return { bookId, chapter, verse };
}

function makeLocKey(loc?: ReaderLocation): string {
    if (!loc) return "";
    const normalized = normalizeLocationInput(loc);
    if (!normalized) return "";
    return `${normalized.bookId}:${normalized.chapter}:${normalized.verse ?? ""}`;
}

function makeStoredLocationKey(loc: StoredLocation): string {
    return `${loc.bookId}:${loc.chapter}:${loc.verse ?? ""}`;
}

function isStoredLocation(value: unknown): value is StoredLocation {
    if (!value || typeof value !== "object") return false;

    const v = value as Record<string, unknown>;

    if (typeof v.bookId !== "string" || v.bookId.trim() === "") return false;
    if (typeof v.chapter !== "number" || !Number.isFinite(v.chapter) || v.chapter < 1) return false;
    if (
        v.verse !== null &&
        (typeof v.verse !== "number" || !Number.isFinite(v.verse) || v.verse < 1)
    ) {
        return false;
    }

    return true;
}

function parseStoredLocation(raw: string | null): StoredLocation | null {
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!isStoredLocation(parsed)) return null;

        return {
            bookId: normalizeBookId(parsed.bookId),
            chapter: Math.trunc(parsed.chapter),
            verse: parsed.verse == null ? null : Math.trunc(parsed.verse),
        };
    } catch {
        return null;
    }
}

function sameVerse(
    a: ReaderPosition["verse"] | null | undefined,
    b: ReaderPosition["verse"] | null | undefined,
): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return a.bookId === b.bookId && a.chapter === b.chapter && a.verse === b.verse;
}

function sameBook(
    a: ReaderPosition["book"] | null | undefined,
    b: ReaderPosition["book"] | null | undefined,
): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return a.bookId === b.bookId;
}

function makeStoredLocation(
    bookId: string,
    chapter: number,
    verse: number | null,
): StoredLocation | null {
    const cleanBookId = normalizeBookId(bookId);
    const cleanChapter = Math.trunc(chapter);
    const cleanVerse = verse == null ? null : Math.trunc(verse);

    if (!cleanBookId) return null;
    if (!Number.isFinite(cleanChapter) || cleanChapter < 1) return null;
    if (cleanVerse != null && (!Number.isFinite(cleanVerse) || cleanVerse < 1)) return null;

    return {
        bookId: cleanBookId,
        chapter: cleanChapter,
        verse: cleanVerse,
    };
}

function ordNear(a: number, b: number, tolerance = PROGRAMMATIC_JUMP_ORD_TOLERANCE): boolean {
    return Math.abs(a - b) <= tolerance;
}

export function Reader(props: Props) {
    const { styles, onBackHome, initialLocation, mode, onToggleTheme } = props;

    const [books, setBooks] = useState<BookRow[] | null>(null);
    const [spine, setSpine] = useState<SpineStats | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [pos, setPos] = useState<ReaderPosition>(INITIAL_POSITION);
    const [viewportReady, setViewportReady] = useState(false);

    const viewportHandleRef = useRef<ReaderViewportHandle | null>(null);
    const selectionRootRef = useRef<HTMLDivElement | null>(null);

    const queuedJumpRef = useRef<QueuedJump | null>(null);
    const didRestoreRef = useRef(false);
    const appliedInitialKeyRef = useRef("");
    const loadSeqRef = useRef(0);
    const resolveSeqRef = useRef(0);
    const jumpTokenRef = useRef(0);

    const activeJumpSessionRef = useRef<JumpSession | null>(null);

    const skipNextPersistedLocKeyRef = useRef<string | null>(null);
    const lastSavedLocJsonRef = useRef<string | null>(safeGetLS(LS_LAST_LOC));
    const lastSavedOrdRef = useRef<string | null>(safeGetLS(LS_LAST_ORD));
    const savePositionTimerRef = useRef<number | null>(null);

    const annotations = useReaderAnnotations(selectionRootRef);

    const clearSaveTimer = useCallback(() => {
        if (savePositionTimerRef.current != null && typeof window !== "undefined") {
            window.clearTimeout(savePositionTimerRef.current);
            savePositionTimerRef.current = null;
        }
    }, []);

    const setError = useCallback((message: string | null) => {
        setErr((prev) => (prev === message ? prev : message));
    }, []);

    useEffect(() => {
        applyReaderTypographyFromStorage();
    }, []);

    useEffect(() => {
        return () => {
            clearSaveTimer();
        };
    }, [clearSaveTimer]);

    useEffect(() => {
        setViewportReady(false);
        queuedJumpRef.current = null;
        activeJumpSessionRef.current = null;
        skipNextPersistedLocKeyRef.current = null;

        if (spine) {
            setPos({
                ord: spine.verseOrdMin,
                verse: null,
                book: null,
            });
        } else {
            setPos(INITIAL_POSITION);
        }
    }, [spine?.verseOrdMin, spine?.verseOrdMax, spine?.verseCount]);

    useEffect(() => {
        const seq = ++loadSeqRef.current;
        let cancelled = false;

        (async () => {
            try {
                setError(null);

                const [bookRes, spineRes] = await Promise.all([apiGetBooks(), apiGetSpine()]);
                if (cancelled || seq !== loadSeqRef.current) return;

                setBooks(Array.isArray(bookRes.books) ? [...bookRes.books] : []);
                setSpine(spineRes);
            } catch (e: unknown) {
                if (cancelled || seq !== loadSeqRef.current) return;

                const message = e instanceof Error ? e.message : String(e);
                setError(message);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [setError]);

    const bookById = useMemo(() => {
        const map = new Map<string, BookRow>();

        for (const book of books ?? []) {
            map.set(book.bookId, book);
            map.set(normalizeBookId(book.bookId), book);
        }

        return map;
    }, [books]);

    const posLabel = useMemo(() => {
        if (!spine) return "…";
        if (!pos.verse) return `#${pos.ord}`;

        const bookName = pos.book?.name ?? pos.verse.bookId;
        return `${bookName} ${pos.verse.chapter}:${pos.verse.verse}`;
    }, [spine, pos]);

    const setViewportRef = useCallback((handle: ReaderViewportHandle | null) => {
        viewportHandleRef.current = handle;
    }, []);

    const beginJumpSession = useCallback((ord: number, targetLocKey: string | null): number => {
        const token = ++jumpTokenRef.current;
        activeJumpSessionRef.current = {
            token,
            targetOrd: ord,
            targetLocKey,
            startedAt: nowMs(),
        };
        return token;
    }, []);

    const clearJumpSession = useCallback((token?: number) => {
        const session = activeJumpSessionRef.current;
        if (!session) return;
        if (token != null && session.token !== token) return;
        activeJumpSessionRef.current = null;
    }, []);

    const persistLocation = useCallback((stored: StoredLocation) => {
        const json = safeJsonStringify(stored);
        if (!json) return;
        if (lastSavedLocJsonRef.current === json) return;

        lastSavedLocJsonRef.current = json;
        safeSetLS(LS_LAST_LOC, json);
    }, []);

    const persistOrd = useCallback((ord: number, spineValue: SpineStats) => {
        const next = String(clampOrd(ord, spineValue));
        if (lastSavedOrdRef.current === next) return;

        lastSavedOrdRef.current = next;
        safeSetLS(LS_LAST_ORD, next);
    }, []);

    const dispatchJumpToOrd = useCallback(
        (ord: number, behavior: ScrollMode, targetLocKey: string | null) => {
            if (!spine) return;

            const clamped = clampOrd(ord, spine);
            const token = beginJumpSession(clamped, targetLocKey);
            const handle = viewportHandleRef.current;

            if (handle && viewportReady) {
                queuedJumpRef.current = null;
                handle.jumpToOrd(clamped, behavior);
                return;
            }

            queuedJumpRef.current = {
                ord: clamped,
                behavior,
                token,
            };
        },
        [beginJumpSession, spine, viewportReady],
    );

    const resolveAndJump = useCallback(
        async (bookId: string, chapter: number, verse: number | null, behavior: ScrollMode) => {
            const stored = makeStoredLocation(bookId, chapter, verse);
            if (!stored) return;

            skipNextPersistedLocKeyRef.current = null;
            annotations.clearSelection();
            setError(null);

            const seq = ++resolveSeqRef.current;
            const locKey = makeStoredLocationKey(stored);

            try {
                const loc = await apiResolveLoc(stored.bookId, stored.chapter, stored.verse);
                if (seq !== resolveSeqRef.current) return;

                const verseOrd =
                    loc && typeof loc.verseOrd === "number" && Number.isFinite(loc.verseOrd)
                        ? Math.trunc(loc.verseOrd)
                        : null;

                if (verseOrd == null) {
                    setError("Could not resolve that passage.");
                    return;
                }

                persistLocation(stored);
                skipNextPersistedLocKeyRef.current = locKey;

                dispatchJumpToOrd(
                    verseOrd,
                    behavior === "smooth" ? "auto" : behavior,
                    locKey,
                );
            } catch (e: unknown) {
                if (seq !== resolveSeqRef.current) return;

                const message = e instanceof Error ? e.message : String(e);
                setError(message);
            }
        },
        [annotations, dispatchJumpToOrd, persistLocation, setError],
    );

    useEffect(() => {
        if (!spine || !initialLocation) return;

        const key = makeLocKey(initialLocation);
        if (!key) return;
        if (appliedInitialKeyRef.current === key) return;

        appliedInitialKeyRef.current = key;
        didRestoreRef.current = true;

        void resolveAndJump(
            initialLocation.bookId,
            initialLocation.chapter,
            initialLocation.verse ?? null,
            "auto",
        );
    }, [initialLocation, resolveAndJump, spine]);

    useEffect(() => {
        if (!spine) return;
        if (initialLocation) return;
        if (didRestoreRef.current) return;

        didRestoreRef.current = true;

        const storedLoc = parseStoredLocation(safeGetLS(LS_LAST_LOC));
        if (storedLoc) {
            void resolveAndJump(storedLoc.bookId, storedLoc.chapter, storedLoc.verse, "auto");
            return;
        }

        const ordRaw = parseFiniteInt(safeGetLS(LS_LAST_ORD));
        if (ordRaw == null) return;

        dispatchJumpToOrd(ordRaw, "auto", null);
    }, [dispatchJumpToOrd, initialLocation, resolveAndJump, spine]);

    useEffect(() => {
        if (!viewportReady) return;

        const handle = viewportHandleRef.current;
        const queued = queuedJumpRef.current;
        if (!handle || !queued) return;

        const session = activeJumpSessionRef.current;
        if (session && session.token !== queued.token) {
            queuedJumpRef.current = null;
            return;
        }

        queuedJumpRef.current = null;
        handle.jumpToOrd(queued.ord, queued.behavior);
    }, [viewportReady]);

    useEffect(() => {
        if (!spine) return;
        if (!Number.isFinite(pos.ord)) return;
        if (typeof window === "undefined") return;

        const session = activeJumpSessionRef.current;
        if (session) {
            const elapsed = nowMs() - session.startedAt;
            const landed = ordNear(pos.ord, session.targetOrd);

            if (landed || elapsed > PROGRAMMATIC_JUMP_SETTLE_MS) {
                clearJumpSession(session.token);
            } else {
                return;
            }
        }

        const nextOrd = clampOrd(pos.ord, spine);

        clearSaveTimer();
        savePositionTimerRef.current = window.setTimeout(() => {
            persistOrd(nextOrd, spine);
            savePositionTimerRef.current = null;
        }, POSITION_SAVE_DEBOUNCE_MS);

        return () => {
            clearSaveTimer();
        };
    }, [clearJumpSession, clearSaveTimer, persistOrd, pos.ord, spine]);

    useEffect(() => {
        if (!pos.verse) return;

        const session = activeJumpSessionRef.current;
        if (session) {
            const elapsed = nowMs() - session.startedAt;
            const landed = ordNear(pos.ord, session.targetOrd);

            if (!landed && elapsed <= PROGRAMMATIC_JUMP_SETTLE_MS) {
                return;
            }

            clearJumpSession(session.token);
        }

        const stored = makeStoredLocation(pos.verse.bookId, pos.verse.chapter, pos.verse.verse);
        if (!stored) return;

        const key = makeStoredLocationKey(stored);
        if (skipNextPersistedLocKeyRef.current === key) {
            skipNextPersistedLocKeyRef.current = null;
            return;
        }

        persistLocation(stored);
    }, [clearJumpSession, persistLocation, pos.ord, pos.verse]);

    const handleReady = useCallback(() => {
        setViewportReady(true);
    }, []);

    const handleError = useCallback(
        (message: string) => {
            setError(message);
        },
        [setError],
    );

    const handlePosition = useCallback(
        (next: ReaderPosition) => {
            const session = activeJumpSessionRef.current;

            if (session) {
                const elapsed = nowMs() - session.startedAt;
                const landed = ordNear(next.ord, session.targetOrd);

                if (!landed && elapsed <= PROGRAMMATIC_JUMP_SETTLE_MS) {
                    return;
                }

                clearJumpSession(session.token);
            }

            setPos((prev) => {
                const nextVerse =
                    next.verse ??
                    (prev.ord === next.ord ? prev.verse ?? null : null);

                const nextBook =
                    next.book ??
                    (nextVerse
                        ? (bookById.get(nextVerse.bookId) ??
                            bookById.get(normalizeBookId(nextVerse.bookId)) ??
                            null)
                        : prev.ord === next.ord
                            ? prev.book ?? null
                            : null);

                if (
                    prev.ord === next.ord &&
                    sameVerse(prev.verse, nextVerse) &&
                    sameBook(prev.book, nextBook)
                ) {
                    return prev;
                }

                return {
                    ord: next.ord,
                    verse: nextVerse,
                    book: nextBook,
                };
            });
        },
        [bookById, clearJumpSession],
    );

    const handleJumpRef = useCallback(
        (bookId: string, chapter: number, verse: number | null) => {
            void resolveAndJump(bookId, chapter, verse, "auto");
        },
        [resolveAndJump],
    );

    const handleNavigate = useCallback(
        (loc: ReaderLocation) => {
            void resolveAndJump(loc.bookId, loc.chapter, loc.verse ?? null, "auto");
        },
        [resolveAndJump],
    );

    const handleBackHome = useCallback(() => {
        annotations.clearSelection();
        onBackHome();
    }, [annotations, onBackHome]);

    const topContent = useMemo(
        () => (
            <ReaderSelectionToolbar
                selection={annotations.selection}
                onHighlight={annotations.createHighlight}
                onBookmark={annotations.createBookmark}
                onNote={() => {
                    annotations.createNote(null, "New note");
                }}
                onClear={annotations.clearSelection}
            />
        ),
        [annotations],
    );

    return (
        <ReaderShell
            styles={styles}
            books={books}
            onBackHome={handleBackHome}
            current={{
                label: posLabel,
                ord: pos.ord,
                bookId: pos.verse?.bookId ?? null,
                chapter: pos.verse?.chapter ?? null,
                verse: pos.verse?.verse ?? null,
            }}
            onJumpRef={handleJumpRef}
            onNavigate={handleNavigate}
            mode={mode}
            onToggleTheme={onToggleTheme}
            spine={spine}
            bookById={bookById}
            viewportRef={setViewportRef}
            selectionRootRef={selectionRootRef}
            annotationSnapshot={annotations.snapshot}
            topContent={topContent}
            onPosition={handlePosition}
            onError={handleError}
            onReady={handleReady}
            err={err}
        />
    );
}