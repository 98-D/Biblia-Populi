// apps/web/src/reader/ReaderHeader.tsx
import React, { memo, useMemo, useState, useCallback } from "react";
import type { BookRow } from "../api";
import type { ReaderLocation } from "../Search";
import { PositionPill } from "../PositionPill";
import { ThemeToggleSwitch } from "../theme";
import { AccountMenu } from "../auth/AccountMenu";
import { sx } from "./sx";
import { ReaderTypographyControl } from "./ReaderTypographyControl";
import { Home } from "lucide-react";

type CurrentPos = {
    label: string;
    ord: number;
    bookId: string | null;
    chapter: number | null;
    verse: number | null;
};

type Props = {
    styles: Record<string, React.CSSProperties>;
    books: BookRow[] | null;

    onBackHome: () => void;

    current: CurrentPos;
    onJumpRef: (bookId: string, chapter: number, verse: number | null) => void;

    onNavigate: (loc: ReaderLocation) => void;

    // legacy: keep props but header uses global theme now
    mode?: "light" | "dark";
    onToggleTheme?: () => void;
};

type DockProps = { children: React.ReactNode; title?: string; ariaLabel?: string };

const Dock = memo(function Dock(props: DockProps) {
    const dock = useMemo<React.CSSProperties>(
        () => ({
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 3,
            borderRadius: 999,
            background: "color-mix(in srgb, var(--bg) 86%, var(--panel))",
            border: "1px solid color-mix(in srgb, var(--border) 65%, transparent)",
            boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
        }),
        [],
    );

    return (
        <div style={dock} title={props.title} aria-label={props.ariaLabel}>
            {props.children}
        </div>
    );
});

export const ReaderHeader = memo(function ReaderHeader(props: Props) {
    const { styles, books, onBackHome, current, onJumpRef } = props;

    const [pressBack, setPressBack] = useState(false);
    const [hoverBack, setHoverBack] = useState(false);

    // Some style packs use different names — support both.
    const pressed =
        ((styles as any).btnPressed as React.CSSProperties | undefined) ??
        ((styles as any).buttonPressed as React.CSSProperties | undefined);

    const sxAny = sx as any;

    const backStyle = useMemo<React.CSSProperties>(() => {
        return {
            ...sx.backBtn,
            ...(hoverBack ? (sxAny.backBtnHover as React.CSSProperties) : null),
            ...(pressBack ? (sxAny.backBtnActive as React.CSSProperties) : null),
            ...(pressBack && pressed ? pressed : null),
            // tighten for icon-only home button
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingInline: 10,
            minWidth: 38,
        };
    }, [hoverBack, pressBack, pressed, sxAny]);

    const onBackPointerEnter = useCallback<React.PointerEventHandler<HTMLButtonElement>>((e) => {
        if (e.pointerType === "touch") return;
        setHoverBack(true);
    }, []);

    const onBackPointerLeave = useCallback<React.PointerEventHandler<HTMLButtonElement>>((e) => {
        if (e.pointerType === "touch") return;
        setHoverBack(false);
        setPressBack(false);
    }, []);

    const onBackPointerDown = useCallback<React.PointerEventHandler<HTMLButtonElement>>((e) => {
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            // ignore
        }
        setPressBack(true);
    }, []);

    const onBackPointerClear = useCallback<React.PointerEventHandler<HTMLButtonElement>>((e) => {
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // ignore
        }
        setPressBack(false);
    }, []);

    const rightStack = useMemo<React.CSSProperties>(
        () => ({
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
        }),
        [],
    );

    const leftStack = useMemo<React.CSSProperties>(
        () => ({
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
        }),
        [],
    );

    const split = useMemo<React.CSSProperties>(
        () => ({
            width: 1,
            height: 22,
            background: "color-mix(in srgb, var(--border) 70%, transparent)",
            marginInline: 2,
            opacity: 0.9,
        }),
        [],
    );

    const onJump = useCallback(
        (bookId: string, chapter: number, verse: number | null) => onJumpRef(bookId, chapter, verse),
        [onJumpRef],
    );

    return (
        <div style={sx.topBar}>
            <div style={sx.topLeft}>
                <div style={leftStack} aria-label="Home and account">
                    <button
                        type="button"
                        style={backStyle}
                        onClick={onBackHome}
                        aria-label="Home"
                        title="Home"
                        onPointerEnter={onBackPointerEnter}
                        onPointerLeave={onBackPointerLeave}
                        onPointerDown={onBackPointerDown}
                        onPointerUp={onBackPointerClear}
                        onPointerCancel={onBackPointerClear}
                        onPointerOutCapture={onBackPointerClear}
                    >
                        <Home size={18} aria-hidden />
                    </button>

                    <Dock title="Account" ariaLabel="Account">
                        <AccountMenu size="sm" />
                    </Dock>
                </div>
            </div>

            <div style={sx.topCenter}>
                <PositionPill styles={styles} books={books} current={current} onJump={onJump} />
            </div>

            <div style={sx.topRight}>
                <div style={sx.rightCluster}>
                    {/* Search removed for now */}

                    <ReaderTypographyControl />

                    <div style={rightStack} aria-label="Theme">
                        <div style={split} aria-hidden />

                        <div style={sx.themeWrap}>
                            <Dock title="Theme" ariaLabel="Theme">
                                <ThemeToggleSwitch size="sm" />
                            </Dock>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});