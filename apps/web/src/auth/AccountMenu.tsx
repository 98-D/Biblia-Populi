// apps/web/src/auth/AccountMenu.tsx
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
import { LogIn, LogOut, RefreshCcw, UserRound, ChevronDown } from "lucide-react";
import { useAuth } from "./useAuth";

type Size = "sm" | "md";

export type Props = {
    size?: Size;

    /**
     * Default: false (toolbar mode) — icon-only trigger.
     * If true, shows a compact label next to the avatar when signed in.
     */
    showLabelWhenSignedIn?: boolean;

    align?: "left" | "right";
    style?: React.CSSProperties;
};

// Safe layout effect for SSR compatibility
const useIsomorphicLayoutEffect =
    typeof window !== "undefined" ? useLayoutEffect : useEffect;

function initials(nameOrEmail: string): string {
    const s = String(nameOrEmail ?? "").trim();
    if (!s) return "U";
    const parts = s.split(/\s+/g).filter(Boolean);
    if (parts.length >= 2) return (parts[0]![0] + parts[1]![0]).toUpperCase();
    return s.slice(0, 2).toUpperCase();
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

type PopPos = {
    top: number;
    left: number;
    width: number;
    placement: "top" | "bottom";
    transformOrigin: string;
};

function safeFocus(el: HTMLElement | null | undefined) {
    if (!el) return;
    try {
        el.focus({ preventScroll: true } as FocusOptions);
    } catch {
        el.focus();
    }
}

function prefersReducedMotion(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    } catch {
        return false;
    }
}

function usePopoverPosition(args: {
    open: boolean;
    align: "left" | "right";
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

        const r = anchor.getBoundingClientRect();
        const gap = 8;
        const margin = 12;

        const mw = menuWidth;
        const mh = menuRef.current?.getBoundingClientRect().height ?? 0;

        const left =
            align === "right"
                ? clamp(r.right - mw, margin, window.innerWidth - mw - margin)
                : clamp(r.left, margin, window.innerWidth - mw - margin);

        const belowTop = r.bottom + gap;
        const aboveTop = r.top - gap - mh;

        const canFitBelow = belowTop + mh <= window.innerHeight - margin;
        const canFitAbove = aboveTop >= margin;

        const placement: PopPos["placement"] =
            !canFitBelow && canFitAbove ? "top" : "bottom";

        const top =
            placement === "top"
                ? aboveTop
                : clamp(belowTop, margin, window.innerHeight - margin);

        const originX = align === "right" ? "right" : "left";
        const originY = placement === "top" ? "bottom" : "top";

        setPos({
            top,
            left,
            width: mw,
            placement,
            transformOrigin: `${originY} ${originX}`,
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

        const onScroll = () => schedule();
        const onResize = () => schedule();

        window.addEventListener("resize", onResize);
        window.addEventListener("scroll", onScroll, true);

        const t = window.setTimeout(() => schedule(), 0);

        let ro: ResizeObserver | null = null;
        if (typeof ResizeObserver !== "undefined" && menuRef.current) {
            ro = new ResizeObserver(() => schedule());
            ro.observe(menuRef.current);
        }

        return () => {
            window.clearTimeout(t);
            window.removeEventListener("resize", onResize);
            window.removeEventListener("scroll", onScroll, true);
            if (rafRef.current != null) {
                window.cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            if (ro) ro.disconnect();
        };
    }, [open, compute, schedule, menuRef]);

    return pos;
}

/* --------------------------------- UI bits -------------------------------- */

function AvatarCircle(props: {
    userLabel: string;
    pictureUrl?: string | null;
    sizePx: number;
    signedIn: boolean;
}) {
    const { userLabel, pictureUrl, sizePx, signedIn } = props;
    const [imgError, setImgError] = useState(false);

    const ring = "0 0 0 1px color-mix(in srgb, var(--border) 72%, transparent)";
    const bg =
        "linear-gradient(180deg, color-mix(in srgb, var(--card) 92%, white), color-mix(in srgb, var(--card) 98%, transparent))";

    if (pictureUrl && !imgError) {
        return (
            <img
                src={pictureUrl}
                alt={`${userLabel}'s avatar`}
                draggable={false}
                onError={() => setImgError(true)}
                style={{
                    width: sizePx,
                    height: sizePx,
                    borderRadius: 999,
                    objectFit: "cover",
                    boxShadow: ring,
                    userSelect: "none",
                    display: "block",
                }}
            />
        );
    }

    if (!signedIn) {
        return (
            <div
                aria-hidden="true"
                style={{
                    width: sizePx,
                    height: sizePx,
                    borderRadius: 999,
                    display: "grid",
                    placeItems: "center",
                    background: bg,
                    boxShadow: ring,
                }}
            >
                <UserRound size={Math.max(16, Math.floor(sizePx * 0.62))} />
            </div>
        );
    }

    return (
        <div
            aria-hidden="true"
            style={{
                width: sizePx,
                height: sizePx,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                fontSize: Math.max(11, Math.floor(sizePx * 0.46)),
                fontWeight: 800,
                letterSpacing: "0.04em",
                color: "var(--fg)",
                background: bg,
                boxShadow: ring,
                userSelect: "none",
            }}
        >
            {initials(userLabel)}
        </div>
    );
}

function RowButton(props: {
    label: string;
    hint?: string;
    icon?: React.ReactNode;
    onClick: () => void | Promise<void>;
    disabled?: boolean;
    autoFocus?: boolean;
    danger?: boolean;
}) {
    const [hover, setHover] = useState(false);

    const base: React.CSSProperties = {
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 10px",
        borderRadius: 12,
        border: "1px solid transparent",
        background: "transparent",
        color: props.danger ? "color-mix(in srgb, var(--fg) 82%, #b00020)" : "var(--fg)",
        cursor: props.disabled ? "default" : "pointer",
        textAlign: "left",
        fontSize: 13,
        lineHeight: 1.2,
        opacity: props.disabled ? 0.55 : 1,
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
        outline: "none",
        transition: "all 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
    };

    const hoverStyle: React.CSSProperties = props.disabled
        ? {}
        : {
            background: "color-mix(in srgb, var(--activeBg) 70%, transparent)",
            borderColor: "color-mix(in srgb, var(--border) 60%, transparent)",
        };

    return (
        <button
            type="button"
            role="menuitem"
            disabled={props.disabled}
            autoFocus={props.autoFocus}
            onClick={() => {
                if (props.disabled) return;
                void props.onClick();
            }}
            onPointerEnter={() => setHover(true)}
            onPointerLeave={() => setHover(false)}
            onFocus={() => setHover(true)}
            onBlur={() => setHover(false)}
            style={{ ...base, ...(hover ? hoverStyle : null) }}
        >
            {props.icon ? (
                <span
                    aria-hidden="true"
                    style={{
                        width: 18,
                        display: "grid",
                        placeItems: "center",
                        opacity: 0.95,
                    }}
                >
          {props.icon}
        </span>
            ) : null}

            <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 780 }}>{props.label}</div>
                {props.hint ? (
                    <div style={{ fontSize: 12, opacity: 0.78, marginTop: 2 }}>{props.hint}</div>
                ) : null}
            </div>
        </button>
    );
}

/* --------------------------------- Component -------------------------------- */

export function AccountMenu({
                                size = "sm",
                                align = "right",
                                showLabelWhenSignedIn = false,
                                style,
                            }: Props) {
    const { loading, user, error, refresh, signInWithGoogle, signOut } = useAuth();

    const btnRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const wasOpen = useRef(false);

    const [open, setOpen] = useState(false);
    const [pressed, setPressed] = useState(false);

    const reactId = useId();
    const triggerId = `acct-trigger-${reactId}`;
    const menuId = `acct-menu-${reactId}`;

    const dims = useMemo(() => {
        if (size === "md") return { btn: 38, avatar: 28, labelMax: 220, chevron: 16 };
        return { btn: 32, avatar: 24, labelMax: 160, chevron: 14 };
    }, [size]);

    const signedIn = !!user;
    const userLabel = user?.name || user?.email || "User";

    const close = useCallback(() => setOpen(false), []);
    const openMenu = useCallback(() => setOpen(true), []);
    const toggle = useCallback(() => setOpen((v) => !v), []);

    const anchorStyle = useMemo<React.CSSProperties>(() => {
        const ringIdle = "0 0 0 1px color-mix(in srgb, var(--border) 62%, transparent)";
        const ringOpen = "0 0 0 1px color-mix(in srgb, var(--border) 78%, transparent)";
        const shadowIdle = "0 8px 18px color-mix(in srgb, black 12%, transparent)";
        const shadowOpen = "0 14px 34px color-mix(in srgb, black 18%, transparent)";

        const showLabel = showLabelWhenSignedIn && signedIn;

        return {
            height: dims.btn,
            minWidth: dims.btn,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: showLabel ? 8 : 0,
            padding: showLabel ? "0 8px 0 4px" : 0,
            borderRadius: 999,
            border: "1px solid transparent",
            background: "transparent",
            color: "var(--fg)",
            boxShadow: open ? `${ringOpen}, ${shadowOpen}` : `${ringIdle}, ${shadowIdle}`,
            cursor: "pointer",
            userSelect: "none",
            WebkitTapHighlightColor: "transparent",
            transition:
                "box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.08s ease-out, background 0.15s ease-out",
            touchAction: "manipulation",
            transform: pressed ? "scale(0.965)" : "scale(1)",
            backgroundImage: open
                ? "linear-gradient(180deg, color-mix(in srgb, var(--card) 62%, transparent), transparent)"
                : "none",
            ...style,
        };
    }, [dims.btn, open, pressed, showLabelWhenSignedIn, signedIn, style]);

    const pos = usePopoverPosition({
        open,
        align,
        menuWidth: 264,
        anchorRef: btnRef,
        menuRef,
    });

    const focusFirstItem = useCallback(() => {
        const items = Array.from(
            menuRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || [],
        ) as HTMLElement[];
        safeFocus(items[0] ?? null);
    }, []);

    const focusLastItem = useCallback(() => {
        const items = Array.from(
            menuRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || [],
        ) as HTMLElement[];
        safeFocus(items[items.length - 1] ?? null);
    }, []);

    // Close on outside click / escape / focus leaving
    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                close();
            }
        };

        const onPointerDownCapture = (e: PointerEvent) => {
            const t = e.target as Node | null;
            if (!t || !btnRef.current || !menuRef.current) return;

            const inBtn = btnRef.current.contains(t);
            const inMenu = menuRef.current.contains(t);
            if (!inBtn && !inMenu) close();
        };

        const onFocusInCapture = (e: FocusEvent) => {
            const t = e.target as Node | null;
            if (!t || !btnRef.current || !menuRef.current) return;

            const inBtn = btnRef.current.contains(t);
            const inMenu = menuRef.current.contains(t);
            if (!inBtn && !inMenu) close();
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

    // Return focus to trigger on close
    useEffect(() => {
        if (wasOpen.current && !open) safeFocus(btnRef.current);
        wasOpen.current = open;
    }, [open]);

    // When opening, nudge focus into the menu after it's mounted
    useEffect(() => {
        if (!open) return;
        const t = window.setTimeout(() => focusFirstItem(), 0);
        return () => window.clearTimeout(t);
    }, [open, focusFirstItem]);

    // Keyboard navigation inside the menu (roving focus + wrap)
    const handleMenuKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Tab") {
            const items = Array.from(
                menuRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || [],
            ) as HTMLElement[];
            if (!items.length) return;

            const first = items[0]!;
            const last = items[items.length - 1]!;
            const active = document.activeElement as HTMLElement | null;

            if (e.shiftKey) {
                if (active === first || !menuRef.current?.contains(active)) {
                    e.preventDefault();
                    safeFocus(last);
                }
            } else {
                if (active === last) {
                    e.preventDefault();
                    safeFocus(first);
                }
            }
            return;
        }

        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const items = Array.from(
                menuRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || [],
            ) as HTMLElement[];
            if (!items.length) return;

            const index = items.indexOf(document.activeElement as HTMLElement);
            let nextIndex = e.key === "ArrowDown" ? index + 1 : index - 1;
            if (nextIndex >= items.length) nextIndex = 0;
            if (nextIndex < 0) nextIndex = items.length - 1;
            safeFocus(items[nextIndex]);
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
            return;
        }
    };

    const onTriggerKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) openMenu();
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
            return;
        }
    };

    const reducedMotion = useMemo(() => prefersReducedMotion(), []);

    const Menu =
        open && pos
            ? createPortal(
                <>
                    {/* Keep keyframes injected once per mount; respects reduced motion */}
                    <style>{`
              @keyframes acctScaleFadeIn {
                from { opacity: 0; transform: translateY(-2px) scale(0.985); }
                to { opacity: 1; transform: translateY(0) scale(1); }
              }
            `}</style>

                    <div
                        ref={menuRef}
                        id={menuId}
                        role="menu"
                        aria-labelledby={triggerId}
                        aria-label="Account menu"
                        onKeyDown={handleMenuKeyDown}
                        style={{
                            position: "fixed",
                            top: pos.top,
                            left: pos.left,
                            width: pos.width,
                            zIndex: 100,
                            borderRadius: 14,
                            border: "1px solid color-mix(in srgb, var(--border) 78%, transparent)",
                            background:
                                "linear-gradient(180deg, color-mix(in srgb, var(--card) 92%, white), color-mix(in srgb, var(--card) 98%, transparent))",
                            boxShadow: "0 18px 60px color-mix(in srgb, black 22%, transparent)",
                            backdropFilter: "blur(10px)",
                            WebkitBackdropFilter: "blur(10px)",
                            padding: 10,
                            transformOrigin: pos.transformOrigin,
                            animation: reducedMotion
                                ? undefined
                                : "acctScaleFadeIn 0.14s cubic-bezier(0.16, 1, 0.3, 1) forwards",
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 6px 8px 6px" }}>
                            <AvatarCircle
                                userLabel={userLabel}
                                pictureUrl={user?.pictureUrl}
                                sizePx={dims.avatar}
                                signedIn={signedIn}
                            />

                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div
                                    style={{
                                        fontWeight: 820,
                                        fontSize: 13,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        opacity: loading ? 0.75 : 1,
                                    }}
                                >
                                    {loading ? "Checking…" : signedIn ? user?.name || "Signed in" : "Not signed in"}
                                </div>

                                <div
                                    style={{
                                        fontSize: 12,
                                        opacity: 0.78,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}
                                >
                                    {loading ? "—" : signedIn ? user?.email || "—" : "Sign in to sync"}
                                </div>
                            </div>
                        </div>

                        {error ? (
                            <div
                                role="alert"
                                style={{
                                    margin: "0 6px 8px",
                                    padding: "7px 9px",
                                    borderRadius: 12,
                                    border: "1px solid color-mix(in srgb, var(--border) 70%, transparent)",
                                    background: "color-mix(in srgb, var(--activeBg) 50%, transparent)",
                                    fontSize: 12,
                                    opacity: 0.9,
                                }}
                            >
                                {error}
                            </div>
                        ) : null}

                        <div
                            style={{
                                height: 1,
                                background: "color-mix(in srgb, var(--border) 70%, transparent)",
                                margin: "6px 0 8px",
                            }}
                        />

                        {!signedIn ? (
                            <RowButton
                                autoFocus
                                label="Continue with Google"
                                hint="Secure sign-in"
                                disabled={loading}
                                icon={<LogIn size={16} />}
                                onClick={() => {
                                    close();
                                    // Always fire-and-forget; OAuth will navigate away.
                                    try {
                                        signInWithGoogle({ returnTo: window.location.href });
                                    } catch {
                                        /* no-op */
                                    }
                                }}
                            />
                        ) : (
                            <>
                                <RowButton
                                    autoFocus
                                    label="Refresh session"
                                    hint="Re-check login state"
                                    disabled={loading}
                                    icon={<RefreshCcw size={16} />}
                                    onClick={async () => {
                                        try {
                                            await refresh();
                                        } finally {
                                            close();
                                        }
                                    }}
                                />

                                <RowButton
                                    label="Sign out"
                                    hint="End this session"
                                    disabled={loading}
                                    danger
                                    icon={<LogOut size={16} />}
                                    onClick={async () => {
                                        try {
                                            await signOut();
                                        } finally {
                                            close();
                                        }
                                    }}
                                />
                            </>
                        )}
                    </div>
                </>,
                document.body,
            )
            : null;

    const showLabel = signedIn && showLabelWhenSignedIn;

    return (
        <>
            <button
                ref={btnRef}
                id={triggerId}
                type="button"
                aria-haspopup="menu"
                aria-controls={open ? menuId : undefined}
                aria-expanded={open}
                title={signedIn ? user?.name || user?.email || "Account" : "Sign in"}
                onKeyDown={onTriggerKeyDown}
                onClick={toggle}
                onPointerDown={() => setPressed(true)}
                onPointerUp={() => setPressed(false)}
                onPointerCancel={() => setPressed(false)}
                onPointerLeave={() => setPressed(false)}
                style={anchorStyle}
            >
                <AvatarCircle userLabel={userLabel} pictureUrl={user?.pictureUrl} sizePx={dims.avatar} signedIn={signedIn} />

                {showLabel ? (
                    <>
            <span
                style={{
                    fontSize: 13,
                    fontWeight: 780,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: dims.labelMax,
                    opacity: loading ? 0.7 : 1,
                    paddingRight: 0,
                }}
            >
              {loading ? "…" : user?.name || user?.email || "Account"}
            </span>

                        {/* tiny chevron gives “menu” affordance without clutter */}
                        <span
                            aria-hidden="true"
                            style={{
                                display: "grid",
                                placeItems: "center",
                                opacity: 0.7,
                                marginLeft: -2,
                            }}
                        >
              <ChevronDown size={dims.chevron} />
            </span>
                    </>
                ) : null}
            </button>

            {Menu}
        </>
    );
}