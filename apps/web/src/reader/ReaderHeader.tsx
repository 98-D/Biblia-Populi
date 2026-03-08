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

     // retained for API compatibility, not used by header anymore
     onNavigate: (loc: { bookId: string; chapter: number; verse?: number }) => void;

     // legacy: keep props but header uses global theme now
     mode?: "light" | "dark";
     onToggleTheme?: () => void;
};

type DockProps = {
     children: ReactNode;
     title?: string;
     ariaLabel?: string;
     pad?: number;
};

const Dock = memo(function Dock(props: DockProps) {
     const { children, title, ariaLabel, pad = 3 } = props;

     const dock = useMemo<CSSProperties>(
          () => ({
               display: "inline-flex",
               alignItems: "center",
               justifyContent: "center",
               padding: pad,
               minHeight: 38,
               borderRadius: 999,
               background: "color-mix(in srgb, var(--bg) 86%, var(--panel))",
               border: "1px solid color-mix(in srgb, var(--border) 62%, transparent)",
               boxShadow: "0 8px 18px rgba(0,0,0,0.045)",
               backdropFilter: "blur(10px)",
               WebkitBackdropFilter: "blur(10px)",
          }),
          [pad],
     );

     return (
          <div style={dock} title={title} aria-label={ariaLabel}>
               {children}
          </div>
     );
});

const HeaderGroup = memo(function HeaderGroup(props: {
     children: ReactNode;
     ariaLabel?: string;
     gap?: number;
}) {
     const style = useMemo<CSSProperties>(
          () => ({
               display: "flex",
               alignItems: "center",
               gap: props.gap ?? 8,
               minWidth: 0,
          }),
          [props.gap],
     );

     return (
          <div style={style} aria-label={props.ariaLabel}>
               {props.children}
          </div>
     );
});

const Divider = memo(function Divider() {
     return (
          <div
               aria-hidden
               style={{
                    width: 1,
                    height: 20,
                    background: "color-mix(in srgb, var(--border) 68%, transparent)",
                    opacity: 0.78,
                    marginInline: 1,
                    flex: "0 0 auto",
               }}
          />
     );
});

type IconDockButtonProps = {
     ariaLabel: string;
     title: string;
     onClick: () => void;
     icon: ReactNode;
     pressed?: boolean;
};

const IconDockButton = memo(function IconDockButton(props: IconDockButtonProps) {
     const { ariaLabel, title, onClick, icon, pressed = false } = props;
     const [hover, setHover] = useState(false);
     const [down, setDown] = useState(false);

     const style = useMemo<CSSProperties>(
          () => ({
               appearance: "none",
               WebkitAppearance: "none",
               width: 32,
               height: 32,
               border: "1px solid transparent",
               borderRadius: 999,
               background:
                    down || pressed
                         ? "color-mix(in srgb, var(--activeBg) 76%, transparent)"
                         : hover
                              ? "color-mix(in srgb, var(--activeBg) 58%, transparent)"
                              : "transparent",
               color: "var(--fg)",
               display: "inline-flex",
               alignItems: "center",
               justifyContent: "center",
               cursor: "pointer",
               transform: down ? "scale(0.97)" : "scale(1)",
               transition:
                    "transform 120ms ease, background 140ms ease, border-color 140ms ease, opacity 140ms ease",
               WebkitTapHighlightColor: "transparent",
               outline: "none",
               boxShadow:
                    hover || down || pressed
                         ? "inset 0 0 0 1px color-mix(in srgb, var(--border) 58%, transparent)"
                         : "none",
          }),
          [down, hover, pressed],
     );

     const onPointerEnter = useCallback<PointerEventHandler<HTMLButtonElement>>((e) => {
          if (e.pointerType === "touch") return;
          setHover(true);
     }, []);

     const onPointerLeave = useCallback<PointerEventHandler<HTMLButtonElement>>((e) => {
          if (e.pointerType === "touch") return;
          setHover(false);
          setDown(false);
     }, []);

     const onPointerDown = useCallback<PointerEventHandler<HTMLButtonElement>>((e) => {
          try {
               e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
               // ignore
          }
          setDown(true);
     }, []);

     const onPointerClear = useCallback<PointerEventHandler<HTMLButtonElement>>((e) => {
          try {
               e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
               // ignore
          }
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
               onPointerUp={onPointerClear}
               onPointerCancel={onPointerClear}
               onPointerOutCapture={onPointerClear}
               style={style}
          >
               {icon}
          </button>
     );
});

export const ReaderHeader = memo(function ReaderHeader(props: Props) {
     const { styles, books, onBackHome, current, onJumpRef } = props;

     const topLeftStyle = sx.topLeft;
     const topCenterStyle = sx.topCenter;
     const topRightStyle = sx.topRight;
     const topBarStyle = sx.topBar;

     const shellStyle = useMemo<CSSProperties>(
          () => ({
               display: "flex",
               alignItems: "center",
               gap: 8,
               minWidth: 0,
          }),
          [],
     );

     const centerWrapStyle = useMemo<CSSProperties>(
          () => ({
               display: "flex",
               alignItems: "center",
               justifyContent: "center",
               minWidth: 0,
               width: "100%",
          }),
          [],
     );

     const rightClusterStyle = useMemo<CSSProperties>(
          () => ({
               display: "flex",
               alignItems: "center",
               justifyContent: "flex-end",
               gap: 8,
               minWidth: 0,
          }),
          [],
     );

     const onJump = useCallback(
          (bookId: string, chapter: number, verse: number | null) => {
               onJumpRef(bookId, chapter, verse);
          },
          [onJumpRef],
     );

     const homeDock = useMemo(
          () => (
               <Dock title="Home" ariaLabel="Home">
                    <IconDockButton
                         ariaLabel="Home"
                         title="Home"
                         onClick={onBackHome}
                         icon={<Home size={17} aria-hidden />}
                    />
               </Dock>
          ),
          [onBackHome],
     );

     const accountDock = useMemo(
          () => (
               <Dock title="Account" ariaLabel="Account">
                    <AccountMenu size="sm" />
               </Dock>
          ),
          [],
     );

     const typeDock = useMemo(
          () => (
               <Dock title="Typography" ariaLabel="Typography">
                    <ReaderTypographyControl />
               </Dock>
          ),
          [],
     );

     const themeDock = useMemo(
          () => (
               <Dock title="Theme" ariaLabel="Theme">
                    <ThemeToggleSwitch size="sm" />
               </Dock>
          ),
          [],
     );

     return (
          <div style={topBarStyle}>
               <div style={topLeftStyle}>
                    <HeaderGroup ariaLabel="Navigation and account">
                         {homeDock}
                         {accountDock}
                    </HeaderGroup>
               </div>

               <div style={topCenterStyle}>
                    <div style={centerWrapStyle}>
                         <PositionPill
                              styles={styles}
                              books={books}
                              current={current}
                              onJump={onJump}
                         />
                    </div>
               </div>

               <div style={topRightStyle}>
                    <div style={rightClusterStyle}>
                         <HeaderGroup ariaLabel="Reader controls">
                              {typeDock}
                         </HeaderGroup>

                         <HeaderGroup ariaLabel="Appearance" gap={6}>
                              <Divider />
                              {themeDock}
                         </HeaderGroup>
                    </div>
               </div>
          </div>
     );
});