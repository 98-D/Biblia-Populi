// apps/web/src/reader/ReaderHeader.tsx
import React, { useMemo, useState } from "react";
import type { BookRow } from "../api";
import type { ReaderLocation } from "../Search";
import { PositionPill } from "../PositionPill";
import { ThemeToggleSwitch, type Mode } from "../theme";
import { sx } from "./sx";
import { ReaderHeaderSearch } from "./ReaderHeaderSearch";

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

    mode?: Mode;
    onToggleTheme?: () => void;
};

export function ReaderHeader(props: Props) {
    const { styles, books, onBackHome, current, onJumpRef, onNavigate, mode, onToggleTheme } = props;

    const [pressBack, setPressBack] = useState(false);

    const pressed =
        ((styles as any).btnPressed as React.CSSProperties | undefined) ??
        ((styles as any).buttonPressed as React.CSSProperties | undefined);

    const backStyle = useMemo(
        () => ({ ...sx.backBtn, ...(pressBack ? pressed : null) }),
        [pressBack, pressed],
    );

    return (
        <div style={sx.topBar}>
            <div style={sx.topLeft}>
                <button
                    type="button"
                    style={backStyle}
                    onClick={onBackHome}
                    onMouseDown={() => setPressBack(true)}
                    onMouseUp={() => setPressBack(false)}
                    onMouseLeave={() => setPressBack(false)}
                    onTouchStart={() => setPressBack(true)}
                    onTouchEnd={() => setPressBack(false)}
                    aria-label="Back to home"
                    title="Back to home"
                >
                    ← Home
                </button>
            </div>

            <div style={sx.topCenter}>
                <PositionPill
                    styles={styles}
                    books={books}
                    current={current}
                    onJump={(b, c, v) => onJumpRef(b, c, v)}
                />
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

                    <div style={sx.themeWrap}>
                        {onToggleTheme ? (
                            <ThemeToggleSwitch mode={mode ?? "light"} onToggle={onToggleTheme} size="sm" />
                        ) : (
                            <div style={{ width: 40, height: 24 }} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}