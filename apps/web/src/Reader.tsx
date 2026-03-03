// apps/web/src/Reader.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGetBooks, apiGetSpine, apiResolveLoc, type BookRow } from "./api";
import type { ReaderLocation } from "./Search";
import type { Mode } from "./theme";
import { ReaderShell } from "./reader/ReaderShell";
import type { ReaderPosition, SpineStats } from "./reader/types";
import type { ReaderViewportHandle } from "./reader/ReaderViewport";

type Props = {
    styles: Record<string, React.CSSProperties>;
    onBackHome: () => void;
    initialLocation?: ReaderLocation;

    mode?: Mode;
    onToggleTheme?: () => void;
};

export function Reader(props: Props) {
    const { styles, onBackHome, initialLocation, mode, onToggleTheme } = props;

    const [books, setBooks] = useState<BookRow[] | null>(null);
    const [spine, setSpine] = useState<SpineStats | null>(null);

    const [err, setErr] = useState<string | null>(null);
    const [pos, setPos] = useState<ReaderPosition>(() => ({ ord: 1, verse: null, book: null }));

    const viewportRef = useRef<ReaderViewportHandle | null>(null);
    const [viewportReady, setViewportReady] = useState(false);
    const pendingJumpRef = useRef<{ ord: number; behavior: "auto" | "smooth" } | null>(null);

    // Load books + spine once
    useEffect(() => {
        let alive = true;

        (async () => {
            try {
                const [b, s] = await Promise.all([apiGetBooks(), apiGetSpine()]);
                if (!alive) return;

                setBooks(b.books);
                setSpine(s);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                if (!alive) return;
                setErr(msg);
            }
        })();

        return () => {
            alive = false;
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
    }, [spine, pos]);

    async function jumpToRef(bookId: string, chapter: number, verse: number | null): Promise<void> {
        try {
            setErr(null);
            const loc = await apiResolveLoc(bookId, chapter, verse);
            if (!loc?.verseOrd) return;

            if (viewportRef.current) viewportRef.current.jumpToOrd(loc.verseOrd, "smooth");
            else pendingJumpRef.current = { ord: loc.verseOrd, behavior: "smooth" };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setErr(msg);
        }
    }

    // Resolve incoming ReaderLocation -> verseOrd, then jump (auto)
    useEffect(() => {
        const loc = initialLocation;
        if (!loc) return;

        let alive = true;
        (async () => {
            try {
                const resolved = await apiResolveLoc(loc.bookId, loc.chapter, loc.verse ?? null);
                if (!alive) return;
                if (!resolved?.verseOrd) return;

                if (viewportRef.current && viewportReady) viewportRef.current.jumpToOrd(resolved.verseOrd, "auto");
                else pendingJumpRef.current = { ord: resolved.verseOrd, behavior: "auto" };
            } catch {
                // ignore
            }
        })();

        return () => {
            alive = false;
        };
    }, [initialLocation?.bookId, initialLocation?.chapter, initialLocation?.verse, viewportReady]);

    // If we had a pending jump and now we’re ready, perform it once.
    useEffect(() => {
        if (!spine) return;
        if (!viewportReady) return;
        if (!viewportRef.current) return;

        const p = pendingJumpRef.current;
        if (!p) return;
        pendingJumpRef.current = null;
        viewportRef.current.jumpToOrd(p.ord, p.behavior);
    }, [spine, viewportReady]);

    return (
        <ReaderShell
            styles={styles}
            books={books}
            onBackHome={onBackHome}
            current={{
                label: posLabel,
                ord: pos.ord,
                bookId: pos.verse?.bookId ?? null,
                chapter: pos.verse?.chapter ?? null,
                verse: pos.verse?.verse ?? null,
            }}
            onJumpRef={(b, c, v) => void jumpToRef(b, c, v)}
            onNavigate={(loc) => void jumpToRef(loc.bookId, loc.chapter, loc.verse ?? null)}
            mode={mode}
            onToggleTheme={onToggleTheme}
            spine={spine}
            bookById={bookById}
            viewportRef={(h) => {
                viewportRef.current = h;
            }}
            onPosition={setPos}
            onError={(m) => setErr(m)}
            onReady={() => setViewportReady(true)}
            err={err}
        />
    );
}