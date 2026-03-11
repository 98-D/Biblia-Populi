// apps/web/src/auth/AccountMenu.tsx
// cspell:words oklab
import React, {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import {
    ChevronDown,
    ChevronRight,
    LogIn,
    LogOut,
    RefreshCcw,
    Settings2,
    ShieldCheck,
    UserRound,
} from "lucide-react";
import { useAuth } from "./useAuth";

type Size = "sm" | "md";
type Align = "left" | "right";
type Chrome = "standalone" | "docked";

export type Props = Readonly<{
    size?: Size;
    showLabelWhenSignedIn?: boolean;
    showChevron?: boolean;
    align?: Align;
    chrome?: Chrome;
    style?: React.CSSProperties;
}>;

type PopPos = Readonly<{
    top: number;
    left: number;
    width: number;
    placement: "top" | "bottom";
    transformOrigin: string;
}>;

type MenuActionState =
    | "idle"
    | "refreshing"
    | "signing_out"
    | "signing_in"
    | "opening_account";

type UserLike = Readonly<{
    displayName: string | null;
    email: string | null;
}> | null;

type UiDims = Readonly<{
    btn: number;
    avatar: number;
    labelMax: number;
    chevron: number;
    menuWidth: number;
}>;

type ViewportBox = Readonly<{
    left: number;
    top: number;
    width: number;
    height: number;
}>;

type Ui = ReturnType<typeof createUiStyles>;

const VIEWPORT_MARGIN = 12;
const MENU_MIN_WIDTH = 208;
const MENU_GAP = 10;
const MENU_Z_INDEX = 300;
const POINTER_DOWN_FOCUS_RESTORE_DELAY_MS = 0;

const useIsomorphicLayoutEffect =
    typeof window !== "undefined" ? useLayoutEffect : useEffect;

function clamp(n: number, lo: number, hi: number): number {
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
}

function safeFocus(el: HTMLElement | null | undefined): void {
    if (!el) return;
    try {
        el.focus({ preventScroll: true });
    } catch {
        el.focus();
    }
}

function getViewportBox(): ViewportBox {
    if (typeof window === "undefined") {
        return { left: 0, top: 0, width: 0, height: 0 };
    }

    const vv = window.visualViewport;
    if (vv) {
        return {
            left: vv.offsetLeft,
            top: vv.offsetTop,
            width: vv.width,
            height: vv.height,
        };
    }

    return {
        left: 0,
        top: 0,
        width: window.innerWidth,
        height: window.innerHeight,
    };
}

function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
            return;
        }

        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const apply = () => setReduced(mq.matches);

        apply();

        if (typeof mq.addEventListener === "function") {
            mq.addEventListener("change", apply);
            return () => {
                mq.removeEventListener("change", apply);
            };
        }

        mq.addListener(apply);
        return () => {
            mq.removeListener(apply);
        };
    }, []);

    return reduced;
}

function formatUserLabel(user: UserLike): string {
    return user?.displayName?.trim() || user?.email?.trim() || "User";
}

function formatTriggerTitle(user: UserLike, signedIn: boolean): string {
    if (!signedIn) return "Account";
    return user?.displayName?.trim() || user?.email?.trim() || "Account";
}

function initialsFromUser(user: UserLike): string {
    const base = formatUserLabel(user).trim();
    if (!base) return "U";

    const emailName = base.includes("@") ? (base.split("@")[0] ?? base) : base;
    const normalized = emailName.replace(/[._-]+/g, " ").trim();
    const parts = normalized.split(/\s+/g).filter(Boolean);

    if (parts.length >= 2) {
        return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
    }

    return normalized.slice(0, 2).toUpperCase() || "U";
}

function eventComposedPath(e: Event): EventTarget[] | null {
    const maybe = e as Event & { composedPath?: () => EventTarget[] };
    return typeof maybe.composedPath === "function" ? maybe.composedPath() : null;
}

function pathIncludesNode(path: EventTarget[] | null, node: Node | null): boolean {
    if (!path || !node) return false;
    for (const entry of path) {
        if (entry === node) return true;
    }
    return false;
}

function isWithin(
    target: Node | null,
    path: EventTarget[] | null,
    container: HTMLElement | null | undefined,
): boolean {
    if (!container) return false;
    if (target && container.contains(target)) return true;
    return pathIncludesNode(path, container);
}

function getDims(size: Size): UiDims {
    if (size === "md") {
        return {
            btn: 40,
            avatar: 28,
            labelMax: 220,
            chevron: 16,
            menuWidth: 272,
        };
    }

    return {
        btn: 34,
        avatar: 24,
        labelMax: 164,
        chevron: 14,
        menuWidth: 252,
    };
}

function createUiTokens(state: {
    open: boolean;
    hovered: boolean;
    pressed: boolean;
    reducedMotion: boolean;
    chrome: Chrome;
}) {
    const { open, hovered, pressed, reducedMotion, chrome } = state;
    const active = open || hovered;
    const docked = chrome === "docked";

    const ringIdle = "0 0 0 1px color-mix(in srgb, var(--border) 60%, transparent)";
    const ringHover = "0 0 0 1px color-mix(in srgb, var(--border) 72%, transparent)";
    const ringOpen = "0 0 0 1px color-mix(in srgb, var(--border) 80%, transparent)";

    const shadowIdle = "0 8px 20px color-mix(in srgb, black 10%, transparent)";
    const shadowHover = "0 10px 24px color-mix(in srgb, black 13%, transparent)";
    const shadowOpen = "0 14px 34px color-mix(in srgb, black 16%, transparent)";

    return {
        triggerRing: docked ? "none" : open ? ringOpen : active ? ringHover : ringIdle,
        triggerShadow: docked
            ? "none"
            : open
                ? shadowOpen
                : active
                    ? shadowHover
                    : shadowIdle,
        triggerBg: open
            ? "linear-gradient(180deg, color-mix(in srgb, var(--card) 68%, transparent), transparent)"
            : active
                ? "linear-gradient(180deg, color-mix(in srgb, var(--card) 46%, transparent), transparent)"
                : "transparent",
        triggerScale: pressed ? "scale(0.972)" : "scale(1)",
        motionFast: reducedMotion ? undefined : "140ms cubic-bezier(0.16, 1, 0.3, 1)",
        motionMed: reducedMotion ? undefined : "180ms cubic-bezier(0.16, 1, 0.3, 1)",
        menuBorder: "1px solid color-mix(in srgb, var(--border) 78%, transparent)",
        menuBg:
            "linear-gradient(180deg, color-mix(in srgb, var(--card) 97%, white), color-mix(in srgb, var(--card) 99%, transparent))",
        menuShadow: "0 18px 56px color-mix(in srgb, black 20%, transparent)",
        menuDivider: "color-mix(in srgb, var(--border) 72%, transparent)",
        menuAlertBorder: "1px solid color-mix(in srgb, var(--border) 70%, transparent)",
        menuAlertBg: "color-mix(in srgb, var(--activeBg) 44%, transparent)",
        rowHoverBg: "color-mix(in srgb, var(--activeBg) 58%, transparent)",
        rowHoverBorder: "color-mix(in srgb, var(--border) 62%, transparent)",
        rowFocusRing: "0 0 0 3px color-mix(in srgb, var(--focusRing) 78%, transparent)",
        avatarRing: "0 0 0 1px color-mix(in srgb, var(--border) 70%, transparent)",
        avatarBg:
            "linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, white), color-mix(in srgb, var(--card) 99%, transparent))",
        chipBg: "color-mix(in srgb, var(--activeBg) 34%, transparent)",
        chipBorder: "1px solid color-mix(in srgb, var(--border) 70%, transparent)",
    } as const;
}

function createUiStyles(args: {
    dims: UiDims;
    showLabel: boolean;
    showChevron: boolean;
    loading: boolean;
    open: boolean;
    hovered: boolean;
    pressed: boolean;
    reducedMotion: boolean;
    pos: PopPos | null;
    chrome: Chrome;
    style?: React.CSSProperties;
}) {
    const {
        dims,
        showLabel,
        showChevron,
        loading,
        open,
        hovered,
        pressed,
        reducedMotion,
        pos,
        chrome,
        style,
    } = args;

    const t = createUiTokens({ open, hovered, pressed, reducedMotion, chrome });
    const trailingVisible = showLabel || showChevron;
    const docked = chrome === "docked";

    const triggerPad = showLabel
        ? "0 8px 0 4px"
        : trailingVisible
            ? "0 6px 0 4px"
            : 0;

    const triggerGap = trailingVisible ? 6 : 0;
    const minWidth = showLabel
        ? dims.avatar + dims.chevron + 36
        : showChevron
            ? dims.avatar + dims.chevron + 16
            : dims.btn;

    const maxWidth = showLabel
        ? dims.labelMax + dims.avatar + dims.chevron + 40
        : minWidth;

    return {
        trigger: {
            height: dims.btn,
            minWidth,
            maxWidth,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: trailingVisible ? "flex-start" : "center",
            gap: triggerGap,
            padding: triggerPad,
            borderRadius: 999,
            border: "1px solid transparent",
            background: t.triggerBg,
            color: "var(--fg)",
            boxShadow: docked ? "none" : `${t.triggerRing}, ${t.triggerShadow}`,
            cursor: "pointer",
            userSelect: "none",
            WebkitTapHighlightColor: "transparent",
            transition: reducedMotion
                ? undefined
                : [
                    `box-shadow ${t.motionMed}`,
                    "transform 100ms ease-out",
                    "background 140ms ease-out",
                    "opacity 140ms ease-out",
                ].join(", "),
            touchAction: "manipulation",
            transform: t.triggerScale,
            outline: "none",
            ...style,
        } satisfies React.CSSProperties,

        triggerLabel: {
            fontSize: 13,
            fontWeight: 760,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: dims.labelMax,
            opacity: loading ? 0.68 : 1,
        } satisfies React.CSSProperties,

        triggerChevron: {
            display: "grid",
            placeItems: "center",
            opacity: open ? 0.82 : 0.58,
            marginLeft: showLabel ? -1 : 0,
            flex: "0 0 auto",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: reducedMotion
                ? undefined
                : "transform 160ms ease, opacity 140ms ease",
        } satisfies React.CSSProperties,

        menuPanel: pos
            ? ({
                position: "fixed",
                top: pos.top,
                left: pos.left,
                width: pos.width,
                zIndex: MENU_Z_INDEX,
                borderRadius: 16,
                border: t.menuBorder,
                background: t.menuBg,
                boxShadow: t.menuShadow,
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                padding: 8,
                transformOrigin: pos.transformOrigin,
                opacity: 1,
                transform: "translateY(0) scale(1)",
                transition: reducedMotion
                    ? undefined
                    : "opacity 140ms cubic-bezier(0.16, 1, 0.3, 1), transform 140ms cubic-bezier(0.16, 1, 0.3, 1)",
            } satisfies React.CSSProperties)
            : null,

        menuHeader: {
            display: "grid",
            gridTemplateColumns: "auto minmax(0, 1fr)",
            alignItems: "center",
            gap: 10,
            padding: "6px 6px 8px",
        } satisfies React.CSSProperties,

        menuHeaderTextWrap: {
            minWidth: 0,
            display: "grid",
            gap: 4,
        } satisfies React.CSSProperties,

        menuHeaderTopRow: {
            display: "flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
        } satisfies React.CSSProperties,

        menuHeaderTitle: {
            fontWeight: 800,
            fontSize: 13,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            opacity: loading ? 0.74 : 1,
            minWidth: 0,
        } satisfies React.CSSProperties,

        statusChip: {
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            minHeight: 20,
            padding: "0 7px",
            borderRadius: 999,
            border: t.chipBorder,
            background: t.chipBg,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.01em",
            whiteSpace: "nowrap",
            flex: "0 0 auto",
        } satisfies React.CSSProperties,

        menuHeaderSubline: {
            fontSize: 12,
            opacity: 0.72,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
        } satisfies React.CSSProperties,

        menuAlert: {
            margin: "0 6px 8px",
            padding: "8px 10px",
            borderRadius: 12,
            border: t.menuAlertBorder,
            background: t.menuAlertBg,
            fontSize: 12,
            lineHeight: 1.4,
            opacity: 0.92,
        } satisfies React.CSSProperties,

        divider: {
            height: 1,
            background: t.menuDivider,
            margin: "6px 0",
        } satisfies React.CSSProperties,

        avatar: (signedIn: boolean, sizePx: number): React.CSSProperties => ({
            width: sizePx,
            height: sizePx,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            background: t.avatarBg,
            boxShadow: t.avatarRing,
            color: signedIn ? "var(--fg)" : "var(--muted)",
            userSelect: signedIn ? "none" : undefined,
            flex: "0 0 auto",
        }),

        rowBase: {
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "9px 10px",
            borderRadius: 12,
            border: "1px solid transparent",
            textAlign: "left",
            fontSize: 13,
            lineHeight: 1.2,
            userSelect: "none",
            WebkitTapHighlightColor: "transparent",
            outline: "none",
            transition:
                "background 140ms ease, border-color 140ms ease, box-shadow 140ms ease, opacity 140ms ease, transform 120ms ease",
        } satisfies React.CSSProperties,

        rowHoverBg: t.rowHoverBg,
        rowHoverBorder: t.rowHoverBorder,
        rowFocusRing: t.rowFocusRing,
    } as const;
}

function usePopoverPosition(args: {
    open: boolean;
    align: Align;
    menuWidth: number;
    anchorRef: React.RefObject<HTMLElement | null>;
    menuRef: React.RefObject<HTMLElement | null>;
}) {
    const { open, align, menuWidth, anchorRef, menuRef } = args;

    const [pos, setPos] = useState<PopPos | null>(null);
    const rafRef = useRef<number | null>(null);

    const compute = useCallback(() => {
        const anchor = anchorRef.current;
        if (!anchor || typeof window === "undefined") return;

        const viewport = getViewportBox();
        const r = anchor.getBoundingClientRect();
        const mh = menuRef.current?.getBoundingClientRect().height ?? 0;
        const maxWidth = Math.max(MENU_MIN_WIDTH, viewport.width - VIEWPORT_MARGIN * 2);
        const mw = Math.min(menuWidth, maxWidth);

        const minLeft = viewport.left + VIEWPORT_MARGIN;
        const maxLeft = Math.max(minLeft, viewport.left + viewport.width - mw - VIEWPORT_MARGIN);

        const left =
            align === "right"
                ? clamp(r.right - mw, minLeft, maxLeft)
                : clamp(r.left, minLeft, maxLeft);

        const belowTop = r.bottom + MENU_GAP;
        const aboveTop = r.top - MENU_GAP - mh;

        const minTop = viewport.top + VIEWPORT_MARGIN;
        const maxTop = Math.max(minTop, viewport.top + viewport.height - mh - VIEWPORT_MARGIN);

        const canFitBelow = belowTop + mh <= viewport.top + viewport.height - VIEWPORT_MARGIN;
        const canFitAbove = aboveTop >= minTop;

        const placement: PopPos["placement"] =
            !canFitBelow && canFitAbove ? "top" : "bottom";

        const unclampedTop = placement === "top" ? aboveTop : belowTop;
        const top = clamp(unclampedTop, minTop, maxTop);

        const originX = align === "right" ? "right" : "left";
        const originY = placement === "top" ? "bottom" : "top";

        setPos({
            top,
            left,
            width: mw,
            placement,
            transformOrigin: `${originX} ${originY}`,
        });
    }, [align, menuWidth, anchorRef, menuRef]);

    const schedule = useCallback(() => {
        if (typeof window === "undefined") return;
        if (rafRef.current != null) return;

        rafRef.current = window.requestAnimationFrame(() => {
            rafRef.current = null;
            compute();
        });
    }, [compute]);

    useIsomorphicLayoutEffect(() => {
        if (!open) {
            setPos(null);
            return;
        }

        compute();

        if (typeof window === "undefined") return;

        const onResizeOrScroll = () => schedule();

        window.addEventListener("resize", onResizeOrScroll);
        window.addEventListener("scroll", onResizeOrScroll, true);

        const vv = window.visualViewport;
        vv?.addEventListener("resize", onResizeOrScroll);
        vv?.addEventListener("scroll", onResizeOrScroll);

        const t = window.setTimeout(() => schedule(), 0);

        let ro: ResizeObserver | null = null;
        if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(() => schedule());
            if (menuRef.current) ro.observe(menuRef.current);
            if (anchorRef.current) ro.observe(anchorRef.current);
        }

        return () => {
            window.clearTimeout(t);
            window.removeEventListener("resize", onResizeOrScroll);
            window.removeEventListener("scroll", onResizeOrScroll, true);
            vv?.removeEventListener("resize", onResizeOrScroll);
            vv?.removeEventListener("scroll", onResizeOrScroll);

            if (rafRef.current != null) {
                window.cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }

            ro?.disconnect();
        };
    }, [open, compute, schedule, menuRef, anchorRef]);

    return pos;
}

function AvatarCircle(props: {
    user: UserLike;
    sizePx: number;
    signedIn: boolean;
    ui: Ui;
}) {
    const { user, sizePx, signedIn, ui } = props;

    if (!signedIn) {
        return (
            <div aria-hidden="true" style={ui.avatar(false, sizePx)}>
                <UserRound size={Math.max(16, Math.floor(sizePx * 0.58))} />
            </div>
        );
    }

    return (
        <div
            aria-hidden="true"
            style={{
                ...ui.avatar(true, sizePx),
                fontSize: Math.max(11, Math.floor(sizePx * 0.42)),
                fontWeight: 800,
                letterSpacing: "0.04em",
            }}
        >
            {initialsFromUser(user)}
        </div>
    );
}

function MenuDivider(props: { ui: Ui }) {
    return <div aria-hidden="true" style={props.ui.divider} />;
}

function RowButton(props: {
    ui: Ui;
    label: string;
    hint?: string;
    icon?: React.ReactNode;
    onClick: () => void | Promise<void>;
    disabled?: boolean;
    autoFocus?: boolean;
    danger?: boolean;
    busy?: boolean;
    trailing?: React.ReactNode;
}) {
    const {
        ui,
        label,
        hint,
        icon,
        onClick,
        disabled,
        autoFocus,
        danger,
        busy,
        trailing,
    } = props;

    const [hover, setHover] = useState(false);
    const [pressed, setPressed] = useState(false);
    const [focusVisible, setFocusVisible] = useState(false);

    const isDisabled = !!disabled || !!busy;

    const base: React.CSSProperties = {
        ...ui.rowBase,
        background: hover && !isDisabled ? ui.rowHoverBg : "transparent",
        color: danger
            ? "color-mix(in srgb, var(--fg) 82%, #b00020)"
            : "var(--fg)",
        cursor: isDisabled ? "default" : "pointer",
        opacity: isDisabled ? 0.56 : 1,
        borderColor: hover && !isDisabled ? ui.rowHoverBorder : "transparent",
        boxShadow: focusVisible ? ui.rowFocusRing : "none",
        transform: pressed && !isDisabled ? "scale(0.992)" : "scale(1)",
    };

    return (
        <button
            type="button"
            role="menuitem"
            disabled={isDisabled}
            autoFocus={autoFocus}
            aria-busy={busy || undefined}
            onClick={() => {
                if (isDisabled) return;
                void onClick();
            }}
            onPointerEnter={() => setHover(true)}
            onPointerLeave={() => {
                setHover(false);
                setPressed(false);
            }}
            onPointerDown={() => setPressed(true)}
            onPointerUp={() => setPressed(false)}
            onPointerCancel={() => setPressed(false)}
            onFocus={() => {
                setHover(true);
                setFocusVisible(true);
            }}
            onBlur={() => {
                setHover(false);
                setFocusVisible(false);
                setPressed(false);
            }}
            style={base}
        >
            {icon ? (
                <span
                    aria-hidden="true"
                    style={{
                        width: 18,
                        display: "grid",
                        placeItems: "center",
                        opacity: busy ? 0.68 : 0.92,
                        flex: "0 0 auto",
                    }}
                >
                    {icon}
                </span>
            ) : null}

            <div style={{ minWidth: 0, flex: 1 }}>
                <div
                    style={{
                        fontWeight: 760,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        minWidth: 0,
                    }}
                >
                    <span
                        style={{
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {label}
                    </span>

                    {busy ? (
                        <span
                            aria-hidden="true"
                            style={{
                                fontSize: 11,
                                opacity: 0.6,
                                fontWeight: 650,
                            }}
                        >
                            …
                        </span>
                    ) : null}
                </div>

                {hint ? (
                    <div
                        style={{
                            fontSize: 12,
                            opacity: 0.68,
                            marginTop: 2,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                        }}
                    >
                        {hint}
                    </div>
                ) : null}
            </div>

            {trailing ? (
                <span
                    aria-hidden="true"
                    style={{
                        display: "grid",
                        placeItems: "center",
                        opacity: 0.5,
                        flex: "0 0 auto",
                    }}
                >
                    {trailing}
                </span>
            ) : null}
        </button>
    );
}

export function AccountMenu({
                                size = "sm",
                                align = "right",
                                chrome = "standalone",
                                showLabelWhenSignedIn = false,
                                showChevron = true,
                                style,
                            }: Props) {
    const {
        loading,
        user,
        error,
        signedIn,
        refresh,
        signInWithGoogle,
        signOut,
        openAccountPage,
    } = useAuth();

    const btnRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const mountedRef = useRef(true);
    const restoreFocusOnCloseRef = useRef(true);
    const prevSignedInRef = useRef(signedIn);

    const [open, setOpen] = useState(false);
    const [pressed, setPressed] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [actionState, setActionState] = useState<MenuActionState>("idle");

    const reactId = useId();
    const triggerId = `acct-trigger-${reactId}`;
    const menuId = `acct-menu-${reactId}`;

    const reducedMotion = usePrefersReducedMotion();
    const dims = useMemo(() => getDims(size), [size]);

    const triggerTitle = formatTriggerTitle(user, signedIn);
    const showLabel = signedIn && showLabelWhenSignedIn;
    const busy = loading || actionState !== "idle";

    const close = useCallback((opts?: { restoreFocus?: boolean }) => {
        restoreFocusOnCloseRef.current = opts?.restoreFocus ?? true;
        setOpen(false);
    }, []);

    const openMenu = useCallback(() => {
        restoreFocusOnCloseRef.current = true;
        setOpen(true);
    }, []);

    const toggle = useCallback(() => {
        restoreFocusOnCloseRef.current = true;
        setOpen((v) => !v);
    }, []);

    const pos = usePopoverPosition({
        open,
        align,
        menuWidth: dims.menuWidth,
        anchorRef: btnRef,
        menuRef,
    });

    const ui = useMemo(
        () =>
            createUiStyles({
                dims,
                showLabel,
                showChevron,
                loading,
                open,
                hovered,
                pressed,
                reducedMotion,
                pos,
                chrome,
                style,
            }),
        [
            dims,
            showLabel,
            showChevron,
            loading,
            open,
            hovered,
            pressed,
            reducedMotion,
            pos,
            chrome,
            style,
        ],
    );

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (open && prevSignedInRef.current && !signedIn) {
            setOpen(false);
        }
        prevSignedInRef.current = signedIn;
    }, [signedIn, open]);

    const focusableItems = useCallback((): HTMLElement[] => {
        return Array.from(
            menuRef.current?.querySelectorAll<HTMLElement>(
                '[role="menuitem"]:not([disabled])',
            ) ?? [],
        );
    }, []);

    const focusFirstItem = useCallback(() => {
        const items = focusableItems();
        safeFocus(items[0] ?? null);
    }, [focusableItems]);

    const focusLastItem = useCallback(() => {
        const items = focusableItems();
        safeFocus(items[items.length - 1] ?? null);
    }, [focusableItems]);

    useEffect(() => {
        if (!open || typeof window === "undefined") return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                close();
            }
        };

        const onPointerDownCapture = (e: PointerEvent) => {
            const target = e.target as Node | null;
            const path = eventComposedPath(e);

            const inBtn = isWithin(target, path, btnRef.current);
            const inMenu = isWithin(target, path, menuRef.current);

            if (!inBtn && !inMenu) {
                close({ restoreFocus: false });
            }
        };

        const onFocusInCapture = (e: FocusEvent) => {
            const target = e.target as Node | null;
            const path = eventComposedPath(e);

            const inBtn = isWithin(target, path, btnRef.current);
            const inMenu = isWithin(target, path, menuRef.current);

            if (!inBtn && !inMenu) {
                close({ restoreFocus: false });
            }
        };

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("pointerdown", onPointerDownCapture, true);
        window.addEventListener("focusin", onFocusInCapture, true);

        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("pointerdown", onPointerDownCapture, true);
            window.removeEventListener("focusin", onFocusInCapture, true);
        };
    }, [open, close]);

    useEffect(() => {
        if (!open || typeof window === "undefined") return;

        const t = window.setTimeout(() => {
            const active = document.activeElement as HTMLElement | null;
            const menuContainsActive = !!(active && menuRef.current?.contains(active));
            if (!menuContainsActive) {
                focusFirstItem();
            }
        }, 0);

        return () => window.clearTimeout(t);
    }, [open, focusFirstItem]);

    useEffect(() => {
        if (!open && restoreFocusOnCloseRef.current && typeof window !== "undefined") {
            const t = window.setTimeout(() => {
                safeFocus(btnRef.current);
            }, POINTER_DOWN_FOCUS_RESTORE_DELAY_MS);

            return () => window.clearTimeout(t);
        }
        return;
    }, [open]);

    const handleMenuKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            const items = focusableItems();

            if (e.key === "Tab") {
                if (!items.length) return;

                const first = items[0] ?? null;
                const last = items[items.length - 1] ?? null;
                const active = document.activeElement as HTMLElement | null;

                if (!first || !last) return;

                if (e.shiftKey) {
                    if (active === first || !menuRef.current?.contains(active)) {
                        e.preventDefault();
                        safeFocus(last);
                    }
                } else if (active === last) {
                    e.preventDefault();
                    safeFocus(first);
                }
                return;
            }

            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                if (!items.length) return;

                const active = document.activeElement as HTMLElement | null;
                const currentIndex = active ? items.indexOf(active) : -1;
                const startIndex = currentIndex >= 0 ? currentIndex : 0;
                let nextIndex = e.key === "ArrowDown" ? startIndex + 1 : startIndex - 1;

                if (nextIndex >= items.length) nextIndex = 0;
                if (nextIndex < 0) nextIndex = items.length - 1;

                safeFocus(items[nextIndex] ?? null);
                return;
            }

            if (e.key === "Home") {
                e.preventDefault();
                focusFirstItem();
                return;
            }

            if (e.key === "End") {
                e.preventDefault();
                focusLastItem();
            }
        },
        [focusableItems, focusFirstItem, focusLastItem],
    );

    const onTriggerKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                if (!open) {
                    openMenu();
                } else {
                    focusFirstItem();
                }
                return;
            }

            if (e.key === "ArrowUp") {
                e.preventDefault();
                if (!open) {
                    openMenu();
                } else {
                    focusLastItem();
                }
                return;
            }

            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggle();
                return;
            }

            if (e.key === "Escape" && open) {
                e.preventDefault();
                close();
            }
        },
        [open, openMenu, toggle, close, focusFirstItem, focusLastItem],
    );

    const handleRefresh = useCallback(async () => {
        if (busy) return;

        setActionState("refreshing");
        try {
            await refresh();
        } finally {
            if (mountedRef.current) {
                setActionState("idle");
                close();
            }
        }
    }, [busy, refresh, close]);

    const handleOpenAccount = useCallback(async () => {
        if (busy) return;

        setActionState("opening_account");
        try {
            openAccountPage();
        } finally {
            if (mountedRef.current) {
                setActionState("idle");
                close({ restoreFocus: false });
            }
        }
    }, [busy, openAccountPage, close]);

    const handleSignOut = useCallback(async () => {
        if (busy) return;

        setActionState("signing_out");
        try {
            await signOut();
        } finally {
            if (mountedRef.current) {
                setActionState("idle");
                close();
            }
        }
    }, [busy, signOut, close]);

    const handleSignIn = useCallback(() => {
        if (busy) return;

        setActionState("signing_in");
        close({ restoreFocus: false });

        const returnTo =
            typeof window !== "undefined" ? window.location.href : undefined;

        Promise.resolve(signInWithGoogle({ returnTo })).catch(() => {
            if (mountedRef.current) {
                setActionState("idle");
            }
        });
    }, [busy, signInWithGoogle, close]);

    const menuStatusTitle = loading
        ? "Checking…"
        : signedIn
            ? user?.displayName?.trim() || "Signed in"
            : "Not signed in";

    const menuStatusSubline = loading
        ? "—"
        : signedIn
            ? user?.email?.trim() || "—"
            : "Sign in to sync";

    const sessionChipLabel = loading
        ? "Syncing"
        : signedIn
            ? "Signed in"
            : "Guest";

    const triggerText = loading ? "…" : triggerTitle;
    const triggerAriaLabel = open ? "Close account menu" : "Open account menu";

    const menu =
        open &&
        pos &&
        typeof document !== "undefined" &&
        ui.menuPanel
            ? createPortal(
                <div
                    ref={menuRef}
                    id={menuId}
                    role="menu"
                    aria-labelledby={triggerId}
                    aria-label="Account menu"
                    onKeyDown={handleMenuKeyDown}
                    style={ui.menuPanel}
                >
                    <div style={ui.menuHeader}>
                        <AvatarCircle
                            user={user}
                            sizePx={dims.avatar}
                            signedIn={signedIn}
                            ui={ui}
                        />

                        <div style={ui.menuHeaderTextWrap}>
                            <div style={ui.menuHeaderTopRow}>
                                <div style={ui.menuHeaderTitle}>{menuStatusTitle}</div>

                                <div style={ui.statusChip}>
                                    <ShieldCheck size={11} />
                                    {sessionChipLabel}
                                </div>
                            </div>

                            <div style={ui.menuHeaderSubline}>{menuStatusSubline}</div>
                        </div>
                    </div>

                    {error ? (
                        <div role="alert" style={ui.menuAlert}>
                            {error}
                        </div>
                    ) : null}

                    <MenuDivider ui={ui} />

                    {!signedIn ? (
                        <RowButton
                            ui={ui}
                            autoFocus
                            label="Continue with Google"
                            hint="Secure sign-in"
                            disabled={busy}
                            busy={actionState === "signing_in"}
                            icon={<LogIn size={16} />}
                            onClick={handleSignIn}
                            trailing={<ChevronRight size={15} />}
                        />
                    ) : (
                        <>
                            <RowButton
                                ui={ui}
                                autoFocus
                                label="Open account"
                                hint="Manage your session"
                                disabled={busy}
                                busy={actionState === "opening_account"}
                                icon={<Settings2 size={16} />}
                                onClick={handleOpenAccount}
                                trailing={<ChevronRight size={15} />}
                            />

                            <RowButton
                                ui={ui}
                                label="Refresh session"
                                hint="Re-check login state"
                                disabled={busy}
                                busy={actionState === "refreshing"}
                                icon={<RefreshCcw size={16} />}
                                onClick={handleRefresh}
                            />

                            <RowButton
                                ui={ui}
                                label="Sign out"
                                hint="End this session"
                                disabled={busy}
                                busy={actionState === "signing_out"}
                                danger
                                icon={<LogOut size={16} />}
                                onClick={handleSignOut}
                            />
                        </>
                    )}
                </div>,
                document.body,
            )
            : null;

    return (
        <>
            <button
                ref={btnRef}
                id={triggerId}
                type="button"
                aria-label={triggerAriaLabel}
                aria-haspopup="menu"
                aria-controls={open ? menuId : undefined}
                aria-expanded={open}
                title={triggerTitle}
                onKeyDown={onTriggerKeyDown}
                onClick={toggle}
                onPointerEnter={() => setHovered(true)}
                onPointerLeave={() => {
                    setHovered(false);
                    setPressed(false);
                }}
                onPointerDown={() => setPressed(true)}
                onPointerUp={() => setPressed(false)}
                onPointerCancel={() => setPressed(false)}
                onFocus={() => setHovered(true)}
                onBlur={() => {
                    setHovered(false);
                    setPressed(false);
                }}
                style={ui.trigger}
            >
                <AvatarCircle
                    user={user}
                    sizePx={dims.avatar}
                    signedIn={signedIn}
                    ui={ui}
                />

                {showLabel ? <span style={ui.triggerLabel}>{triggerText}</span> : null}

                {showChevron ? (
                    <span aria-hidden="true" style={ui.triggerChevron}>
                        <ChevronDown size={dims.chevron} />
                    </span>
                ) : null}
            </button>

            {menu}
        </>
    );
}