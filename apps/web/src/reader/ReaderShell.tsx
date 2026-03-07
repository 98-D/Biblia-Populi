// apps/web/src/reader/ReaderShell.tsx
import React, { memo, useMemo } from "react";
import type { CSSProperties, MutableRefObject, ReactNode, Ref } from "react";
import type { AnnotationSnapshot } from "@biblia/annotation";
import type { BookRow } from "../api";
import type { ReaderLocation } from "../Search";
import type { Mode } from "../theme";
import { ReaderHeader } from "./ReaderHeader";
import { sx } from "./sx";
import type { ReaderPosition, SpineStats } from "./types";
import { ReaderViewport, type ReaderViewportHandle } from "./ReaderViewport";

type CurrentPos = {
    label: string;
    ord: number;
    bookId: string | null;
    chapter: number | null;
    verse: number | null;
};

type SpineValidation =
     | { ok: true }
     | { ok: false; msg: string };

type Props = {
    styles: Record<string, CSSProperties>;
    books: BookRow[] | null;

    onBackHome: () => void;

    current: CurrentPos;
    onJumpRef: (bookId: string, chapter: number, verse: number | null) => void;
    onNavigate: (loc: ReaderLocation) => void;

    mode?: Mode;
    onToggleTheme?: () => void;

    spine: SpineStats | null;
    bookById: Map<string, BookRow>;

    viewportRef?: Ref<ReaderViewportHandle> | null;
    selectionRootRef?: MutableRefObject<HTMLDivElement | null> | null;
    annotationSnapshot?: AnnotationSnapshot | null;
    topContent?: ReactNode;

    onPosition: (pos: ReaderPosition) => void;
    onError?: (msg: string) => void;
    onReady?: () => void;

    err?: string | null;
};

const MEASURE_WRAP_STYLE: CSSProperties = {
    maxWidth: "var(--bpReaderMeasure, 840px)",
    marginInline: "auto",
    paddingInline: 18,
    boxSizing: "border-box",
    width: "100%",
};

const ERR_BANNER_OUTER_STYLE: CSSProperties = {
    borderBottom: "1px solid color-mix(in oklab, var(--hairline) 92%, transparent)",
    background: "color-mix(in oklab, var(--bg) 94%, var(--panel))",
};

const ERR_BANNER_INNER_STYLE: CSSProperties = {
    paddingBlock: 9,
};

const ERR_TEXT_STYLE: CSSProperties = {
    fontSize: 12,
    color: "var(--muted)",
    whiteSpace: "pre-wrap",
};

function isFiniteIntegerLike(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function validateSpine(spine: SpineStats | null): SpineValidation {
    if (!spine) {
        return { ok: false, msg: "Missing spine." };
    }

    const { verseOrdMin, verseOrdMax, verseCount } = spine;

    if (
         !isFiniteIntegerLike(verseOrdMin) ||
         !isFiniteIntegerLike(verseOrdMax) ||
         !isFiniteIntegerLike(verseCount)
    ) {
        return { ok: false, msg: "Spine has non-numeric fields." };
    }

    if (!Number.isInteger(verseOrdMin) || !Number.isInteger(verseOrdMax) || !Number.isInteger(verseCount)) {
        return { ok: false, msg: "Spine fields must be integers." };
    }

    if (verseOrdMin <= 0 || verseOrdMax <= 0) {
        return { ok: false, msg: "Spine ord bounds must be > 0." };
    }

    if (verseOrdMax < verseOrdMin) {
        return { ok: false, msg: "Spine ord bounds invalid (max < min)." };
    }

    if (verseCount <= 0) {
        return { ok: false, msg: "Spine verseCount must be > 0." };
    }

    const derivedCount = verseOrdMax - verseOrdMin + 1;
    if (verseCount !== derivedCount) {
        return {
            ok: false,
            msg: `Spine mismatch: verseCount=${verseCount} but bounds imply ${derivedCount}. Refusing to mount reader.`,
        };
    }

    return { ok: true };
}

function buildViewportKey(spine: SpineStats | null): string {
    if (!spine) return "no-spine";
    return `${spine.verseOrdMin}:${spine.verseOrdMax}:${spine.verseCount}`;
}

const MeasureWrap = memo(function MeasureWrap(props: { children: ReactNode }) {
    return <div style={MEASURE_WRAP_STYLE}>{props.children}</div>;
});

const ErrBanner = memo(function ErrBanner(props: { msg: string }) {
    return (
         <div role="status" aria-live="polite" style={ERR_BANNER_OUTER_STYLE}>
             <MeasureWrap>
                 <div style={ERR_BANNER_INNER_STYLE}>
                     <div style={ERR_TEXT_STYLE}>{props.msg}</div>
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
        selectionRootRef,
        annotationSnapshot,
        topContent,
        onPosition,
        onError,
        onReady,
        err,
    } = props;

    const spineCheck = useMemo(() => validateSpine(spine), [spine]);
    const hasValidSpine = spineCheck.ok;
    const viewportKey = useMemo(() => buildViewportKey(spine), [spine]);

    const bannerMsg = useMemo(() => {
        if (err) return err;
        if (!spine) return null;
        if (!spineCheck.ok) return spineCheck.msg;
        return null;
    }, [err, spine, spineCheck]);

    return (
         <main style={sx.page} aria-busy={!hasValidSpine}>
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

             {bannerMsg ? <ErrBanner msg={bannerMsg} /> : null}

             {hasValidSpine && spine ? (
                  <ReaderViewport
                       key={viewportKey}
                       ref={viewportRef ?? null}
                       spine={spine}
                       bookById={bookById}
                       selectionRootRef={selectionRootRef ?? null}
                       annotationSnapshot={annotationSnapshot ?? null}
                       topContent={topContent ?? null}
                       onPosition={onPosition}
                       onError={onError}
                       onReady={onReady}
                  />
             ) : (
                  <LoadingBody />
             )}
         </main>
    );
}