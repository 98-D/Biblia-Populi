// apps/web/src/reader/types.ts
import type { BookRow } from "../api";

/**
 * Reader types (web) — Biblia.to
 *
 * Design goals:
 * - JSON-safe, transport-friendly
 * - Canon anchored (verseKey + verseOrd are immutable anchors)
 * - Token-ready selection + annotation
 * - Overlay-ready with deterministic anchoring
 *
 * Principle:
 * - Layout is ephemeral
 * - Anchors must be semantic
 * - Pixel geometry is a projection cache only
 */

/* =============================================================================
   Core Reader Data
============================================================================= */

export type SpineStats = Readonly<{
    verseOrdMin: number;
    verseOrdMax: number;
    verseCount: number;
}>;

export type VerseRef = Readonly<{
    bookId: string;
    chapter: number;
    verse?: number | null;
}>;

export type TranslationRef = Readonly<{
    translationId: string;
    label?: string | null;
}>;

export type SliceTokenKind =
    | "WORD"
    | "PUNCT"
    | "SPACE"
    | "LINEBREAK"
    | "MARKER"
    | "NUMBER"
    | "SYMBOL";

export type TokenizerRef = Readonly<{
    tokenizerId: string;
    version?: string | null;
}>;

export type SliceVerseToken = Readonly<{
    tokenIndex: number;
    token: string;
    tokenNorm?: string | null;
    tokenKind?: SliceTokenKind | null;
    charStart?: number | null;
    charEnd?: number | null;
    tokenTag?: string | null;
}>;

export type SliceVerse = Readonly<{
    verseKey: string;
    verseOrd: number;

    bookId: string;
    chapter: number;
    verse: number;

    text: string | null;

    translation?: TranslationRef | null;
    tokenizer?: TokenizerRef | null;
    tokens?: ReadonlyArray<SliceVerseToken> | null;

    updatedAt: string | null;
}>;

export type ReaderPosition = Readonly<{
    ord: number;
    verse: SliceVerse | null;
    book: BookRow | null;
}>;

export type ReaderCurrentPos = Readonly<{
    label: string;
    ord: number;
    bookId: string | null;
    chapter: number | null;
    verse: number | null;
}>;

export type ReaderJump = VerseRef;

/* =============================================================================
   Anchoring + Selection
============================================================================= */

export type ReaderAnchor = Readonly<{
    verseOrd: number;
    verseKey: string;
    translationId?: string | null;
    tokenizerId?: string | null;
    tokenStart?: number | null;
    tokenEnd?: number | null;
    charStart?: number | null;
    charEnd?: number | null;
}>;

export type ReaderSelectionOrigin =
    | "MOUSE_DRAG"
    | "KEYBOARD"
    | "TOUCH"
    | "PROGRAM"
    | "SEARCH"
    | "SHARE_LINK";

export type ReaderRange = Readonly<{
    start: ReaderAnchor;
    end: ReaderAnchor;
    origin?: ReaderSelectionOrigin | null;
}>;

export type ReaderTokenSpan = Readonly<{
    verseOrd: number;
    verseKey: string;
    tokenStart: number;
    tokenEnd: number;
}>;

/* =============================================================================
   Annotation System
============================================================================= */

export type ReaderAnnotationKind =
    | "HIGHLIGHT"
    | "UNDERLINE"
    | "NOTE"
    | "BOOKMARK"
    | "LINK"
    | "DRAWING";

export type ReaderVisibility = "PRIVATE" | "SHARED" | "PUBLIC";
export type ReaderId = string;

export type ReaderInk =
    | "INK_0"
    | "INK_1"
    | "INK_2"
    | "INK_3"
    | "INK_4"
    | "INK_5";

export type ReaderHighlightStyle = "SOLID" | "SOFT" | "UNDERLINE" | "OUTLINE";

export type ReaderNoteBody =
    | Readonly<{ format: "PLAINTEXT"; text: string }>
    | Readonly<{ format: "MARKDOWN"; md: string }>;

export type ReaderAnnotationBase = Readonly<{
    id: ReaderId;
    kind: ReaderAnnotationKind;
    range: ReaderRange;
    scope?: "RANGE" | "WHOLE_VERSE" | null;
    ink?: ReaderInk | null;
    visibility?: ReaderVisibility | null;
    tags?: ReadonlyArray<string> | null;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string | null;
    rev?: number | null;
    deviceId?: string | null;
}>;

export type ReaderHighlight = ReaderAnnotationBase &
    Readonly<{
        kind: "HIGHLIGHT";
        style?: ReaderHighlightStyle | null;
        strength?: number | null;
    }>;

export type ReaderUnderline = ReaderAnnotationBase &
    Readonly<{
        kind: "UNDERLINE";
        style?: "SINGLE" | "DOUBLE" | null;
    }>;

export type ReaderNote = ReaderAnnotationBase &
    Readonly<{
        kind: "NOTE";
        title?: string | null;
        body: ReaderNoteBody;
        uiState?: Readonly<{ collapsed?: boolean | null }> | null;
    }>;

export type ReaderBookmark = ReaderAnnotationBase &
    Readonly<{
        kind: "BOOKMARK";
        label?: string | null;
    }>;

export type ReaderLinkTarget =
    | Readonly<{ type: "VERSE_REF"; ref: VerseRef }>
    | Readonly<{ type: "RANGE"; range: ReaderRange }>
    | Readonly<{ type: "URL"; url: string }>
    | Readonly<{ type: "SEARCH"; query: string }>;

export type ReaderLink = ReaderAnnotationBase &
    Readonly<{
        kind: "LINK";
        target: ReaderLinkTarget;
        label?: string | null;
    }>;

export type ReaderDrawingProjection = "VERSE_BLOCK" | "RANGE_BLOCK" | "PAGE_VIEW";

export type ReaderPoint = Readonly<{
    x: number;
    y: number;
    p?: number | null;
    t?: number | null;
}>;

export type ReaderStroke = Readonly<{
    strokeId: ReaderId;
    points: ReadonlyArray<ReaderPoint>;
    ink?: ReaderInk | null;
    width?: number | null;
    smooth?: boolean | null;
}>;

export type ReaderDrawingPayload = Readonly<{
    version: 1;
    ink?: ReaderInk | null;
    width?: number | null;
    strokes: ReadonlyArray<ReaderStroke>;
}>;

export type ReaderDrawing = ReaderAnnotationBase &
    Readonly<{
        kind: "DRAWING";
        drawing: ReaderDrawingPayload;
        projection?: ReaderDrawingProjection | null;
    }>;

export type ReaderAnnotation =
    | ReaderHighlight
    | ReaderUnderline
    | ReaderNote
    | ReaderBookmark
    | ReaderLink
    | ReaderDrawing;

/* =============================================================================
   UI Geometry Projections
============================================================================= */

export type VerseDomKey = Readonly<{
    verseOrd: number;
    elementId: string;
}>;

export type ViewportRect = Readonly<{
    left: number;
    top: number;
    width: number;
    height: number;
}>;

export type RangeOverlayProjection = Readonly<{
    range: ReaderRange;
    rects: ReadonlyArray<ViewportRect>;
    computedAt: string;
    typographySig?: string | null;
}>;

/* =============================================================================
   Copy / Export / Share
============================================================================= */

export type ReaderExportLine = Readonly<{
    verseKey: string;
    verseOrd: number;
    bookId: string;
    chapter: number;
    verse: number;
    text: string;
}>;

export type ReaderExportBlock = Readonly<{
    range: ReaderRange;
    text: string;
    lines?: ReadonlyArray<ReaderExportLine> | null;
    refLabel?: string | null;
    translationId?: string | null;
}>;

/* =============================================================================
   Reader Preferences
============================================================================= */

export type ReaderTypographyPrefs = Readonly<{
    enabled: boolean;
    font: string;
    sizePx: number;
    weight: number;
    leading: number;
    measurePx: number;
}>;

export type ReaderPrefs = Readonly<{
    typography: ReaderTypographyPrefs;
    tokenization?: Readonly<{
        enabled: boolean;
        tokenizerId?: string | null;
    }> | null;
    annotation?: Readonly<{
        ink?: ReaderInk | null;
        highlightStyle?: ReaderHighlightStyle | null;
        visibility?: ReaderVisibility | null;
    }> | null;
}>;

/* =============================================================================
   Sync Shapes
============================================================================= */

export type ReaderAnnotationSyncRequest = Readonly<{
    sinceRev?: number | null;
    deviceId?: string | null;
    upserts?: ReadonlyArray<ReaderAnnotation> | null;
    deletes?: ReadonlyArray<ReaderId> | null;
}>;

export type ReaderAnnotationSyncResponse = Readonly<{
    rev: number;
    upserts: ReadonlyArray<ReaderAnnotation>;
    deletes: ReadonlyArray<ReaderId>;
}>;

/* =============================================================================
   Slice Payload
============================================================================= */

export type SlicePayload = Readonly<{
    verses: ReadonlyArray<SliceVerse>;
    spine: SpineStats;
}>;