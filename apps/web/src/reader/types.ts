// apps/web/src/reader/types.ts
import type { BookRow } from "../api";
import type { TypographyFont } from "./typography";

/**
 * Reader types (web) — Biblia.to
 *
 * Design goals:
 * - JSON-safe, transport-friendly
 * - canon anchored (verseKey + verseOrd are immutable anchors)
 * - token-ready selection + annotation
 * - overlay-ready with deterministic anchoring
 * - local-first + sync-friendly
 *
 * Principles:
 * - layout is ephemeral
 * - anchors are semantic
 * - pixel geometry is a projection cache only
 * - runtime code may derive richer projections, but these types stay transport-safe
 */

/* =============================================================================
   Small utility aliases
============================================================================= */

export type IsoDateTimeString = string;
export type ReaderId = string;
export type VerseKey = string;
export type BookId = string;
export type TranslationId = string;
export type TokenizerId = string;
export type DeviceId = string;
export type Revision = number;
export type CssPx = number;
export type UnitInterval = number; // expected 0..1 when used as normalized UI geometry

export type Nullable<T> = T | null;
export type Maybe<T> = T | null | undefined;

/* =============================================================================
   Core Reader Data
============================================================================= */

export type SpineStats = Readonly<{
    verseOrdMin: number;
    verseOrdMax: number;
    verseCount: number;
}>;

export type VerseRef = Readonly<{
    bookId: BookId;
    chapter: number;
    verse?: number | null;
}>;

export type TranslationRef = Readonly<{
    translationId: TranslationId;
    label?: string | null;
}>;

export type TokenizerRef = Readonly<{
    tokenizerId: TokenizerId;
    version?: string | null;
}>;

export type SliceTokenKind =
    | "WORD"
    | "PUNCT"
    | "SPACE"
    | "LINEBREAK"
    | "MARKER"
    | "NUMBER"
    | "SYMBOL";

/**
 * Canonical token shape for reader payloads.
 *
 * Notes:
 * - Flat and transport-safe
 * - Supports semantic anchoring + DOM projection
 * - `token` is the rendered token text exactly as emitted by the tokenizer
 * - char offsets are local to the verse text payload
 */
export type SliceToken = Readonly<{
    tokenIndex: number;
    token: string;
    tokenNorm?: string | null;
    tokenKind?: SliceTokenKind | null;
    charStart?: number | null;
    charEnd?: number | null;
    tokenTag?: string | null;
}>;

/**
 * Backward-compatible alias.
 * Older code may still import `SliceVerseToken`.
 */
export type SliceVerseToken = SliceToken;

export type SliceVerse = Readonly<{
    verseKey: VerseKey;
    verseOrd: number;

    bookId: BookId;
    chapter: number;
    verse: number;

    text: string | null;

    translation?: TranslationRef | null;
    tokenizer?: TokenizerRef | null;
    tokens?: ReadonlyArray<SliceToken> | null;

    updatedAt: IsoDateTimeString | null;
}>;

export type SlicePayload = Readonly<{
    verses: ReadonlyArray<SliceVerse>;
    spine: SpineStats;
}>;

export type ReaderPosition = Readonly<{
    ord: number;
    verse: SliceVerse | null;
    book: BookRow | null;
}>;

export type ReaderCurrentPos = Readonly<{
    label: string;
    ord: number;
    bookId: BookId | null;
    chapter: number | null;
    verse: number | null;
}>;

/** Minimal “jump” intent used by controls. */
export type ReaderJump = VerseRef;

/* =============================================================================
   Anchoring + Selection
============================================================================= */

export type ReaderAnchor = Readonly<{
    verseOrd: number;
    verseKey: VerseKey;
    translationId?: TranslationId | null;
    tokenizerId?: TokenizerId | null;
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
    verseKey: VerseKey;
    tokenStart: number;
    tokenEnd: number;
}>;

export type ReaderVerseSpan = Readonly<{
    startVerseOrd: number;
    endVerseOrd: number;
    startVerseKey: VerseKey;
    endVerseKey: VerseKey;
}>;

/**
 * Export / lookup-friendly flattened selection snapshot.
 * Useful for copy/share/export without forcing consumers to traverse anchors.
 */
export type ReaderSelectionSnapshot = Readonly<{
    range: ReaderRange;
    verseSpan: ReaderVerseSpan;
    translationId?: TranslationId | null;
    text?: string | null;
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

export type ReaderAnnotationScope = "RANGE" | "WHOLE_VERSE";
export type ReaderVisibility = "PRIVATE" | "SHARED" | "PUBLIC";

export type ReaderInk =
    | "INK_0"
    | "INK_1"
    | "INK_2"
    | "INK_3"
    | "INK_4"
    | "INK_5";

export type ReaderHighlightStyle = "SOLID" | "SOFT" | "UNDERLINE" | "OUTLINE";
export type ReaderUnderlineStyle = "SINGLE" | "DOUBLE";

export type ReaderTag = Readonly<{
    value: string;
}>;

export type ReaderNoteBody =
    | Readonly<{ format: "PLAINTEXT"; text: string }>
    | Readonly<{ format: "MARKDOWN"; md: string }>;

export type ReaderAnnotationBase = Readonly<{
    id: ReaderId;
    kind: ReaderAnnotationKind;
    range: ReaderRange;
    scope?: ReaderAnnotationScope | null;
    ink?: ReaderInk | null;
    visibility?: ReaderVisibility | null;
    tags?: ReadonlyArray<string> | null;
    createdAt: IsoDateTimeString;
    updatedAt: IsoDateTimeString;
    deletedAt?: IsoDateTimeString | null;
    rev?: Revision | null;
    deviceId?: DeviceId | null;
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
        style?: ReaderUnderlineStyle | null;
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
    p?: number | null; // pressure
    t?: number | null; // time or sequence-adjacent scalar
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
    left: CssPx;
    top: CssPx;
    width: CssPx;
    height: CssPx;
}>;

/**
 * Normalized bbox projection, typically relative to a verse block or container.
 * 0..1 expected for each coordinate.
 */
export type NormalizedRect = Readonly<{
    minX: UnitInterval;
    minY: UnitInterval;
    maxX: UnitInterval;
    maxY: UnitInterval;
}>;

export type RangeOverlayProjection = Readonly<{
    range: ReaderRange;
    rects: ReadonlyArray<ViewportRect>;
    computedAt: IsoDateTimeString;
    typographySig?: string | null;
}>;

/* =============================================================================
   Copy / Export / Share
============================================================================= */

export type ReaderExportLine = Readonly<{
    verseKey: VerseKey;
    verseOrd: number;
    bookId: BookId;
    chapter: number;
    verse: number;
    text: string;
}>;

export type ReaderExportBlock = Readonly<{
    range: ReaderRange;
    text: string;
    lines?: ReadonlyArray<ReaderExportLine> | null;
    refLabel?: string | null;
    translationId?: TranslationId | null;
}>;

/* =============================================================================
   Reader Preferences
============================================================================= */

export type ReaderTypographyPrefs = Readonly<{
    enabled: boolean;
    font: TypographyFont;
    sizePx: number;
    weight: number;
    leading: number;
    measurePx: number;
}>;

export type ReaderTokenizationPrefs = Readonly<{
    enabled: boolean;
    tokenizerId?: TokenizerId | null;
}>;

export type ReaderAnnotationPrefs = Readonly<{
    ink?: ReaderInk | null;
    highlightStyle?: ReaderHighlightStyle | null;
    visibility?: ReaderVisibility | null;
}>;

export type ReaderPrefs = Readonly<{
    typography: ReaderTypographyPrefs;
    tokenization?: ReaderTokenizationPrefs | null;
    annotation?: ReaderAnnotationPrefs | null;
}>;

/* =============================================================================
   Sync Shapes
============================================================================= */

export type ReaderAnnotationSyncRequest = Readonly<{
    sinceRev?: Revision | null;
    deviceId?: DeviceId | null;
    upserts?: ReadonlyArray<ReaderAnnotation> | null;
    deletes?: ReadonlyArray<ReaderId> | null;
}>;

export type ReaderAnnotationSyncResponse = Readonly<{
    rev: Revision;
    upserts: ReadonlyArray<ReaderAnnotation>;
    deletes: ReadonlyArray<ReaderId>;
}>;

/* =============================================================================
   Convenient unions / helpers
============================================================================= */

export type ReaderEntity =
    | SliceVerse
    | ReaderAnnotation
    | ReaderRange
    | ReaderExportBlock;

export type ReaderAnnotationMap = ReadonlyMap<ReaderId, ReaderAnnotation>;
export type VerseIndexMap = ReadonlyMap<number, SliceVerse>;
export type BookIndexMap = ReadonlyMap<BookId, BookRow>;

export type ReaderLoadState<T> =
    | Readonly<{ status: "idle" }>
    | Readonly<{ status: "loading" }>
    | Readonly<{ status: "ready"; value: T }>
    | Readonly<{ status: "error"; message: string }>;

export type ReaderMaybeVerse = SliceVerse | null;
export type ReaderMaybeAnnotation = ReaderAnnotation | null;