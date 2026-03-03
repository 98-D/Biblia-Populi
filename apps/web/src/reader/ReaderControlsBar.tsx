// apps/web/src/reader/ReaderControlsBar.tsx
import React from "react";
import { ReaderTypographyControl } from "./ReaderTypographyControl";

type Props = {
    right?: React.ReactNode;
    left?: React.ReactNode;
};

export function ReaderControlsBar(props: Props) {
    const { left, right } = props;

    return (
        <div style={sx.bar}>
            <div style={sx.inner}>
                <div style={sx.left}>
                    {left ?? <div style={sx.kicker}>Reader</div>}
                </div>

                <div style={sx.right}>
                    {right ?? (
                        <>
                            <ReaderTypographyControl />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

const sx: Record<string, React.CSSProperties> = {
    bar: {
        borderBottom: "1px solid var(--hairline)",
        background: "color-mix(in oklab, var(--bg) 86%, transparent)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
    },
    inner: {
        maxWidth: "var(--bpReaderMeasure, 840px)",
        marginInline: "auto",
        padding: "10px 18px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    left: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
    right: { display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" },
    kicker: { fontSize: 10, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--muted)" },
};