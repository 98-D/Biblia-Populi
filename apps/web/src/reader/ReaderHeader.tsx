// apps/web/src/reader/ReaderHeader.tsx
import React, { useMemo, useState, useCallback } from "react";
import type { BookRow } from "../api";
import type { ReaderLocation } from "../Search";
import { PositionPill } from "../PositionPill";
import { ThemeToggleSwitch } from "../theme";
import { sx } from "./sx";
import { ReaderHeaderSearch } from "./ReaderHeaderSearch";
import { ReaderTypographyControl } from "./ReaderTypographyControl";

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

export function ReaderHeader(props: Props) {
    const { styles, books, onBackHome, current, onJumpRef, onNavigate } = props;

    const [pressBack, setPressBack] = useState(false);
    const [hoverBack, setHoverBack] = useState(false);

    const pressed =
        ((styles as any).btnPressed as React.CSSProperties | undefined) ??
        ((styles as any).buttonPressed as React.CSSProperties | undefined);

    const backStyle = useMemo(() => {
        return {
            ...sx.backBtn,
            ...(hoverBack ? (sx as any).backBtnHover : null),
            ...(pressBack ? (sx as any).backBtnActive : null),
            ...(pressBack && pressed ? pressed : null),
        };
    }, [hoverBack, pressBack, pressed]);

    const onBackPointerEnter = useCallback((e: React.PointerEvent) => {
        if (e.pointerType === "touch") return;
        setHoverBack(true);
    }, []);
    const onBackPointerLeave = useCallback((e: React.PointerEvent) => {
        if (e.pointerType === "touch") return;
        setHoverBack(false);
        setPressBack(false);
    }, []);
    const onBackPointerDown = useCallback(() => setPressBack(true), []);
    const onBackPointerUp = useCallback(() => setPressBack(false), []);
    const onBackPointerCancel = useCallback(() => setPressBack(false), []);

    // Theme toggle can look “floaty” on the glass header; give it a subtle dock so it reads intentional.
    const toggleDock = useMemo<React.CSSProperties>(
        () => ({
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 3,
            borderRadius: 999,
            background: "color-mix(in oklab, var(--bg) 86%, var(--panel))",
            boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
        }),
        [],
    );

    return (
        <div style={sx.topBar}>
            <div style={sx.topLeft}>
                <button
                    type="button"
                    style={backStyle}
                    onClick={onBackHome}
                    aria-label="Back to home"
                    title="Back to home"
                    onPointerEnter={onBackPointerEnter}
                    onPointerLeave={onBackPointerLeave}
                    onPointerDown={onBackPointerDown}
                    onPointerUp={onBackPointerUp}
                    onPointerCancel={onBackPointerCancel}
                >
                    ← Home
                </button>
            </div>

            <div style={sx.topCenter}>
                <PositionPill styles={styles} books={books} current={current} onJump={(b, c, v) => onJumpRef(b, c, v)} />
            </div>

            <div style={sx.topRight}>
                <div style={sx.rightCluster}>
                    <div style={sx.searchWrap}>
                        <ReaderHeaderSearch
                            books={books}
                            onNavigate={onNavigate}
                            enableHotkey
                            limit={20}
                            placeholder="Search… (John 3:16)"
                        />
                    </div>

                    <ReaderTypographyControl />

                    <div style={sx.themeWrap}>
                        <div style={toggleDock}>
                            <ThemeToggleSwitch size="sm" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}