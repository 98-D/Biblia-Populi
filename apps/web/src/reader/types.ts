// apps/web/src/reader/types.ts
import type { BookRow } from "../api";

/**
 * Reader types (web)
 * - Keep these minimal + transport-friendly (what the UI actually needs).
 * - Everything here is safe to JSON round-trip.
 */

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

/** A verse row returned by /slice (what the reader virtual list renders). */
export type SliceVerse = Readonly<{
    verseKey: string; // stable scripture identity key for the canon
    verseOrd: number; // global ordinal (bp_verse.verse_ord)
    bookId: string;
    chapter: number;
    verse: number;
    text: string | null; // translation overlay text (or null if missing)
    updatedAt: string | null; // ISO timestamp string (or null)
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