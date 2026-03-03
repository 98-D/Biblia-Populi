// apps/web/src/reader/ReaderShell.tsx
import React from "react";
import type { BookRow } from "../api";
import type { ReaderLocation } from "../Search";
import type { Mode } from "../theme";
import type { ReaderPosition, SpineStats } from "./types";
import { ReaderHeader } from "./ReaderHeader";
import { ReaderViewport, type ReaderViewportHandle } from "./ReaderViewport";
import { ReaderControlsBar } from "./ReaderControlsBar";
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

            {/* Reader chrome lives outside the scrollable viewport */}
            <ReaderControlsBar
                left={
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 650, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {current.label}
                        </div>
                    </div>
                }
            />

            {err ? (
                <div style={{ borderBottom: "1px solid var(--hairline)", background: "var(--bg)" }}>
                    <div style={{ maxWidth: "var(--bpReaderMeasure, 840px)", marginInline: "auto", padding: "8px 18px" }}>
                        <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "pre-wrap" }}>{err}</div>
                    </div>
                </div>
            ) : null}

            {spine ? (
                <ReaderViewport
                    ref={viewportRef}
                    spine={spine}
                    bookById={bookById}
                    onPosition={onPosition}
                    onError={onError}
                    onReady={onReady}
                    topContent={null}
                />
            ) : (
                <div style={sx.body}>
                    <div style={{ maxWidth: "var(--bpReaderMeasure, 840px)", marginInline: "auto", padding: "0 18px" }}>
                        <div style={sx.msg}>Loading…</div>
                    </div>
                </div>
            )}
        </main>
    );
}