// apps/web/src/reader/ReaderShell.tsx
import React, { memo, useMemo } from "react";
import type { BookRow } from "../api";
import type { ReaderLocation } from "../Search";
import type { Mode } from "../theme";
import type { ReaderPosition, SpineStats } from "./types";
import { ReaderHeader } from "./ReaderHeader";
import { ReaderViewport, type ReaderViewportHandle } from "./ReaderViewport";
import { sx } from "./sx";

type CurrentPos = {
    label: string;
    ord: number;
    bookId: string | null;
    chapter: number | null;
    verse: number | null;
};

type Props = {
    styles: Record<string, React.CSSProperties>;
    books: BookRow[] | null;

    onBackHome: () => void;

    current: CurrentPos;
    onJumpRef: (bookId: string, chapter: number, verse: number | null) => void;
    onNavigate: (loc: ReaderLocation) => void;

    mode?: Mode;
    onToggleTheme?: () => void;

    spine: SpineStats | null;
    bookById: Map<string, BookRow>;

    /** Pass-through ref target for ReaderViewport */
    viewportRef?: React.Ref<ReaderViewportHandle> | null;

    onPosition: (pos: ReaderPosition) => void;
    onError?: (msg: string) => void;
    onReady?: () => void;

    err?: string | null;
};

const MeasureWrap = memo(function MeasureWrap(props: { children: React.ReactNode }) {
    const style = useMemo<React.CSSProperties>(
        () => ({
            maxWidth: "var(--bpReaderMeasure, 840px)",
            marginInline: "auto",
            paddingInline: 18,
        }),
        [],
    );

    return <div style={style}>{props.children}</div>;
});

const ErrBanner = memo(function ErrBanner(props: { msg: string }) {
    const outer = useMemo<React.CSSProperties>(
        () => ({
            borderBottom: "1px solid color-mix(in oklab, var(--hairline) 92%, transparent)",
            background: "color-mix(in oklab, var(--bg) 94%, var(--panel))",
        }),
        [],
    );

    return (
        <div role="status" aria-live="polite" style={outer}>
            <MeasureWrap>
                <div style={{ paddingBlock: 9 }}>
                    <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "pre-wrap" }}>{props.msg}</div>
                </div>
            </MeasureWrap>
        </div>
    );
});

const LoadingBody = memo(function LoadingBody() {
    return (
        <div style={sx.body}>
            <MeasureWrap>
                <div style={sx.msg} role="status" aria-live="polite">
                    Loading…
                </div>
            </MeasureWrap>
        </div>
    );
});

export function ReaderShell(props: Props) {
    const {
        styles,
        books,
        onBackHome,
        current,
        onJumpRef,
        onNavigate,
        mode,
        onToggleTheme,
        spine,
        bookById,
        viewportRef,
        onPosition,
        onError,
        onReady,
        err,
    } = props;

    const hasData = !!spine;

    return (
        <main style={sx.page} aria-busy={!hasData}>
            <ReaderHeader
                styles={styles}
                books={books}
                onBackHome={onBackHome}
                current={current}
                onJumpRef={onJumpRef}
                onNavigate={onNavigate}
                mode={mode}
                onToggleTheme={onToggleTheme}
            />

            {err ? <ErrBanner msg={err} /> : null}

            {spine ? (
                <ReaderViewport
                    ref={viewportRef ?? null}
                    spine={spine}
                    bookById={bookById}
                    onPosition={onPosition}
                    onError={onError}
                    onReady={onReady}
                    topContent={null}
                />
            ) : (
                <LoadingBody />
            )}
        </main>
    );
}