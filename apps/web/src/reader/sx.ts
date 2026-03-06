// apps/web/src/reader/sx.ts
import type { CSSProperties } from "react";

/**
 * Reader UI tokens (inline styles)
 *
 * Hardening notes:
 * - true center column with shrinkable middle
 * - safe-area aware
 * - scroll viewport remains absolute/inset:0 for virtualizer stability
 * - fixed invalid focus token usage
 * - prefers dvh over vh for viewport correctness
 */

const RADIUS = 14;

const HAIRLINE = "color-mix(in oklab, var(--hairline) 92%, transparent)";
const PANEL_WASH = "color-mix(in oklab, var(--panel) 22%, transparent)";
const PANEL_WASH_FOCUS = "color-mix(in oklab, var(--panel) 26%, transparent)";
const FOCUS_RING_WASH = "color-mix(in oklab, var(--focusRing) 90%, transparent)";

const SAFE_TOP = "env(safe-area-inset-top, 0px)";
const SAFE_BOT = "env(safe-area-inset-bottom, 0px)";
const SAFE_L = "env(safe-area-inset-left, 0px)";
const SAFE_R = "env(safe-area-inset-right, 0px)";

export const sx: Record<string, CSSProperties> = {
    /* ---------- Shell ---------- */
    page: {
        height: "100dvh",
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        color: "var(--fg)",
        background: "var(--bg)",
        isolation: "isolate",
        overflow: "hidden",
    },

    /* ---------- Header ---------- */
    topBar: {
        position: "sticky",
        top: 0,
        zIndex: 60,
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr) auto",
        alignItems: "center",
        columnGap: 12,
        paddingTop: `calc(10px + ${SAFE_TOP})`,
        paddingBottom: 10,
        paddingLeft: `calc(12px + ${SAFE_L})`,
        paddingRight: `calc(12px + ${SAFE_R})`,
        background: "color-mix(in oklab, var(--bg) 88%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: `1px solid ${HAIRLINE}`,
        boxShadow: "0 10px 22px rgba(0, 0, 0, 0.032)",
        transform: "translateZ(0)",
    },

    topLeft: {
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        minWidth: 0,
        minHeight: 40,
        gap: 10,
    },

    topCenter: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 0,
        textAlign: "initial",
    },

    topRight: {
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        minWidth: 0,
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
        width: "clamp(200px, 26vw, 520px)",
        minWidth: 0,
        maxWidth: "100%",
        flex: "1 1 auto",
    },

    themeWrap: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingLeft: 2,
        flex: "0 0 auto",
    },

    backBtn: {
        fontSize: 12,
        padding: "7px 12px",
        borderRadius: 999,
        border: `1px solid ${HAIRLINE}`,
        background: "color-mix(in oklab, var(--panel) 90%, transparent)",
        color: "inherit",
        cursor: "pointer",
        lineHeight: 1,
        userSelect: "none",
        whiteSpace: "nowrap",
        boxSizing: "border-box",
        boxShadow: "0 8px 18px rgba(0,0,0,0.055)",
        transition:
            "transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease, background 140ms ease, opacity 140ms ease",
        outline: "none",
        WebkitTapHighlightColor: "transparent",
    },

    backBtnHover: {
        background: "color-mix(in oklab, var(--panel) 94%, transparent)",
        borderColor: "color-mix(in oklab, var(--hairline) 98%, transparent)",
        boxShadow: "0 10px 20px rgba(0,0,0,0.07)",
        transform: "translateY(-0.5px)",
    },

    backBtnActive: {
        transform: "translateY(0px)",
        boxShadow: "0 6px 14px rgba(0,0,0,0.06)",
        opacity: 0.96,
    },

    /* ---------- Viewport ---------- */
    body: {
        position: "relative",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        contain: "layout paint",
    },

    scroll: {
        position: "absolute",
        inset: 0,
        overflowX: "hidden",
        overflowY: "auto",
        paddingTop: 18,
        paddingBottom: `calc(96px + ${SAFE_BOT})`,
        overscrollBehaviorY: "contain",
        scrollbarGutter: "stable",
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-y",
        scrollbarWidth: "thin",
        scrollbarColor: "color-mix(in oklab, var(--hairline) 86%, transparent) transparent",
        transform: "translateZ(0)",
    },

    container: {
        paddingLeft: `calc(16px + ${SAFE_L})`,
        paddingRight: `calc(16px + ${SAFE_R})`,
        width: "100%",
        maxWidth: "var(--bpReaderMeasure, 840px)",
        marginInline: "auto",
        boxSizing: "border-box",
    },

    msg: {
        fontSize: 12,
        color: "var(--muted)",
        padding: "18px 0",
        whiteSpace: "pre-wrap",
    },

    /* ---------- Book / chapter headers ---------- */
    bookHeader: {
        padding: "16px 2px 12px",
        marginTop: 6,
        borderBottom: `1px solid ${HAIRLINE}`,
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
        borderBottom: `1px solid ${HAIRLINE}`,
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

    /* ---------- Verse rows ---------- */
    verseRow: {
        display: "grid",
        gridTemplateColumns: "34px minmax(0, 1fr)",
        gap: 12,
        alignItems: "start",
        borderRadius: RADIUS,
        padding: "9px 6px",
        boxSizing: "border-box",
        background: "transparent",
        transition: "background 140ms ease, transform 140ms ease, box-shadow 140ms ease",
        WebkitTapHighlightColor: "transparent",
    },

    verseRowHover: {
        background: PANEL_WASH,
    },

    verseRowFocus: {
        background: PANEL_WASH_FOCUS,
        boxShadow: `0 0 0 3px ${FOCUS_RING_WASH}`,
    },

    verseRowSelected: {
        background: "color-mix(in oklab, var(--panel) 30%, transparent)",
        boxShadow: "0 0 0 1px color-mix(in oklab, var(--hairline) 96%, transparent)",
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
        minWidth: 0,
        overflowWrap: "anywhere",
        wordBreak: "break-word",
    },

    /* ---------- Skeleton ---------- */
    skelRow: {
        display: "grid",
        gridTemplateColumns: "34px minmax(0, 1fr)",
        gap: 12,
        alignItems: "start",
        borderRadius: RADIUS,
        padding: "9px 6px",
        opacity: 0.55,
        boxSizing: "border-box",
    },

    skelText: {
        height: 14,
        borderRadius: 9,
        background: "color-mix(in oklab, var(--hairline) 92%, transparent)",
        marginTop: 6,
    },
};