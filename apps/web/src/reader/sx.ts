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
        zIndex: 5,
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderBottom: "1px solid var(--hairline)",
        background: "var(--bg)",
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.04)",  // Added subtle shadow for depth and elegance
        transition: "box-shadow 200ms ease",  // Smooth transition for potential interactions
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
        width: "clamp(160px, 210px, 230px)",  // Refined to use clamp for smoother responsiveness
    },

    themeWrap: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingLeft: 2,
    },

    backBtn: {
        fontSize: 12,
        padding: "6px 10px",  // Slightly increased horizontal padding for better touch targets
        borderRadius: 10,
        border: "1px solid var(--hairline)",
        background: "var(--panel)",
        cursor: "pointer",
        lineHeight: 1,
        transition: "transform 140ms ease, opacity 140ms ease, background 140ms ease",  // Added background transition for subtle hover/press effects
        color: "inherit",
        userSelect: "none",
        whiteSpace: "nowrap",
    },

    /* ---------- Viewport ---------- */
    body: {
        position: "relative",
        flex: 1,
        minHeight: 0,
    },

    scroll: {
        position: "absolute",
        inset: 0,
        overflow: "auto",
        padding: "16px 0 80px",
        overscrollBehaviorY: "contain",
        scrollbarGutter: "stable",
        WebkitOverflowScrolling: "touch",
    },

    container: {
        paddingInline: 18,
        maxWidth: 840,
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
        padding: "14px 2px 10px",
        marginTop: 6,
        borderBottom: "1px solid var(--hairline)",
    },

    bookKicker: {
        fontSize: 9,
        letterSpacing: "0.33em",
        textTransform: "uppercase",
        color: "var(--muted)",
        opacity: 0.95,
    },

    bookTitle: {
        marginTop: 8,
        fontSize: 22,
        letterSpacing: "-0.03em",
        fontWeight: 600,  // Added semi-bold weight for better typographic hierarchy
    },

    chapterHeader: {
        padding: "10px 2px 8px",
        marginTop: 12,
        borderBottom: "1px solid var(--hairline)",
    },

    chapterKicker: {
        fontSize: 9,
        letterSpacing: "0.33em",
        textTransform: "uppercase",
        color: "var(--muted)",
    },

    chapterTitle: {
        marginTop: 8,
        fontSize: 16,
        letterSpacing: "-0.02em",
        fontWeight: 600,  // Added semi-bold weight for consistency
    },

    verseRow: {
        display: "grid",
        gridTemplateColumns: "30px 1fr",
        gap: 12,
        alignItems: "start",
        borderRadius: 12,
        padding: "10px 6px",
        transition: "background 200ms ease",  // Added for potential hover effects in components
    },

    verseNum: {
        fontSize: 10,
        color: "var(--muted)",
        letterSpacing: "0.12em",
        textAlign: "right",
        paddingTop: 4,
        userSelect: "none",
    },

    verseText: {
        // intentionally empty; .scripture handles typography
    },

    skelRow: {
        display: "grid",
        gridTemplateColumns: "30px 1fr",
        gap: 12,
        alignItems: "start",
        borderRadius: 12,
        padding: "10px 6px",
        opacity: 0.55,
    },

    skelText: {
        height: 14,
        borderRadius: 8,
        background: "var(--hairline)",
        marginTop: 6,
    },
};