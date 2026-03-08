// apps/web/src/reader/sx.ts
import type { CSSProperties } from "react";

/**
 * Reader UI tokens (inline styles)
 *
 * Hardened / improved:
 * - stable virtualized reader viewport
 * - safe-area aware shell/header/body
 * - explicit z/layer tokens
 * - true shrinkable center header column
 * - calmer premium row states
 * - no invalid / non-portable inline style tokens
 * - explicit row wrapper surface for verse containers
 * - safer cross-browser fallbacks for inline React CSSProperties
 *
 * Notes:
 * - keep layout-critical surfaces simple and deterministic
 * - avoid size containment on virtualized row wrappers
 * - inline styles only: no pseudo selectors, no unsupported token tricks
 * - values are chosen to cooperate with base.css tokens
 */

type SxMap = Readonly<Record<string, CSSProperties>>;

const RADIUS_PX = 14;
const HEADER_Z = 60;

const mix = (value: string) => `color-mix(in oklab, ${value})`;

const HAIRLINE = mix("var(--hairline) 92%, transparent");
const HAIRLINE_STRONG = mix("var(--hairline) 98%, transparent");
const PANEL_WASH = mix("var(--panel) 22%, transparent");
const PANEL_WASH_FOCUS = mix("var(--panel) 26%, transparent");
const PANEL_WASH_SELECTED = mix("var(--panel) 30%, transparent");
const FOCUS_RING_WASH = mix("var(--focusRing) 90%, transparent");
const PANEL_BG_SOFT = mix("var(--panel) 90%, transparent");
const PANEL_BG_SOFT_HOVER = mix("var(--panel) 94%, transparent");
const HEADER_BG = mix("var(--bg) 88%, transparent");
const SKELETON_BG = mix("var(--hairline) 92%, transparent");
const SCROLLBAR_THUMB = mix("var(--hairline) 86%, transparent");

const SAFE_TOP = "env(safe-area-inset-top, 0px)";
const SAFE_BOTTOM = "env(safe-area-inset-bottom, 0px)";
const SAFE_LEFT = "env(safe-area-inset-left, 0px)";
const SAFE_RIGHT = "env(safe-area-inset-right, 0px)";

const HEADER_HORIZONTAL_PAD = 12;
const BODY_HORIZONTAL_PAD = 16;
const HEADER_TOP_PAD = 10;
const HEADER_BOTTOM_PAD = 10;
const SCROLL_TOP_PAD = 18;
const SCROLL_BOTTOM_PAD = 96;

const ROW_SCROLL_MARGIN_TOP = `calc(72px + ${SAFE_TOP})`;

export const sx = {
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
        zIndex: HEADER_Z,
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr) auto",
        alignItems: "center",
        columnGap: 12,
        paddingTop: `calc(${HEADER_TOP_PAD}px + ${SAFE_TOP})`,
        paddingBottom: HEADER_BOTTOM_PAD,
        paddingLeft: `calc(${HEADER_HORIZONTAL_PAD}px + ${SAFE_LEFT})`,
        paddingRight: `calc(${HEADER_HORIZONTAL_PAD}px + ${SAFE_RIGHT})`,
        background: HEADER_BG,
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
        gap: 10,
        minWidth: 0,
        minHeight: 40,
    },

    topCenter: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 0,
        textAlign: "center",
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
        minWidth: 0,
        paddingLeft: 2,
        flex: "0 0 auto",
    },

    backBtn: {
        appearance: "none",
        WebkitAppearance: "none",
        fontSize: 12,
        lineHeight: 1,
        whiteSpace: "nowrap",
        userSelect: "none",
        cursor: "pointer",
        color: "inherit",
        background: PANEL_BG_SOFT,
        border: `1px solid ${HAIRLINE}`,
        borderRadius: 999,
        padding: "7px 12px",
        boxSizing: "border-box",
        boxShadow: "0 8px 18px rgba(0,0,0,0.055)",
        outline: "none",
        WebkitTapHighlightColor: "transparent",
        transition:
             "transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease, background 140ms ease, opacity 140ms ease",
    },

    backBtnHover: {
        background: PANEL_BG_SOFT_HOVER,
        borderColor: HAIRLINE_STRONG,
        boxShadow: "0 10px 20px rgba(0,0,0,0.07)",
        transform: "translateY(-0.5px)",
    },

    backBtnActive: {
        transform: "translateY(0)",
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
        paddingTop: SCROLL_TOP_PAD,
        paddingBottom: `calc(${SCROLL_BOTTOM_PAD}px + ${SAFE_BOTTOM})`,
        overscrollBehaviorY: "contain",
        scrollbarGutter: "stable",
        scrollbarWidth: "thin",
        scrollbarColor: `${SCROLLBAR_THUMB} transparent`,
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-y",
        transform: "translateZ(0)",
    },

    container: {
        width: "100%",
        maxWidth: "var(--bpReaderMeasure, 840px)",
        minWidth: 0,
        marginInline: "auto",
        paddingLeft: `calc(${BODY_HORIZONTAL_PAD}px + ${SAFE_LEFT})`,
        paddingRight: `calc(${BODY_HORIZONTAL_PAD}px + ${SAFE_RIGHT})`,
        boxSizing: "border-box",
    },

    msg: {
        padding: "18px 0",
        fontSize: 12,
        color: "var(--muted)",
        whiteSpace: "pre-wrap",
    },

    /* ---------- Book / chapter headers ---------- */
    bookHeader: {
        padding: "16px 2px 12px",
        marginTop: 6,
        borderBottom: `1px solid ${HAIRLINE}`,
        scrollMarginTop: ROW_SCROLL_MARGIN_TOP,
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
        fontWeight: 650,
        lineHeight: 1.15,
        letterSpacing: "-0.03em",
        textWrap: "balance",
    },

    chapterHeader: {
        padding: "12px 2px 10px",
        marginTop: 14,
        borderBottom: `1px solid ${HAIRLINE}`,
        scrollMarginTop: ROW_SCROLL_MARGIN_TOP,
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
        fontWeight: 650,
        lineHeight: 1.2,
        letterSpacing: "-0.02em",
        textWrap: "balance",
    },

    /* ---------- Verse rows ---------- */
    verseRowWrap: {
        padding: 0,
        margin: 0,
        minWidth: 0,
        width: "100%",
        boxSizing: "border-box",
    },

    verseRow: {
        display: "grid",
        gridTemplateColumns: "34px minmax(0, 1fr)",
        gap: 12,
        alignItems: "start",
        borderRadius: RADIUS_PX,
        padding: "9px 6px",
        boxSizing: "border-box",
        background: "transparent",
        transition: "background 140ms ease, transform 140ms ease, box-shadow 140ms ease",
        WebkitTapHighlightColor: "transparent",
        scrollMarginTop: ROW_SCROLL_MARGIN_TOP,
        width: "100%",
        minWidth: 0,
        outline: "none",
    },

    verseRowHover: {
        background: PANEL_WASH,
    },

    verseRowFocus: {
        background: PANEL_WASH_FOCUS,
        boxShadow: `0 0 0 3px ${FOCUS_RING_WASH}`,
    },

    verseRowSelected: {
        background: PANEL_WASH_SELECTED,
        boxShadow: `0 0 0 1px ${HAIRLINE_STRONG}`,
    },

    verseNum: {
        paddingTop: 6,
        fontSize: 10,
        textAlign: "right",
        color: "var(--muted)",
        letterSpacing: "0.14em",
        fontVariantNumeric: "tabular-nums",
        userSelect: "none",
        opacity: 0.9,
        minWidth: 0,
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
        borderRadius: RADIUS_PX,
        padding: "9px 6px",
        boxSizing: "border-box",
        opacity: 0.55,
        width: "100%",
        minWidth: 0,
    },

    skelText: {
        height: 14,
        marginTop: 6,
        borderRadius: 9,
        background: SKELETON_BG,
    },
} satisfies SxMap;