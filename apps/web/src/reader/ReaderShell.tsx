// apps/web/src/reader/ReaderShell.tsx
import React, { useMemo } from "react";
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

    viewportRef: (h: ReaderViewportHandle | null) => void;
    onPosition: (pos: ReaderPosition) => void;
    onError?: (msg: string) => void;
    onReady?: () => void;

    err?: string | null;
};

function ErrBanner(props: { msg: string }) {
    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                borderBottom: "1px solid color-mix(in oklab, var(--hairline) 92%, transparent)",
                background: "color-mix(in oklab, var(--bg) 94%, var(--panel))",
            }}
        >
            <div
                style={{
                    maxWidth: "var(--bpReaderMeasure, 840px)",
                    marginInline: "auto",
                    padding: "9px 18px",
                }}
            >
                <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "pre-wrap" }}>{props.msg}</div>
            </div>
        </div>
    );
}

function LoadingBody() {
    return (
        <div style={sx.body}>
            <div style={{ maxWidth: "var(--bpReaderMeasure, 840px)", marginInline: "auto", padding: "0 18px" }}>
                <div style={sx.msg}>Loading…</div>
            </div>
        </div>
    );
}

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

    // Ensure stable identity (helps reduce useless re-renders downstream)
    const stableTopContent = useMemo(() => null as React.ReactNode, []);

    return (
        <main style={sx.page}>
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
                    ref={viewportRef}
                    spine={spine}
                    bookById={bookById}
                    onPosition={onPosition}
                    onError={onError}
                    onReady={onReady}
                    topContent={stableTopContent}
                />
            ) : (
                <LoadingBody />
            )}
        </main>
    );
}