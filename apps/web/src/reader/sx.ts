// apps/web/src/reader/sx.ts
import type React from "react";

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
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderBottom: "1px solid var(--hairline)",
        background: "color-mix(in oklab, var(--bg) 88%, transparent)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.06)",
    },

    topLeft: {
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        minWidth: 92,
    },

    topCenter: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 0,
    },

    topRight: {
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        minWidth: 92,
    },

    rightCluster: {
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 12,
        minWidth: 0,
    },

    searchWrap: {
        width: "clamp(170px, 22vw, 260px)",
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
    container: {
        paddingInline: 18,
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

    verseRow: {
        display: "grid",
        gridTemplateColumns: "34px 1fr",
        gap: 12,
        alignItems: "start",
        borderRadius: 14,
        padding: "10px 8px",
        transition: "background 140ms ease, transform 140ms ease",
    },

    verseNum: {
        fontSize: 10,
        color: "var(--muted)",
        letterSpacing: "0.14em",
        textAlign: "right",
        paddingTop: 5,
        userSelect: "none",
        fontVariantNumeric: "tabular-nums",
        opacity: 0.9,
    },

    verseText: {
        // intentionally empty; .scripture handles typography
    },

    skelRow: {
        display: "grid",
        gridTemplateColumns: "34px 1fr",
        gap: 12,
        alignItems: "start",
        borderRadius: 14,
        padding: "10px 8px",
        opacity: 0.55,
    },

    skelText: {
        height: 14,
        borderRadius: 9,
        background: "var(--hairline)",
        marginTop: 6,
    },
};