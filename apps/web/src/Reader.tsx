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

type Props = {
    styles: Record<string, React.CSSProperties>;
    onBackHome: () => void;
    initialLocation?: ReaderLocation;
    mode?: Mode;
    onToggleTheme?: () => void;
};

const LS_LAST_ORD = "bp_last_pos_ord_v1";
const LS_LAST_LOC = "bp_last_pos_loc_v1";

function safeGetLS(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeSetLS(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // ignore
    }
}

function clampOrd(ord: number, spine: SpineStats): number {
    const n = Math.floor(ord);
    return Math.max(spine.verseOrdMin, Math.min(spine.verseOrdMax, n));
}

function parseFiniteInt(s: string | null): number | null {
    if (!s) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return Math.floor(n);
}

type PendingJump = { ord: number; behavior: "auto" | "smooth" };

function makeLocKey(loc?: ReaderLocation): string {
    if (!loc) return "";
    return `${loc.bookId}:${loc.chapter}:${loc.verse ?? ""}`;
}

export function Reader(props: Props) {
    const { styles, onBackHome, initialLocation, mode, onToggleTheme } = props;

    const [books, setBooks] = useState<BookRow[] | null>(null);
    const [spine, setSpine] = useState<SpineStats | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [pos, setPos] = useState<ReaderPosition>(() => ({ ord: 1, verse: null, book: null }));

    const viewportHandleRef = useRef<ReaderViewportHandle | null>(null);
    const [viewportHandle, setViewportHandle] = useState<ReaderViewportHandle | null>(null);
    const [viewportReady, setViewportReady] = useState(false);

    const pendingJumpRef = useRef<PendingJump | null>(null);
    const didRestoreRef = useRef(false);
    const appliedInitialKeyRef = useRef<string>("");
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
        const ac = new AbortController();
        let alive = true;

        (async () => {
            try {
                const [b, s] = await Promise.all([apiGetBooks(), apiGetSpine()]);
                if (!alive || ac.signal.aborted) return;
                setBooks(b.books);
                setSpine(s);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                if (!alive || ac.signal.aborted) return;
                setErr(msg);
            }
        })();

        return () => {
            alive = false;
            ac.abort();
        };
    }, []);

    const bookById = useMemo(() => {
        const m = new Map<string, BookRow>();
        for (const b of books ?? []) m.set(b.bookId, b);
        return m;
    }, [books]);

    const posLabel = useMemo(() => {
        if (!spine) return "…";
        if (!pos.verse) return `#${pos.ord}`;
        const bookName = pos.book?.name ?? pos.verse.bookId;
        return `${bookName} ${pos.verse.chapter}:${pos.verse.verse}`;
    }, [spine, pos.ord, pos.verse, pos.book]);

    const canJumpNow = !!(spine && viewportReady && viewportHandle);

    const setViewportRef = useCallback((h: ReaderViewportHandle | null) => {
        viewportHandleRef.current = h;
        setViewportHandle(h);
    }, []);

    const jumpToOrd = useCallback(
        (ord: number, behavior: "auto" | "smooth") => {
            if (!spine) return;
            const clamped = clampOrd(ord, spine);

            if (viewportHandle && viewportReady) {
                viewportHandle.jumpToOrd(clamped, behavior);
            } else {
                pendingJumpRef.current = { ord: clamped, behavior };
            }
        },
        [spine, viewportHandle, viewportReady],
    );

    const resolveAndJump = useCallback(
        async (bookId: string, chapter: number, verse: number | null, behavior: "auto" | "smooth") => {
            if (!bookId) return;

            annotations.clearSelection();
            setErr(null);

            const seq = ++resolveSeqRef.current;

            try {
                const loc = await apiResolveLoc(bookId, chapter, verse);
                if (seq !== resolveSeqRef.current) return;
                if (!loc?.verseOrd) return;

                jumpToOrd(loc.verseOrd, behavior);

                safeSetLS(
                    LS_LAST_LOC,
                    JSON.stringify({
                        bookId,
                        chapter,
                        verse: verse ?? null,
                    }),
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
        if (!spine) return;

        const key = makeLocKey(initialLocation);
        if (!key) return;
        if (appliedInitialKeyRef.current === key) return;

        appliedInitialKeyRef.current = key;

        const loc = initialLocation;
        if (!loc) return;

        void resolveAndJump(loc.bookId, loc.chapter, loc.verse ?? null, "auto");
    }, [spine, initialLocation, resolveAndJump]);

    useEffect(() => {
        if (!spine) return;
        if (initialLocation) return;
        if (didRestoreRef.current) return;

        didRestoreRef.current = true;

        const ordRaw = parseFiniteInt(safeGetLS(LS_LAST_ORD));
        if (ordRaw == null) return;

        jumpToOrd(ordRaw, "auto");
    }, [spine, initialLocation, jumpToOrd]);

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

    const handleError = useCallback((m: string) => {
        setErr(m);
    }, []);

    const handlePosition = useCallback((p: ReaderPosition) => {
        setPos((prev) => {
            const prevV = prev.verse;
            const nextV = p.verse;

            const sameOrd = prev.ord === p.ord;

            const sameVerse =
                prevV === nextV ||
                (!!prevV &&
                    !!nextV &&
                    prevV.bookId === nextV.bookId &&
                    prevV.chapter === nextV.chapter &&
                    prevV.verse === nextV.verse);

            const sameBook =
                prev.book === p.book ||
                (!!prev.book && !!p.book && prev.book.bookId === p.book.bookId);

            if (sameOrd && sameVerse && sameBook) return prev;
            return p;
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
                onHighlight={() => {
                    annotations.createHighlight();
                }}
                onBookmark={() => {
                    annotations.createBookmark();
                }}
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