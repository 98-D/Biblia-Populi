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

type PendingJump = Readonly<{
    ord: number;
    behavior: ScrollMode;
}>;

type StoredLocation = Readonly<{
    bookId: string;
    chapter: number;
    verse: number | null;
}>;

const INITIAL_POSITION: ReaderPosition = {
    ord: 1,
    verse: null,
    book: null,
};

function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
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

function clampOrd(ord: number, spine: SpineStats): number {
    const n = Math.trunc(ord);
    return Math.max(spine.verseOrdMin, Math.min(spine.verseOrdMax, n));
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
    if (v.verse !== null && (typeof v.verse !== "number" || !Number.isFinite(v.verse) || v.verse < 1)) {
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

export function Reader(props: Props) {
    const { styles, onBackHome, initialLocation, mode, onToggleTheme } = props;

    const [books, setBooks] = useState<BookRow[] | null>(null);
    const [spine, setSpine] = useState<SpineStats | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [pos, setPos] = useState<ReaderPosition>(INITIAL_POSITION);
    const [viewportReady, setViewportReady] = useState(false);

    const viewportHandleRef = useRef<ReaderViewportHandle | null>(null);
    const selectionRootRef = useRef<HTMLDivElement | null>(null);

    const pendingJumpRef = useRef<PendingJump | null>(null);
    const didRestoreRef = useRef(false);
    const appliedInitialKeyRef = useRef("");
    const loadSeqRef = useRef(0);
    const resolveSeqRef = useRef(0);
    const lastResolvedLocKeyRef = useRef("");
    const lastSavedLocJsonRef = useRef<string | null>(safeGetLS(LS_LAST_LOC));
    const lastSavedOrdRef = useRef<string | null>(safeGetLS(LS_LAST_ORD));
    const savePositionTimerRef = useRef<number | null>(null);

    const annotations = useReaderAnnotations(selectionRootRef);

    useEffect(() => {
        applyReaderTypographyFromStorage();
    }, []);

    useEffect(() => {
        return () => {
            if (savePositionTimerRef.current != null && typeof window !== "undefined") {
                window.clearTimeout(savePositionTimerRef.current);
                savePositionTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        setViewportReady(false);
        pendingJumpRef.current = null;
    }, [spine?.verseOrdMin, spine?.verseOrdMax, spine?.verseCount]);

    useEffect(() => {
        const seq = ++loadSeqRef.current;
        let cancelled = false;

        (async () => {
            try {
                setErr(null);

                const [bookRes, spineRes] = await Promise.all([apiGetBooks(), apiGetSpine()]);
                if (cancelled || seq !== loadSeqRef.current) return;

                setBooks(bookRes.books);
                setSpine(spineRes);
            } catch (e: unknown) {
                if (cancelled || seq !== loadSeqRef.current) return;
                const msg = e instanceof Error ? e.message : String(e);
                setErr(msg);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const bookById = useMemo(() => {
        const map = new Map<string, BookRow>();
        for (const book of books ?? []) {
            map.set(book.bookId, book);
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

    const jumpToOrd = useCallback(
        (ord: number, behavior: ScrollMode) => {
            if (!spine) return;

            const clamped = clampOrd(ord, spine);
            const handle = viewportHandleRef.current;

            if (handle && viewportReady) {
                handle.jumpToOrd(clamped, behavior);
                return;
            }

            pendingJumpRef.current = { ord: clamped, behavior };
        },
        [spine, viewportReady],
    );

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

    const resolveAndJump = useCallback(
        async (bookId: string, chapter: number, verse: number | null, behavior: ScrollMode) => {
            const stored = makeStoredLocation(bookId, chapter, verse);
            if (!stored) return;

            const locKey = makeStoredLocationKey(stored);
            lastResolvedLocKeyRef.current = locKey;

            annotations.clearSelection();
            setErr(null);

            const seq = ++resolveSeqRef.current;

            try {
                const loc = await apiResolveLoc(stored.bookId, stored.chapter, stored.verse);
                if (seq !== resolveSeqRef.current) return;

                const verseOrd =
                    loc && typeof loc.verseOrd === "number" && Number.isFinite(loc.verseOrd)
                        ? Math.trunc(loc.verseOrd)
                        : null;

                if (verseOrd == null) {
                    setErr("Could not resolve that passage.");
                    return;
                }

                jumpToOrd(verseOrd, behavior);
                persistLocation(stored);
            } catch (e: unknown) {
                if (seq !== resolveSeqRef.current) return;
                const msg = e instanceof Error ? e.message : String(e);
                setErr(msg);
            }
        },
        [annotations, jumpToOrd, persistLocation],
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
    }, [spine, initialLocation, resolveAndJump]);

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

        jumpToOrd(ordRaw, "auto");
    }, [spine, initialLocation, jumpToOrd, resolveAndJump]);

    useEffect(() => {
        if (!viewportReady) return;

        const handle = viewportHandleRef.current;
        const pending = pendingJumpRef.current;
        if (!handle || !pending) return;

        pendingJumpRef.current = null;
        handle.jumpToOrd(pending.ord, pending.behavior);
    }, [viewportReady]);

    useEffect(() => {
        if (!spine) return;
        if (!Number.isFinite(pos.ord)) return;
        if (typeof window === "undefined") return;

        const nextOrd = clampOrd(pos.ord, spine);

        if (savePositionTimerRef.current != null) {
            window.clearTimeout(savePositionTimerRef.current);
            savePositionTimerRef.current = null;
        }

        savePositionTimerRef.current = window.setTimeout(() => {
            persistOrd(nextOrd, spine);
            savePositionTimerRef.current = null;
        }, POSITION_SAVE_DEBOUNCE_MS);

        return () => {
            if (savePositionTimerRef.current != null) {
                window.clearTimeout(savePositionTimerRef.current);
                savePositionTimerRef.current = null;
            }
        };
    }, [persistOrd, pos.ord, spine]);

    useEffect(() => {
        if (!pos.verse) return;

        const stored = makeStoredLocation(pos.verse.bookId, pos.verse.chapter, pos.verse.verse);
        if (!stored) return;

        const key = makeStoredLocationKey(stored);
        if (lastResolvedLocKeyRef.current === key) return;

        persistLocation(stored);
    }, [persistLocation, pos.verse]);

    const handleReady = useCallback(() => {
        setViewportReady(true);
    }, []);

    const handleError = useCallback((message: string) => {
        setErr(message);
    }, []);

    const handlePosition = useCallback((next: ReaderPosition) => {
        setPos((prev) => {
            if (
                prev.ord === next.ord &&
                sameVerse(prev.verse, next.verse) &&
                sameBook(prev.book, next.book)
            ) {
                return prev;
            }
            return next;
        });
    }, []);

    const handleJumpRef = useCallback(
        (bookId: string, chapter: number, verse: number | null) => {
            void resolveAndJump(bookId, chapter, verse, "smooth");
        },
        [resolveAndJump],
    );

    const handleNavigate = useCallback(
        (loc: ReaderLocation) => {
            void resolveAndJump(loc.bookId, loc.chapter, loc.verse ?? null, "smooth");
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