// apps/web/src/reader/sx.ts
import type React from "react";

/**
 * Reader UI tokens (inline styles)
 * Goals:
 * - crisp sticky header without “heavy bar” feel
 * - center area should never force child centering weirdness
 * - stable scroll + measure-driven column
 * - verse rows: calmer spacing, less “boxy”, better rhythm
 */
export const sx: Record<string, React.CSSProperties> = {
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
        borderBottom: "1px solid var(--hairline)",
        background: "color-mix(in oklab, var(--bg) 86%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 8px 26px rgba(0, 0, 0, 0.05)",
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
        // Some controls (PositionPill) use inline-grid and can inherit text-align.
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
        border: "1px solid var(--hairline)",
        background: "color-mix(in oklab, var(--panel) 92%, transparent)",
        cursor: "pointer",
        lineHeight: 1,
        transition: "transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease, background 140ms ease",
        color: "inherit",
        userSelect: "none",
        whiteSpace: "nowrap",
        boxShadow: "0 10px 26px rgba(0,0,0,0.08)",
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
        padding: "18px 0 96px",
        overscrollBehaviorY: "contain",
        scrollbarGutter: "stable",
        WebkitOverflowScrolling: "touch",
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
        borderBottom: "1px solid var(--hairline)",
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
        borderBottom: "1px solid var(--hairline)",
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
        transition: "background 140ms ease, transform 140ms ease",
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
        background: "var(--hairline)",
        marginTop: 6,
    },
};