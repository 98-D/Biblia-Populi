// apps/web/src/reader/types.ts
import type { BookRow } from "../api";

/**
 * Reader types (web) — Biblia.to
 *
 * Design goals:
 * - JSON-safe, transport-friendly (server -> client -> localStorage -> server)
 * - Canon anchored (verseKey + verseOrd are the immutable scripture anchors)
 * - Token-ready selection + annotation (stable across font size/measure/line wrapping)
 * - Overlay-ready (highlights, notes, drawings, bookmarks) with deterministic anchoring
 *
 * IMPORTANT PRINCIPLE:
 * - Layout is ephemeral. Anchors must be semantic (ord/keys + token/char ranges).
 * - Any pixel geometry is treated as a *view projection* and can be recomputed.
 */

/* =============================================================================
   Core Reader Data (transport)
============================================================================= */

/** Global spine bounds (by canonical verse_ord). */
export type SpineStats = Readonly<{
    verseOrdMin: number;
    verseOrdMax: number;
    verseCount: number;
}>;

/** A concrete scripture location (verse is optional for chapter-level jumps). */
export type VerseRef = Readonly<{
    bookId: string;
    chapter: number;
    verse?: number | null;
}>;

/**
 * A translation identity (optional but extremely useful once you have multiple translations).
 * Keep it stringly-typed (slug) for transport simplicity.
 */
export type TranslationRef = Readonly<{
    /** e.g. "kjv", "esv", "niv", "lxx", etc */
    translationId: string;
    /** Optional: human label cached client-side */
    label?: string | null;
}>;

/** Token kind for reader interactions (kept stable for DOM + selection logic). */
export type SliceTokenKind =
    | "WORD"
    | "PUNCT"
    | "SPACE"
    | "LINEBREAK"
    | "MARKER"
    | "NUMBER"
    | "SYMBOL";

/**
 * Tokenization config identity.
 * If you ever change tokenization rules, bump tokenizerId to preserve stable selection replay.
 */
export type TokenizerRef = Readonly<{
    /** e.g. "tok_v1_en", "tok_v1_grc", "tok_v1_he" */
    tokenizerId: string;
    /** Optional: version/debug info */
    version?: string | null;
}>;

/**
 * A token inside a verse (optional feature).
 * tokenIndex is local within the verse, 0..N-1, stable for (verseKey, translationId, tokenizerId).
 *
 * Offsets:
 * - charStart/charEnd are offsets into `text` string (if provided)
 * - Convention: [start, end) half-open
 */
export type SliceVerseToken = Readonly<{
    tokenIndex: number;

    /** surface string (can include spaces/punct depending on your tokenizer policy) */
    token: string;

    /** optional normalized form for matching/search/highlight rules */
    tokenNorm?: string | null;

    tokenKind?: SliceTokenKind | null;

    /** offsets into verse text string */
    charStart?: number | null;
    charEnd?: number | null;

    /**
     * Optional: "sub-identity" for special tokens (e.g., footnote markers, speaker tags)
     * Keep opaque; renderer may interpret specific schemes.
     */
    tokenTag?: string | null;
}>;

/**
 * A verse row returned by /slice (what the reader virtual list renders).
 *
 * Notes:
 * - verseKey + verseOrd are the canonical anchors.
 * - text can be null (missing overlay / redaction / not loaded).
 * - tokens are optional (backend might gate tokenization behind a flag).
 */
export type SliceVerse = Readonly<{
    verseKey: string; // stable scripture identity key for the canon
    verseOrd: number; // global ordinal (bp_verse.verse_ord)

    bookId: string;
    chapter: number;
    verse: number;

    /** translation overlay text (or null if missing) */
    text: string | null;

    /** optional translation identity for this row */
    translation?: TranslationRef | null;

    /** optional tokenization identity for this row */
    tokenizer?: TokenizerRef | null;

    /** Optional tokenization for selection/highlight/annotation */
    tokens?: ReadonlyArray<SliceVerseToken> | null;

    /** ISO timestamp string (or null) */
    updatedAt: string | null;
}>;

/** Current reader position (used for sticky header + nav state). */
export type ReaderPosition = Readonly<{
    ord: number; // current topmost visible verse_ord
    verse: SliceVerse | null; // populated once that ord has loaded
    book: BookRow | null; // derived from verse.bookId
}>;

/** Header-friendly representation of the current position. */
export type ReaderCurrentPos = Readonly<{
    label: string;
    ord: number;
    bookId: string | null;
    chapter: number | null;
    verse: number | null;
}>;

/** Minimal “jump” intent used by controls. */
export type ReaderJump = VerseRef;

/* =============================================================================
   Anchoring + Selection (token-first, char fallback)
============================================================================= */

/**
 * A stable anchor inside scripture.
 *
 * Choose a policy:
 * - For partial selections: prefer token ranges (stable under reflow).
 * - If tokens are unavailable: use char offsets as a fallback.
 *
 * Invariants:
 * - Always include verseOrd + verseKey.
 * - tokenStart/tokenEnd and charStart/charEnd are optional, but at least one method should exist
 *   for partial anchors. Whole-verse anchors may omit ranges entirely.
 */
export type ReaderAnchor = Readonly<{
    verseOrd: number;
    verseKey: string;

    /** Optional: tie anchor to translation/tokenizer identity for deterministic replay */
    translationId?: string | null;
    tokenizerId?: string | null;

    /** Preferred: token offsets within verse tokens */
    tokenStart?: number | null;
    tokenEnd?: number | null; // exclusive

    /** Fallback: char offsets within verse text */
    charStart?: number | null;
    charEnd?: number | null; // exclusive
}>;

/**
 * A selection spanning scripture. Can span verses.
 *
 * Normalization rules (recommended):
 * - start must be <= end by (verseOrd, tokenStart/charStart).
 * - end is exclusive when using tokenEnd/charEnd (easy concatenation).
 */
export type ReaderRange = Readonly<{
    start: ReaderAnchor;
    end: ReaderAnchor;

    /** Optional: reason / origin (mouse selection, keyboard, programmatic, search result) */
    origin?: ReaderSelectionOrigin | null;
}>;

export type ReaderSelectionOrigin =
    | "MOUSE_DRAG"
    | "KEYBOARD"
    | "TOUCH"
    | "PROGRAM"
    | "SEARCH"
    | "SHARE_LINK";

/**
 * Convenience for “selected exactly these tokens”.
 * Useful for fast rendering of highlights without re-splitting.
 */
export type ReaderTokenSpan = Readonly<{
    verseOrd: number;
    verseKey: string;
    tokenStart: number;
    tokenEnd: number; // exclusive
}>;

/* =============================================================================
   Annotation System (orientation-only; no doctrine/commentary in canon)
============================================================================= */

/**
 * Annotation kinds your reader UI can support.
 * Keep this small; add variants as your UX grows.
 */
export type ReaderAnnotationKind =
    | "HIGHLIGHT"
    | "UNDERLINE"
    | "NOTE"
    | "BOOKMARK"
    | "LINK"
    | "DRAWING";

/**
 * Annotation visibility / scoping.
 * - PRIVATE: only the user
 * - SHARED: share link / group
 * - PUBLIC: (if you ever do this) visible broadly
 */
export type ReaderVisibility = "PRIVATE" | "SHARED" | "PUBLIC";

/**
 * A stable identifier for local-first objects.
 * Use ULID if you want time-sortable ids; keep type as string for transport.
 */
export type ReaderId = string;

/**
 * A palette entry for monochrome (or “ink”) styling.
 * Keep it as tokens so you can skin via CSS variables.
 */
export type ReaderInk =
    | "INK_0"
    | "INK_1"
    | "INK_2"
    | "INK_3"
    | "INK_4"
    | "INK_5";

/** Highlight style variants. */
export type ReaderHighlightStyle = "SOLID" | "SOFT" | "UNDERLINE" | "OUTLINE";

/**
 * Rich text payload for notes.
 * Keep it simple now; you can expand later (Markdown, ProseMirror JSON, etc).
 */
export type ReaderNoteBody =
    | Readonly<{ format: "PLAINTEXT"; text: string }>
    | Readonly<{ format: "MARKDOWN"; md: string }>;

/**
 * Base shape for any annotation.
 * - Anchors to a ReaderRange (or a single anchor for bookmarks)
 * - Carries metadata for sync + conflict resolution
 */
export type ReaderAnnotationBase = Readonly<{
    id: ReaderId;
    kind: ReaderAnnotationKind;

    /** anchor into canon */
    range: ReaderRange;

    /** optional: if set, means "this annotation applies to whole verse(s) regardless of range offsets" */
    scope?: "RANGE" | "WHOLE_VERSE" | null;

    /** styling */
    ink?: ReaderInk | null;

    /** visibility */
    visibility?: ReaderVisibility | null;

    /** tags for organizing (user-defined) */
    tags?: ReadonlyArray<string> | null;

    /** timestamps (ISO) */
    createdAt: string;
    updatedAt: string;

    /** soft delete */
    deletedAt?: string | null;

    /** sync metadata (optional) */
    rev?: number | null; // monotonic revision for conflict resolution
    deviceId?: string | null;
}>;

/** Highlight annotation */
export type ReaderHighlight = ReaderAnnotationBase &
    Readonly<{
        kind: "HIGHLIGHT";
        style?: ReaderHighlightStyle | null;
        /** intensity 0..1 (UI decides actual effect) */
        strength?: number | null;
    }>;

/** Underline annotation */
export type ReaderUnderline = ReaderAnnotationBase &
    Readonly<{
        kind: "UNDERLINE";
        style?: "SINGLE" | "DOUBLE" | null;
    }>;

/** Note annotation (anchored to a range; UI can show pin/marker) */
export type ReaderNote = ReaderAnnotationBase &
    Readonly<{
        kind: "NOTE";
        title?: string | null;
        body: ReaderNoteBody;
        /** optional: collapsed/expanded in UI */
        uiState?: Readonly<{ collapsed?: boolean | null }> | null;
    }>;

/** Bookmark annotation (often whole verse/chapter) */
export type ReaderBookmark = ReaderAnnotationBase &
    Readonly<{
        kind: "BOOKMARK";
        label?: string | null;
    }>;

/** Link annotation (connects a range to some target) */
export type ReaderLink = ReaderAnnotationBase &
    Readonly<{
        kind: "LINK";
        target: ReaderLinkTarget;
        label?: string | null;
    }>;

export type ReaderLinkTarget =
    | Readonly<{ type: "VERSE_REF"; ref: VerseRef }>
    | Readonly<{ type: "RANGE"; range: ReaderRange }>
    | Readonly<{ type: "URL"; url: string }>
    | Readonly<{ type: "SEARCH"; query: string }>;

/**
 * Drawing annotation (freehand marks).
 * IMPORTANT: DO NOT anchor drawings to pixel coords alone.
 * Anchor to scripture range + store strokes in *normalized local coordinates* relative to a layout box.
 */
export type ReaderDrawing = ReaderAnnotationBase &
    Readonly<{
        kind: "DRAWING";

        /** strokes in a normalized coordinate space */
        drawing: ReaderDrawingPayload;

        /** optional: indicates which projection box the normalized coords refer to */
        projection?: ReaderDrawingProjection | null;
    }>;

/**
 * Projection defines the coordinate space for drawing.
 * - "VERSE_BLOCK": normalize within each verse block
 * - "RANGE_BLOCK": normalize within a single selection rectangle spanning multiple verses (less ideal)
 * - "PAGE_VIEW": normalize within viewport snapshot (least stable; avoid unless necessary)
 */
export type ReaderDrawingProjection = "VERSE_BLOCK" | "RANGE_BLOCK" | "PAGE_VIEW";

/**
 * Drawing payload: vector strokes.
 * All coordinates are normalized [0..1] unless specified.
 */
export type ReaderDrawingPayload = Readonly<{
    version: 1;

    /** which ink style */
    ink?: ReaderInk | null;

    /** stroke width normalized (UI scales based on font size / measure) */
    width?: number | null; // e.g. 0.004

    /** list of strokes */
    strokes: ReadonlyArray<ReaderStroke>;
}>;

export type ReaderStroke = Readonly<{
    /** stable id for incremental editing */
    strokeId: ReaderId;

    /** points in normalized space */
    points: ReadonlyArray<ReaderPoint>;

    /** optional per-stroke overrides */
    ink?: ReaderInk | null;
    width?: number | null;

    /** smoothing hint (UI only) */
    smooth?: boolean | null;
}>;

export type ReaderPoint = Readonly<{
    x: number; // 0..1
    y: number; // 0..1
    /** optional pressure (pen) 0..1 */
    p?: number | null;
    /** optional timestamp delta in ms for replay */
    t?: number | null;
}>;

/**
 * Union of all supported annotations.
 * (Keep this as the single payload type for sync and local storage.)
 */
export type ReaderAnnotation = ReaderHighlight | ReaderUnderline | ReaderNote | ReaderBookmark | ReaderLink | ReaderDrawing;

/* =============================================================================
   UI Geometry Projections (ephemeral, recomputable)
============================================================================= */

/**
 * A DOM-targeted selector for a verse in the viewport.
 * Useful when you need to map anchors -> DOM nodes.
 */
export type VerseDomKey = Readonly<{
    verseOrd: number;
    /** recommended: id like `ord-${verseOrd}` in your VerseRow wrapper */
    elementId: string;
}>;

/**
 * A projected rectangle in viewport coordinates (pixels).
 * This is NOT stable across layout changes; only use for rendering overlays in current view.
 */
export type ViewportRect = Readonly<{
    left: number;
    top: number;
    width: number;
    height: number;
}>;

/**
 * A computed overlay quad(s) for a range highlight in the *current* viewport.
 * Store these only as cache; regenerate on scroll/resize/typography changes.
 */
export type RangeOverlayProjection = Readonly<{
    range: ReaderRange;
    rects: ReadonlyArray<ViewportRect>;
    /** computed at time */
    computedAt: string;
    /** optional: signature of typography settings used for this projection */
    typographySig?: string | null;
}>;

/* =============================================================================
   Copy / Export / Share
============================================================================= */

/**
 * A normalized export block for sharing/copy.
 * Use this to power “Copy with refs”, “Export selection”, etc.
 */
export type ReaderExportBlock = Readonly<{
    range: ReaderRange;

    /** Plain text suitable for clipboard */
    text: string;

    /** Optional: richer payload for share formats */
    lines?: ReadonlyArray<ReaderExportLine> | null;

    /** Reference string (e.g. "John 3:16–18") */
    refLabel?: string | null;

    /** Optional: translation used */
    translationId?: string | null;
}>;

export type ReaderExportLine = Readonly<{
    verseKey: string;
    verseOrd: number;
    bookId: string;
    chapter: number;
    verse: number;
    text: string;
}>;

/* =============================================================================
   Reader Preferences (localStorage-safe)
============================================================================= */

export type ReaderTypographyPrefs = Readonly<{
    enabled: boolean;
    font: string; // css family token
    sizePx: number;
    weight: number;
    leading: number;
    measurePx: number;
}>;

export type ReaderPrefs = Readonly<{
    typography: ReaderTypographyPrefs;

    /** Whether tokens are requested/used (if backend supports). */
    tokenization?: Readonly<{
        enabled: boolean;
        tokenizerId?: string | null;
    }> | null;

    /** Annotation defaults */
    annotation?: Readonly<{
        ink?: ReaderInk | null;
        highlightStyle?: ReaderHighlightStyle | null;
        visibility?: ReaderVisibility | null;
    }> | null;
}>;

/* =============================================================================
   Sync Shapes (optional; local-first friendly)
============================================================================= */

/**
 * A batch payload to sync annotations.
 * Client can send "sinceRev" and receive deltas.
 */
export type ReaderAnnotationSyncRequest = Readonly<{
    sinceRev?: number | null;
    deviceId?: string | null;
    /** changed locally */
    upserts?: ReadonlyArray<ReaderAnnotation> | null;
    /** ids deleted locally */
    deletes?: ReadonlyArray<ReaderId> | null;
}>;

export type ReaderAnnotationSyncResponse = Readonly<{
    /** latest server revision after applying request */
    rev: number;
    /** server-authoritative upserts */
    upserts: ReadonlyArray<ReaderAnnotation>;
    /** server-authoritative deletions */
    deletes: ReadonlyArray<ReaderId>;
}>;

/* =============================================================================
   Small utility types
============================================================================= */

/** Useful for APIs that return a slice of verses. */
export type SlicePayload = Readonly<{
    verses: ReadonlyArray<SliceVerse>;
    spine: SpineStats;
}>;