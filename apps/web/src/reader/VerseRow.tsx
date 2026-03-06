// apps/web/src/reader/VerseRow.tsx
import React, { useCallback, useMemo, useRef, useState } from "react";
import type { BookRow } from "../api";
import type { SliceVerse } from "./types";
import { sx } from "./sx";
import { BookTitlePage } from "./BookTitlePage";

type Props = {
    row: SliceVerse;
    book: BookRow | null;
};

/**
 * Biblia.to — VerseRow (token-ready + selection/annotation-friendly)
 *
 * Upgrades:
 * - Stable IDs + data-* for verse + (optional) token anchors
 * - Pointer hover/focus are “non-thrashy” and ignore touch hover
 * - Keyboard: Enter/Space can toggle an "active" state hook via data attribute (non-breaking)
 * - Safer aria: verse is a region-like article with described-by text node
 * - Optional token rendering (if row.tokens exists) with char offsets when available
 *
 * NOTE:
 * - This component does NOT implement selection/highlight yet; it only emits stable DOM anchors
 *   that your future selection engine can target deterministically.
 */
export const VerseRow = React.memo(function VerseRow({ row, book }: Props) {
    const isBookStart = row.chapter === 1 && row.verse === 1;
    const isChapterStart = row.verse === 1;

    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);

    // Optional “active” state (future: click to open annotation menu, etc.)
    const [active, setActive] = useState(false);

    const rootRef = useRef<HTMLDivElement | null>(null);

    // Hover is a mouse/pen affordance; avoid “sticky hover” on touch.
    const onEnter = useCallback((e: React.PointerEvent) => {
        if (e.pointerType === "touch") return;
        setHovered((v) => (v ? v : true));
    }, []);
    const onLeave = useCallback((e: React.PointerEvent) => {
        if (e.pointerType === "touch") return;
        setHovered((v) => (v ? false : v));
    }, []);

    const onFocus = useCallback(() => setFocused((v) => (v ? v : true)), []);
    const onBlur = useCallback(() => {
        setFocused((v) => (v ? false : v));
        setActive(false);
    }, []);

    const onKeyDown = useCallback((e: React.KeyboardEvent) => {
        // Keep this conservative; do not swallow arrows/page keys that scrolling might depend on.
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setActive((v) => !v);
        }
        if (e.key === "Escape") {
            setActive(false);
        }
    }, []);

    const bookLabel = (book?.name ?? row.bookId).toString();
    const ariaLabel = useMemo(() => `${bookLabel} ${row.chapter}:${row.verse}`, [bookLabel, row.chapter, row.verse]);

    const verseTextId = `ord-${row.verseOrd}-text`;

    const rowStyle = useMemo<React.CSSProperties>(() => {
        const base = sx.verseRow;
        const h = hovered ? sx.verseRowHover : undefined;
        const f = focused ? sx.verseRowFocus : undefined;
        // Active is optional; if you have a style token, it’ll apply; otherwise no-op.
        const a = active ? (sx as any).verseRowActive : undefined;
        return { ...base, ...(h ?? {}), ...(f ?? {}), ...(a ?? {}) };
    }, [hovered, focused, active]);

    // Token-ready render:
    // - If tokens are present, each token becomes a stable span with data-token-index.
    // - If tokens are absent, render the plain text exactly as before.
    const tokens = row.tokens ?? null;

    const verseBody = useMemo(() => {
        if (!tokens || tokens.length === 0) {
            return row.text ?? "";
        }

        // Render tokens as spans so selection/highlight can snap to token boundaries.
        return (
            <>
                {tokens.map((t) => {
                    const key = `${row.verseOrd}:${t.tokenIndex}`;
                    return (
                        <span
                            key={key}
                            data-token-index={t.tokenIndex}
                            data-token-kind={t.tokenKind ?? undefined}
                            data-char-start={t.charStart ?? undefined}
                            data-char-end={t.charEnd ?? undefined}
                        >
                            {t.token}
                        </span>
                    );
                })}
            </>
        );
    }, [tokens, row.text, row.verseOrd]);

    return (
        <div
            id={`ord-${row.verseOrd}`}
            ref={rootRef}
            data-ord={row.verseOrd}
            data-verse-key={row.verseKey}
            data-book={row.bookId}
            data-chapter={row.chapter}
            data-verse={row.verse}
            data-has-tokens={tokens && tokens.length > 0 ? "1" : "0"}
            data-active={active ? "1" : "0"}
            style={{ padding: 0 }}
        >
            {isBookStart ? <BookTitlePage book={book} bookId={row.bookId} /> : null}

            {isChapterStart ? (
                <div style={sx.chapterHeader}>
                    <div style={sx.chapterKicker}>CHAPTER</div>
                    <div style={sx.chapterTitle}>
                        {bookLabel} {row.chapter}
                    </div>
                </div>
            ) : null}

            {/* Make the *row* the focus target (not the inner text). */}
            <div
                role="article"
                aria-roledescription="verse"
                aria-label={ariaLabel}
                aria-describedby={verseTextId}
                tabIndex={0}
                style={rowStyle}
                onPointerEnter={onEnter}
                onPointerLeave={onLeave}
                onFocus={onFocus}
                onBlur={onBlur}
                onKeyDown={onKeyDown}
                onPointerDown={(e) => {
                    // Prevent touch from triggering odd focus/selection behavior.
                    // Mouse should keep default text selection.
                    if (e.pointerType !== "mouse") e.preventDefault();
                }}
                onClick={() => {
                    // Mouse click can mark active without breaking selection; keep it light.
                    setActive(true);
                }}
            >
                <div style={sx.verseNum} aria-hidden="true">
                    {row.verse}
                </div>

                <div
                    id={verseTextId}
                    className="scripture"
                    style={sx.verseText}
                    data-verse-ord={row.verseOrd}
                    data-verse-key={row.verseKey}
                >
                    {verseBody}
                </div>
            </div>
        </div>
    );
});