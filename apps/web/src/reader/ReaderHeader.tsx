// apps/web/src/reader/ReaderHeader.tsx
import React, { memo, useCallback, useMemo, useState } from "react";
import type { CSSProperties, PointerEventHandler, ReactNode } from "react";
import type { BookRow } from "../api";
import { PositionPill } from "../PositionPill";
import { ThemeToggleSwitch } from "../theme";
import { AccountMenu } from "../auth/AccountMenu";
import { sx } from "./sx";
import { ReaderTypographyControl } from "./ReaderTypographyControl";
import { Home } from "lucide-react";

type CurrentPos = Readonly<{
    label: string;
    ord: number;
    bookId: string | null;
    chapter: number | null;
    verse: number | null;
}>;

type Props = Readonly<{
    styles: Record<string, React.CSSProperties>;
    books: BookRow[] | null;

    onBackHome: () => void;

    current: CurrentPos;
    onJumpRef: (bookId: string, chapter: number, verse: number | null) => void;

    // retained for API compatibility
    onNavigate: (loc: { bookId: string; chapter: number; verse?: number }) => void;

    // retained for API compatibility
    mode?: "light" | "dark";
    onToggleTheme?: () => void;
}>;

type DockProps = Readonly<{
    children: ReactNode;
    title?: string;
    ariaLabel?: string;
    pad?: number;
    minHeight?: number;
}>;

// @ts-ignore
const TOKENS = Object.freeze({
    topGap: 8,
    groupGap: 8,
    subtleGap: 6,

    dockRadius: 999,
    dockMinHeight: 38,
    dockPad: 3,
    dockBorder: "1px solid color-mix(in srgb, var(--border) 62%, transparent)",
    dockBg: "color-mix(in srgb, var(--bg) 86%, var(--panel))",
    dockShadow: "0 8px 18px rgba(0,0,0,0.045)",
    dockBlur: "blur(10px)",

    iconBtnSize: 32,
    iconBtnRadius: 999,
    iconBtnHoverBg: "color-mix(in srgb, var(--activeBg) 58%, transparent)",
    iconBtnDownBg: "color-mix(in srgb, var(--activeBg) 76%, transparent)",
    iconBtnRing: "inset 0 0 0 1px color-mix(in srgb, var(--border) 58%, transparent)",
    iconBtnTransition:
        "transform 120ms ease, background 140ms ease, border-color 140ms ease, opacity 140ms ease, box-shadow 140ms ease",

    dividerColor: "color-mix(in srgb, var(--border) 68%, transparent)",
    dividerHeight: 20,
    dividerWidth: 1,

    centerMaxWidth: 520,
    centerMinWidth: 0,
}) as const;

function releasePointerCaptureSafe(target: EventTarget | null, pointerId: number): void {
    if (typeof Element === "undefined" || !(target instanceof Element)) return;

    const el = target as Element & {
        releasePointerCapture?: (id: number) => void;
        hasPointerCapture?: (id: number) => boolean;
    };

    try {
        if (typeof el.hasPointerCapture === "function") {
            if (el.hasPointerCapture(pointerId) && typeof el.releasePointerCapture === "function") {
                el.releasePointerCapture(pointerId);
            }
            return;
        }

        if (typeof el.releasePointerCapture === "function") {
            el.releasePointerCapture(pointerId);
        }
    } catch {
        // ignore
    }
}

const ui = {
    headerRoot: Object.freeze<CSSProperties>({
        ...sx.topBar,
        display: "grid",
        gridTemplateColumns: "auto minmax(0, 1fr) auto",
        alignItems: "center",
        columnGap: TOKENS.topGap,
        rowGap: TOKENS.topGap,
        minWidth: 0,
    }),

    leftSlot: Object.freeze<CSSProperties>({
        ...sx.topLeft,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        minWidth: 0,
    }),

    centerSlot: Object.freeze<CSSProperties>({
        ...sx.topCenter,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: TOKENS.centerMinWidth,
        width: "100%",
    }),

    rightSlot: Object.freeze<CSSProperties>({
        ...sx.topRight,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        minWidth: 0,
    }),

    headerGroup: Object.freeze<CSSProperties>({
        display: "flex",
        alignItems: "center",
        gap: TOKENS.groupGap,
        minWidth: 0,
        flexWrap: "nowrap",
    }),

    centerOuter: Object.freeze<CSSProperties>({
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        minWidth: 0,
    }),

    centerInner: Object.freeze<CSSProperties>({
        width: "min(100%, 520px)",
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    }),

    rightCluster: Object.freeze<CSSProperties>({
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: TOKENS.groupGap,
        minWidth: 0,
        flexWrap: "nowrap",
    }),

    divider: Object.freeze<CSSProperties>({
        width: TOKENS.dividerWidth,
        height: TOKENS.dividerHeight,
        background: TOKENS.dividerColor,
        opacity: 0.78,
        marginInline: 1,
        flex: "0 0 auto",
    }),
} as const;

const Dock = memo(function Dock(props: DockProps) {
    const {
        children,
        title,
        ariaLabel,
        pad = TOKENS.dockPad,
        minHeight = TOKENS.dockMinHeight,
    } = props;

    const style = useMemo<CSSProperties>(
        () => ({
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 0,
            minHeight,
            padding: pad,
            borderRadius: TOKENS.dockRadius,
            background: TOKENS.dockBg,
            border: TOKENS.dockBorder,
            boxShadow: TOKENS.dockShadow,
            backdropFilter: TOKENS.dockBlur,
            WebkitBackdropFilter: TOKENS.dockBlur,
            boxSizing: "border-box",
        }),
        [minHeight, pad],
    );

    return (
        <div style={style} title={title} aria-label={ariaLabel}>
            {children}
        </div>
    );
});

const HeaderGroup = memo(function HeaderGroup(props: {
    children: ReactNode;
    ariaLabel?: string;
    gap?: number;
}) {
    const { children, ariaLabel, gap = TOKENS.groupGap } = props;

    const style = useMemo<CSSProperties>(
        () => ({
            ...ui.headerGroup,
            gap,
        }),
        [gap],
    );

    return (
        <div style={style} aria-label={ariaLabel}>
            {children}
        </div>
    );
});

const Divider = memo(function Divider() {
    return <div aria-hidden style={ui.divider} />;
});

type IconDockButtonProps = Readonly<{
    ariaLabel: string;
    title: string;
    onClick: () => void;
    icon: ReactNode;
    pressed?: boolean;
}>;

const IconDockButton = memo(function IconDockButton(props: IconDockButtonProps) {
    const { ariaLabel, title, onClick, icon, pressed = false } = props;

    const [hover, setHover] = useState(false);
    const [down, setDown] = useState(false);
    const active = pressed || down;

    const style = useMemo<CSSProperties>(
        () => ({
            appearance: "none",
            WebkitAppearance: "none",
            width: TOKENS.iconBtnSize,
            height: TOKENS.iconBtnSize,
            minWidth: TOKENS.iconBtnSize,
            minHeight: TOKENS.iconBtnSize,
            border: "1px solid transparent",
            borderRadius: TOKENS.iconBtnRadius,
            background: active
                ? TOKENS.iconBtnDownBg
                : hover
                    ? TOKENS.iconBtnHoverBg
                    : "transparent",
            color: "var(--fg)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transform: down ? "scale(0.97)" : "scale(1)",
            transition: TOKENS.iconBtnTransition,
            WebkitTapHighlightColor: "transparent",
            outline: "none",
            boxShadow: hover || active ? TOKENS.iconBtnRing : "none",
            flex: "0 0 auto",
        }),
        [active, down, hover],
    );

    const onPointerEnter = useCallback<PointerEventHandler<HTMLButtonElement>>((e) => {
        if (e.pointerType === "touch") return;
        setHover(true);
    }, []);

    const onPointerLeave = useCallback<PointerEventHandler<HTMLButtonElement>>((e) => {
        if (e.pointerType === "touch") return;
        setHover(false);
        setDown(false);
        releasePointerCaptureSafe(e.currentTarget, e.pointerId);
    }, []);

    const onPointerDown = useCallback<PointerEventHandler<HTMLButtonElement>>((e) => {
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            // ignore
        }
        setDown(true);
    }, []);

    const onPointerUp = useCallback<PointerEventHandler<HTMLButtonElement>>((e) => {
        releasePointerCaptureSafe(e.currentTarget, e.pointerId);
        setDown(false);
    }, []);

    const onPointerCancel = useCallback<PointerEventHandler<HTMLButtonElement>>((e) => {
        releasePointerCaptureSafe(e.currentTarget, e.pointerId);
        setDown(false);
    }, []);

    return (
        <button
            type="button"
            aria-label={ariaLabel}
            title={title}
            onClick={onClick}
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            style={style}
        >
            {icon}
        </button>
    );
});

const HomeDock = memo(function HomeDock(props: { onBackHome: () => void }) {
    return (
        <Dock title="Home" ariaLabel="Home">
            <IconDockButton
                ariaLabel="Home"
                title="Home"
                onClick={props.onBackHome}
                icon={<Home size={17} aria-hidden />}
            />
        </Dock>
    );
});

const AccountDock = memo(function AccountDock() {
    return (
        <Dock title="Account" ariaLabel="Account" pad={2}>
            <AccountMenu
                size="sm"
                align="left"
                chrome="docked"
                showChevron
                showLabelWhenSignedIn={false}
            />
        </Dock>
    );
});

const TypographyDock = memo(function TypographyDock() {
    return (
        <Dock title="Typography" ariaLabel="Typography">
            <ReaderTypographyControl />
        </Dock>
    );
});

const ThemeDock = memo(function ThemeDock() {
    return (
        <Dock title="Theme" ariaLabel="Theme">
            <ThemeToggleSwitch size="sm" />
        </Dock>
    );
});

const PositionDock = memo(function PositionDock(props: {
    styles: Record<string, React.CSSProperties>;
    books: BookRow[] | null;
    current: CurrentPos;
    onJump: (bookId: string, chapter: number, verse: number | null) => void;
}) {
    const { styles, books, current, onJump } = props;

    return (
        <div style={ui.centerOuter}>
            <div style={ui.centerInner}>
                <PositionPill
                    styles={styles}
                    books={books}
                    current={current}
                    onJump={onJump}
                />
            </div>
        </div>
    );
});

export const ReaderHeader = memo(function ReaderHeader(props: Props) {
    const { styles, books, onBackHome, current, onJumpRef } = props;

    const onJump = useCallback(
        (bookId: string, chapter: number, verse: number | null) => {
            onJumpRef(bookId, chapter, verse);
        },
        [onJumpRef],
    );

    return (
        <header style={ui.headerRoot} aria-label="Reader header">
            <div style={ui.leftSlot}>
                <HeaderGroup ariaLabel="Navigation and account">
                    <HomeDock onBackHome={onBackHome} />
                    <AccountDock />
                </HeaderGroup>
            </div>

            <div style={ui.centerSlot}>
                <PositionDock
                    styles={styles}
                    books={books}
                    current={current}
                    onJump={onJump}
                />
            </div>

            <div style={ui.rightSlot}>
                <div style={ui.rightCluster}>
                    <HeaderGroup ariaLabel="Reader controls">
                        <TypographyDock />
                    </HeaderGroup>

                    <HeaderGroup ariaLabel="Appearance" gap={TOKENS.subtleGap}>
                        <Divider />
                        <ThemeDock />
                    </HeaderGroup>
                </div>
            </div>
        </header>
    );
});