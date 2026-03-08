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
    LogIn,
    LogOut,
    RefreshCcw,
    Settings2,
    UserRound,
} from "lucide-react";
import { useAuth } from "./useAuth";

type Size = "sm" | "md";

export type Props = {
    size?: Size;
    showLabelWhenSignedIn?: boolean;
    align?: "left" | "right";
    style?: React.CSSProperties;
};

type PopPos = {
    top: number;
    left: number;
    width: number;
    placement: "top" | "bottom";
    transformOrigin: string;
};

type MenuActionState =
     | "idle"
     | "refreshing"
     | "signing_out"
     | "signing_in"
     | "opening_account";

const MENU_WIDTH = 272;
const MENU_GAP = 8;
const VIEWPORT_MARGIN = 12;
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

function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;

        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const onChange = (event: MediaQueryListEvent) => {
            setReduced(event.matches);
        };

        setReduced(mq.matches);
        mq.addEventListener("change", onChange);

        return () => {
            mq.removeEventListener("change", onChange);
        };
    }, []);

    return reduced;
}

function formatUserLabel(user: { displayName: string | null; email: string | null } | null): string {
    return user?.displayName?.trim() || user?.email?.trim() || "User";
}

function formatTriggerTitle(user: { displayName: string | null; email: string | null } | null): string {
    if (!user) return "Sign in";
    return user.displayName?.trim() || user.email?.trim() || "Account";
}

function initialsFromUser(user: { displayName: string | null; email: string | null } | null): string {
    const base = formatUserLabel(user).trim();
    if (!base) return "U";

    const emailName = base.includes("@") ? base.split("@")[0] ?? base : base;
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
        const mw = menuWidth;
        const mh = menuRef.current?.getBoundingClientRect().height ?? 0;

        const left =
             align === "right"
                  ? clamp(r.right - mw, VIEWPORT_MARGIN, window.innerWidth - mw - VIEWPORT_MARGIN)
                  : clamp(r.left, VIEWPORT_MARGIN, window.innerWidth - mw - VIEWPORT_MARGIN);

        const belowTop = r.bottom + MENU_GAP;
        const aboveTop = r.top - MENU_GAP - mh;

        const canFitBelow = belowTop + mh <= window.innerHeight - VIEWPORT_MARGIN;
        const canFitAbove = aboveTop >= VIEWPORT_MARGIN;

        const placement: PopPos["placement"] = !canFitBelow && canFitAbove ? "top" : "bottom";
        const unclampedTop = placement === "top" ? aboveTop : belowTop;
        const top = clamp(
             unclampedTop,
             VIEWPORT_MARGIN,
             Math.max(VIEWPORT_MARGIN, window.innerHeight - mh - VIEWPORT_MARGIN),
        );

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

        const onScroll = () => schedule();
        const onResize = () => schedule();

        window.addEventListener("resize", onResize);
        window.addEventListener("scroll", onScroll, true);

        const t = window.setTimeout(() => schedule(), 0);

        let ro: ResizeObserver | null = null;
        if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(() => schedule());
            if (menuRef.current) ro.observe(menuRef.current);
            if (anchorRef.current) ro.observe(anchorRef.current);
        }

        return () => {
            window.clearTimeout(t);
            window.removeEventListener("resize", onResize);
            window.removeEventListener("scroll", onScroll, true);

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
    user: { displayName: string | null; email: string | null } | null;
    sizePx: number;
    signedIn: boolean;
}) {
    const { user, sizePx, signedIn } = props;

    const ring = "0 0 0 1px color-mix(in srgb, var(--border) 72%, transparent)";
    const bg =
         "linear-gradient(180deg, color-mix(in srgb, var(--card) 92%, white), color-mix(in srgb, var(--card) 98%, transparent))";

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
                      flex: "0 0 auto",
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
                  flex: "0 0 auto",
              }}
         >
             {initialsFromUser(user)}
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
    busy?: boolean;
}) {
    const { label, hint, icon, onClick, disabled, autoFocus, danger, busy } = props;
    const [hover, setHover] = useState(false);

    const isDisabled = !!disabled || !!busy;

    const base: React.CSSProperties = {
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 10px",
        borderRadius: 12,
        border: "1px solid transparent",
        background: "transparent",
        color: danger ? "color-mix(in srgb, var(--fg) 82%, #b00020)" : "var(--fg)",
        cursor: isDisabled ? "default" : "pointer",
        textAlign: "left",
        fontSize: 13,
        lineHeight: 1.2,
        opacity: isDisabled ? 0.58 : 1,
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
        outline: "none",
        transition: "all 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
    };

    const hoverStyle: React.CSSProperties = isDisabled
         ? {}
         : {
             background: "color-mix(in srgb, var(--activeBg) 70%, transparent)",
             borderColor: "color-mix(in srgb, var(--border) 60%, transparent)",
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
              onPointerLeave={() => setHover(false)}
              onFocus={() => setHover(true)}
              onBlur={() => setHover(false)}
              style={{ ...base, ...(hover ? hoverStyle : null) }}
         >
             {icon ? (
                  <span
                       aria-hidden="true"
                       style={{
                           width: 18,
                           display: "grid",
                           placeItems: "center",
                           opacity: 0.95,
                           flex: "0 0 auto",
                       }}
                  >
                    {icon}
                </span>
             ) : null}

             <div style={{ minWidth: 0, flex: 1 }}>
                 <div style={{ fontWeight: 780 }}>{label}</div>
                 {hint ? <div style={{ fontSize: 12, opacity: 0.78, marginTop: 2 }}>{hint}</div> : null}
             </div>
         </button>
    );
}

export function AccountMenu({
                                size = "sm",
                                align = "right",
                                showLabelWhenSignedIn = false,
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

    const [open, setOpen] = useState(false);
    const [pressed, setPressed] = useState(false);
    const [actionState, setActionState] = useState<MenuActionState>("idle");

    const reactId = useId();
    const triggerId = `acct-trigger-${reactId}`;
    const menuId = `acct-menu-${reactId}`;

    const reducedMotion = usePrefersReducedMotion();

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!signedIn && open) {
            setOpen(false);
        }
    }, [signedIn, open]);

    const dims = useMemo(() => {
        if (size === "md") {
            return { btn: 38, avatar: 28, labelMax: 220, chevron: 16 };
        }
        return { btn: 32, avatar: 24, labelMax: 160, chevron: 14 };
    }, [size]);

    const triggerTitle = formatTriggerTitle(user);
    const showLabel = signedIn && showLabelWhenSignedIn;

    const close = useCallback((opts?: { restoreFocus?: boolean }) => {
        restoreFocusOnCloseRef.current = opts?.restoreFocus ?? true;
        setOpen(false);
    }, []);

    const openMenu = useCallback(() => {
        setOpen(true);
    }, []);

    const toggle = useCallback(() => {
        restoreFocusOnCloseRef.current = true;
        setOpen((v) => !v);
    }, []);

    const anchorStyle = useMemo<React.CSSProperties>(() => {
        const ringIdle = "0 0 0 1px color-mix(in srgb, var(--border) 62%, transparent)";
        const ringOpen = "0 0 0 1px color-mix(in srgb, var(--border) 78%, transparent)";
        const shadowIdle = "0 8px 18px color-mix(in srgb, black 12%, transparent)";
        const shadowOpen = "0 14px 34px color-mix(in srgb, black 18%, transparent)";

        return {
            height: dims.btn,
            minWidth: dims.btn,
            maxWidth: showLabel ? dims.labelMax + dims.avatar + 30 : dims.btn,
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
    }, [dims, open, pressed, showLabel, style]);

    const pos = usePopoverPosition({
        open,
        align,
        menuWidth: MENU_WIDTH,
        anchorRef: btnRef,
        menuRef,
    });

    const focusableItems = useCallback((): HTMLElement[] => {
        return Array.from(
             menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
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
            focusFirstItem();
        }, 0);
        return () => window.clearTimeout(t);
    }, [open, focusFirstItem]);

    useEffect(() => {
        if (!open && restoreFocusOnCloseRef.current) {
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

                 const first = items[0]!;
                 const last = items[items.length - 1]!;
                 const active = document.activeElement as HTMLElement | null;

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
        setActionState("refreshing");
        try {
            await refresh();
        } finally {
            if (mountedRef.current) {
                setActionState("idle");
                close();
            }
        }
    }, [refresh, close]);

    const handleOpenAccount = useCallback(async () => {
        setActionState("opening_account");
        try {
            openAccountPage();
        } finally {
            if (mountedRef.current) {
                setActionState("idle");
                close({ restoreFocus: false });
            }
        }
    }, [openAccountPage, close]);

    const handleSignOut = useCallback(async () => {
        setActionState("signing_out");
        try {
            await signOut();
        } finally {
            if (mountedRef.current) {
                setActionState("idle");
                close();
            }
        }
    }, [signOut, close]);

    const handleSignIn = useCallback(() => {
        setActionState("signing_in");
        close({ restoreFocus: false });

        try {
            const returnTo = typeof window !== "undefined" ? window.location.href : undefined;
            signInWithGoogle({ returnTo });
        } catch {
            if (mountedRef.current) {
                setActionState("idle");
            }
        }
    }, [signInWithGoogle, close]);

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

    const triggerText = loading ? "…" : triggerTitle;

    const menu =
         open && pos && typeof document !== "undefined"
              ? createPortal(
                   <>
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
                                zIndex: MENU_Z_INDEX,
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
                           <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "6px 6px 8px 6px",
                                }}
                           >
                               <AvatarCircle user={user} sizePx={dims.avatar} signedIn={signedIn} />

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
                                       {menuStatusTitle}
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
                                       {menuStatusSubline}
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
                                         background:
                                              "color-mix(in srgb, var(--activeBg) 50%, transparent)",
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
                                     busy={actionState === "signing_in"}
                                     icon={<LogIn size={16} />}
                                     onClick={handleSignIn}
                                />
                           ) : (
                                <>
                                    <RowButton
                                         autoFocus
                                         label="Account"
                                         hint="Manage your session"
                                         disabled={loading}
                                         busy={actionState === "opening_account"}
                                         icon={<Settings2 size={16} />}
                                         onClick={handleOpenAccount}
                                    />

                                    <RowButton
                                         label="Refresh session"
                                         hint="Re-check login state"
                                         disabled={loading}
                                         busy={actionState === "refreshing"}
                                         icon={<RefreshCcw size={16} />}
                                         onClick={handleRefresh}
                                    />

                                    <RowButton
                                         label="Sign out"
                                         hint="End this session"
                                         disabled={loading}
                                         busy={actionState === "signing_out"}
                                         danger
                                         icon={<LogOut size={16} />}
                                         onClick={handleSignOut}
                                    />
                                </>
                           )}
                       </div>
                   </>,
                   document.body,
              )
              : null;

    return (
         <>
             <button
                  ref={btnRef}
                  id={triggerId}
                  type="button"
                  aria-haspopup="menu"
                  aria-controls={open ? menuId : undefined}
                  aria-expanded={open}
                  title={triggerTitle}
                  onKeyDown={onTriggerKeyDown}
                  onClick={toggle}
                  onPointerDown={() => setPressed(true)}
                  onPointerUp={() => setPressed(false)}
                  onPointerCancel={() => setPressed(false)}
                  onPointerLeave={() => setPressed(false)}
                  style={anchorStyle}
             >
                 <AvatarCircle user={user} sizePx={dims.avatar} signedIn={signedIn} />

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
                            {triggerText}
                        </span>

                          <span
                               aria-hidden="true"
                               style={{
                                   display: "grid",
                                   placeItems: "center",
                                   opacity: 0.7,
                                   marginLeft: -2,
                                   flex: "0 0 auto",
                                   transform: open ? "rotate(180deg)" : "rotate(0deg)",
                                   transition: reducedMotion ? undefined : "transform 0.16s ease",
                               }}
                          >
                            <ChevronDown size={dims.chevron} />
                        </span>
                      </>
                 ) : null}
             </button>

             {menu}
         </>
    );
}