// apps/web/src/reader/sx.ts
import type { CSSProperties } from "react";

/**
 * Reader UI tokens (inline styles)
 * Goals:
 * - crisp sticky header without “heavy bar” feel
 * - center area should never force child centering weirdness
 * - stable scroll + measure-driven column
 * - verse rows: calmer spacing, less “boxy”, better rhythm
 *
 * Notes:
 * - Uses color-mix(in oklab, ...) consistently (your theme already relies on it).
 * - Header shadow is intentionally *thin* (more “lift” than “bar”).
 * - Verse rows are “air-first”: hover is a soft wash, not a tile.
 */
export const sx: Record<string, CSSProperties> = {
    page: {
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        color: "var(--fg)",
        background: "var(--bg)",
    },

    /* ---------- Header ---------- */
    topBar: {
        position: "sticky",
        top: 0,
        zIndex: 10,

        display: "grid",
        gridTemplateColumns: "minmax(92px, 1fr) auto minmax(92px, 1fr)",
        alignItems: "center",
        gap: 12,

        padding: "10px 14px",

        // “Glass” but not milky
        background: "color-mix(in oklab, var(--bg) 88%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",

        // Hairline + micro shadow (avoid “heavy bar”)
        borderBottom: "1px solid color-mix(in oklab, var(--hairline) 92%, transparent)",
        boxShadow: "0 10px 22px rgba(0, 0, 0, 0.035)",

        // Prevent weird halos on some GPUs
        transform: "translateZ(0)",
    },

    topLeft: {
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        minWidth: 92,
        minHeight: 40,
    },

    topCenter: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 0,

        // IMPORTANT:
        // Center wrapper should NOT force text-align center on children.
        textAlign: "initial",
    },

    topRight: {
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        minWidth: 92,
        minHeight: 40,
    },

    rightCluster: {
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 10,
        minWidth: 0,
    },

    searchWrap: {
        width: "clamp(160px, 21vw, 248px)",
        minWidth: 0,
    },

    themeWrap: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingLeft: 2,
    },

    backBtn: {
        fontSize: 12,
        padding: "7px 11px",
        borderRadius: 12,
        border: "1px solid color-mix(in oklab, var(--hairline) 92%, transparent)",
        background: "color-mix(in oklab, var(--panel) 90%, transparent)",
        color: "inherit",
        cursor: "pointer",
        lineHeight: 1,
        userSelect: "none",
        whiteSpace: "nowrap",

        // Lighter than before (avoid “button sticker” look)
        boxShadow: "0 8px 18px rgba(0,0,0,0.06)",
        transition:
            "transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease, background 140ms ease, opacity 140ms ease",
        outline: "none",
    },

    /* ---------- Viewport ---------- */
    body: {
        position: "relative",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
    },

    scroll: {
        position: "absolute",
        inset: 0,
        overflow: "auto",

        // Top padding should feel “breathing”, bottom allows footer UI / lazy loads
        padding: "18px 0 96px",

        overscrollBehaviorY: "contain",
        scrollbarGutter: "stable",
        WebkitOverflowScrolling: "touch",

        // Prevent subpixel wobble on some platforms
        transform: "translateZ(0)",
    },

    // Reader column width is driven by --bpReaderMeasure (controlled by typography UI).
    // Keep padding here minimal so measure feels consistent.
    container: {
        paddingInline: 16,
        maxWidth: "var(--bpReaderMeasure, 840px)",
        marginInline: "auto",
    },

    msg: {
        fontSize: 12,
        color: "var(--muted)",
        padding: "18px 0",
        whiteSpace: "pre-wrap",
    },

    /* ---------- Verse rows ---------- */
    bookHeader: {
        padding: "16px 2px 12px",
        marginTop: 6,
        borderBottom: "1px solid color-mix(in oklab, var(--hairline) 92%, transparent)",
    },

    bookKicker: {
        fontSize: 9,
        letterSpacing: "0.34em",
        textTransform: "uppercase",
        color: "var(--muted)",
        opacity: 0.95,
    },

    bookTitle: {
        marginTop: 9,
        fontSize: 24,
        letterSpacing: "-0.03em",
        fontWeight: 650,
        lineHeight: 1.15,
    },

    chapterHeader: {
        padding: "12px 2px 10px",
        marginTop: 14,
        borderBottom: "1px solid color-mix(in oklab, var(--hairline) 92%, transparent)",
    },

    chapterKicker: {
        fontSize: 9,
        letterSpacing: "0.34em",
        textTransform: "uppercase",
        color: "var(--muted)",
    },

    chapterTitle: {
        marginTop: 8,
        fontSize: 16,
        letterSpacing: "-0.02em",
        fontWeight: 650,
        lineHeight: 1.2,
    },

    // Verse rows should feel like “air + alignment”, not a box.
    verseRow: {
        display: "grid",
        gridTemplateColumns: "36px 1fr",
        gap: 12,
        alignItems: "start",

        borderRadius: 14,
        padding: "9px 6px",

        // Default: transparent. Hover should be applied by caller if desired,
        // but we prep the transition to keep it premium.
        background: "transparent",
        transition: "background 140ms ease, transform 140ms ease, box-shadow 140ms ease",

        // Avoid accidental selection highlight bleed in some browsers
        WebkitTapHighlightColor: "transparent",
    },

    verseNum: {
        fontSize: 10,
        color: "var(--muted)",
        letterSpacing: "0.14em",
        textAlign: "right",
        paddingTop: 6,
        userSelect: "none",
        fontVariantNumeric: "tabular-nums",
        opacity: 0.9,
    },

    verseText: {
        // intentionally empty; .scripture handles typography
    },
    verseRowHover: {
        background: "color-mix(in oklab, var(--panel) 22%, transparent)",
    },

    verseRowFocus: {
        background: "color-mix(in oklab, var(--panel) 26%, transparent)",
        boxShadow: "0 0 0 3px color-mix(in oklab, var(--focus) 18%, transparent)",
    },

    /* ---------- Skeleton ---------- */
    skelRow: {
        display: "grid",
        gridTemplateColumns: "36px 1fr",
        gap: 12,
        alignItems: "start",
        borderRadius: 14,
        padding: "9px 6px",
        opacity: 0.55,
    },

    skelText: {
        height: 14,
        borderRadius: 9,
        background: "color-mix(in oklab, var(--hairline) 92%, transparent)",
        marginTop: 6,
    },
};