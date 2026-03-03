// apps/web/src/reader/types.ts
import type { BookRow } from "../api";

export type SpineStats = {
    verseOrdMin: number;
    verseOrdMax: number;
    verseCount: number;
};

export type SliceVerse = {
    verseKey: string;
    verseOrd: number;
    bookId: string;
    chapter: number;
    verse: number;
    text: string | null;
    updatedAt: string | null;
};

export type ReaderPosition = {
    ord: number;
    verse: SliceVerse | null;
    book: BookRow | null;
};