// apps/web/src/reader/ReaderHeader.tsx
import React, { useMemo, useState } from "react";
import type { BookRow } from "../api";
import type { ReaderLocation } from "../Search";
import { PositionPill } from "../PositionPill";
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

    // kept for compatibility (toggle is global now)
    mode?: "light" | "dark";
    onToggleTheme?: () => void;
};

export function ReaderHeader(props: Props) {
    const { styles, books, onBackHome, current, onJumpRef, onNavigate } = props;

    const [pressBack, setPressBack] = useState(false);

    const pressed =
        ((styles as any).btnPressed as React.CSSProperties | undefined) ??
        ((styles as any).buttonPressed as React.CSSProperties | undefined);

    const backStyle = useMemo(() => ({ ...sx.backBtn, ...(pressBack ? pressed : null) }), [pressBack, pressed]);

    const backHandlers = useMemo(
        () => ({
            onPointerDown: () => setPressBack(true),
            onPointerUp: () => setPressBack(false),
            onPointerCancel: () => setPressBack(false),
            onPointerLeave: () => setPressBack(false),
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
                    {...backHandlers}
                >
                    ← Home
                </button>
            </div>

            <div style={sx.topCenter}>
                <PositionPill styles={styles} books={books} current={current} onJump={(b, c, v) => onJumpRef(b, c, v)} />
            </div>

            <div style={sx.topRight}>
                {/* give the fixed global toggle room so it never sits on top of header chrome */}
                <div style={{ ...sx.rightCluster, paddingRight: 54 }}>
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
                </div>
            </div>
        </div>
    );
}