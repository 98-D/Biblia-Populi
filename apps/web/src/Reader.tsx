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

function safeGetLS(key: string): string | null {
    try {
        if (typeof localStorage === "undefined") return null;
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeSetLS(key: string, value: string): void {
    try {
        if (typeof localStorage === "undefined") return;
        localStorage.setItem(key, value);
    } catch {
        // ignore
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

function makeLocKey(loc?: ReaderLocation): string {
    if (!loc) return "";
    return `${loc.bookId}:${loc.chapter}:${loc.verse ?? ""}`;
}

function isStoredLocation(value: unknown): value is StoredLocation {
    if (!value || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;

    if (typeof v.bookId !== "string" || v.bookId.trim() === "") return false;
    if (typeof v.chapter !== "number" || !Number.isFinite(v.chapter) || v.chapter < 1) return false;
    if (v.verse !== null && (typeof v.verse !== "number" || !Number.isFinite(v.verse) || v.verse < 1)) return false;

    return true;
}

function parseStoredLocation(raw: string | null): StoredLocation | null {
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as unknown;
        return isStoredLocation(parsed)
             ? {
                 bookId: parsed.bookId.trim().toUpperCase(),
                 chapter: Math.trunc(parsed.chapter),
                 verse: parsed.verse == null ? null : Math.trunc(parsed.verse),
             }
             : null;
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

export function Reader(props: Props) {
    const { styles, onBackHome, initialLocation, mode, onToggleTheme } = props;

    const [books, setBooks] = useState<BookRow[] | null>(null);
    const [spine, setSpine] = useState<SpineStats | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [pos, setPos] = useState<ReaderPosition>(INITIAL_POSITION);

    const viewportHandleRef = useRef<ReaderViewportHandle | null>(null);
    const [viewportHandle, setViewportHandle] = useState<ReaderViewportHandle | null>(null);
    const [viewportReady, setViewportReady] = useState(false);

    const pendingJumpRef = useRef<PendingJump | null>(null);
    const didRestoreRef = useRef(false);
    const appliedInitialKeyRef = useRef("");
    const loadSeqRef = useRef(0);
    const resolveSeqRef = useRef(0);

    const selectionRootRef = useRef<HTMLDivElement | null>(null);
    const annotations = useReaderAnnotations(selectionRootRef);

    useEffect(() => {
        applyReaderTypographyFromStorage();
    }, []);

    useEffect(() => {
        setViewportReady(false);
    }, [spine?.verseOrdMin, spine?.verseOrdMax, spine?.verseCount]);

    useEffect(() => {
        const seq = ++loadSeqRef.current;
        let alive = true;

        (async () => {
            try {
                setErr(null);
                const [bookRes, spineRes] = await Promise.all([apiGetBooks(), apiGetSpine()]);
                if (!alive || seq !== loadSeqRef.current) return;

                setBooks(bookRes.books);
                setSpine(spineRes);
            } catch (e: unknown) {
                if (!alive || seq !== loadSeqRef.current) return;
                const msg = e instanceof Error ? e.message : String(e);
                setErr(msg);
            }
        })();

        return () => {
            alive = false;
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

    const canJumpNow = !!(spine && viewportReady && viewportHandle);

    const setViewportRef = useCallback((handle: ReaderViewportHandle | null) => {
        viewportHandleRef.current = handle;
        setViewportHandle(handle);
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

    const resolveAndJump = useCallback(
         async (bookId: string, chapter: number, verse: number | null, behavior: ScrollMode) => {
             const cleanBookId = bookId.trim().toUpperCase();
             if (!cleanBookId || chapter < 1) return;

             annotations.clearSelection();
             setErr(null);

             const seq = ++resolveSeqRef.current;

             try {
                 const loc = await apiResolveLoc(cleanBookId, chapter, verse);
                 if (seq !== resolveSeqRef.current) return;
                 if (!loc?.verseOrd || !Number.isFinite(loc.verseOrd)) return;

                 jumpToOrd(loc.verseOrd, behavior);

                 safeSetLS(
                      LS_LAST_LOC,
                      JSON.stringify({
                          bookId: cleanBookId,
                          chapter,
                          verse: verse ?? null,
                      } satisfies StoredLocation),
                 );
             } catch (e: unknown) {
                 if (seq !== resolveSeqRef.current) return;
                 const msg = e instanceof Error ? e.message : String(e);
                 setErr(msg);
             }
         },
         [annotations, jumpToOrd],
    );

    useEffect(() => {
        if (!spine || !initialLocation) return;

        const key = makeLocKey(initialLocation);
        if (!key) return;
        if (appliedInitialKeyRef.current === key) return;

        appliedInitialKeyRef.current = key;

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
        if (!canJumpNow) return;

        const pending = pendingJumpRef.current;
        if (!pending) return;

        pendingJumpRef.current = null;
        viewportHandle?.jumpToOrd(pending.ord, pending.behavior);
    }, [canJumpNow, viewportHandle]);

    useEffect(() => {
        if (!spine) return;
        if (!Number.isFinite(pos.ord)) return;
        if (typeof window === "undefined") return;

        const id = window.setTimeout(() => {
            safeSetLS(LS_LAST_ORD, String(clampOrd(pos.ord, spine)));
        }, 220);

        return () => window.clearTimeout(id);
    }, [pos.ord, spine]);

    const handleReady = useCallback(() => {
        setViewportReady(true);
    }, []);

    const handleError = useCallback((message: string) => {
        setErr(message);
    }, []);

    const handlePosition = useCallback((next: ReaderPosition) => {
        setPos((prev) => {
            if (prev.ord === next.ord && sameVerse(prev.verse, next.verse) && sameBook(prev.book, next.book)) {
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