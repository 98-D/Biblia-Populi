// apps/web/src/reader/prefs/ReaderPrefsProvider.tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
    applyReaderTypography,
    clearReaderTypography,
    DEFAULT_TYPOGRAPHY,
    loadReaderTypography,
    saveReaderTypography,
    updateTypography,
    type ReaderTypography,
} from "../typography";

const LS_TRANSLATION = "bp_reader_translation_v1";

type ReaderPrefsState = Readonly<{
    // Typography overrides are enabled/disabled separately from the typography shape
    // (because ReaderTypography itself does NOT include an `enabled` flag).
    typographyEnabled: boolean;
    setTypographyEnabled: (on: boolean) => void;
    toggleTypographyEnabled: () => void;

    typography: ReaderTypography;
    setTypography: (patch: Partial<ReaderTypography> | ((t: ReaderTypography) => Partial<ReaderTypography>)) => void;
    resetTypography: () => void;

    translationId: string | null;
    setTranslationId: (id: string | null) => void;
}>;

const ReaderPrefsContext = createContext<ReaderPrefsState | null>(null);

function safeGet(key: string): string | null {
    try {
        return typeof window === "undefined" ? null : window.localStorage.getItem(key);
    } catch {
        return null;
    }
}
function safeSet(key: string, val: string): void {
    try {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(key, val);
    } catch {}
}
function safeDel(key: string): void {
    try {
        if (typeof window === "undefined") return;
        window.localStorage.removeItem(key);
    } catch {}
}

function readTranslation(): string | null {
    const v = safeGet(LS_TRANSLATION);
    const s = (v ?? "").trim();
    return s ? s : null;
}

export function ReaderPrefsProvider(props: { children: React.ReactNode }) {
    const stored = useMemo(() => loadReaderTypography(), []);

    const [typographyEnabled, setTypographyEnabledState] = useState<boolean>(!!stored);
    const [typography, setTypographyState] = useState<ReaderTypography>(stored ?? DEFAULT_TYPOGRAPHY);

    const [translationId, setTranslationIdState] = useState<string | null>(() => readTranslation());

    const setTypographyEnabled = useCallback((on: boolean) => {
        setTypographyEnabledState(!!on);
    }, []);

    const toggleTypographyEnabled = useCallback(() => {
        setTypographyEnabledState((v) => !v);
    }, []);

    const setTypography = useCallback(
        (patch: Partial<ReaderTypography> | ((t: ReaderTypography) => Partial<ReaderTypography>)) => {
            // Changing typography implies the user wants overrides ON.
            setTypographyEnabledState(true);

            setTypographyState((prev) => {
                const delta = typeof patch === "function" ? patch(prev) : patch;
                return updateTypography(prev, delta);
            });
        },
        [],
    );

    const resetTypography = useCallback(() => {
        // “Reset” means: turn overrides off and return to defaults.
        setTypographyEnabledState(false);
        setTypographyState(DEFAULT_TYPOGRAPHY);
    }, []);

    const setTranslationId = useCallback((id: string | null) => {
        const clean = (id ?? "").trim();
        const next = clean ? clean : null;
        setTranslationIdState(next);
        if (next) safeSet(LS_TRANSLATION, next);
        else safeDel(LS_TRANSLATION);
    }, []);

    // Apply + persist typography centrally.
    useEffect(() => {
        if (!typographyEnabled) {
            // Remove overrides AND clear persisted typography.
            applyReaderTypography(null);
            clearReaderTypography();
            return;
        }

        // Persist + apply.
        saveReaderTypography(typography);
        applyReaderTypography(typography);
    }, [typographyEnabled, typography]);

    // Optional: react to cross-tab changes (translation + typography).
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (!e.key) return;

            if (e.key === LS_TRANSLATION) {
                setTranslationIdState(readTranslation());
                return;
            }

            // If the typography module’s key changes, this is still safe (just no-op).
            // If your key is stable, replace this condition with an exact match.
            if (e.key.toLowerCase().includes("typography")) {
                const t = loadReaderTypography();
                setTypographyEnabledState(!!t);
                setTypographyState(t ?? DEFAULT_TYPOGRAPHY);
            }
        };

        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    const value = useMemo<ReaderPrefsState>(
        () => ({
            typographyEnabled,
            setTypographyEnabled,
            toggleTypographyEnabled,

            typography,
            setTypography,
            resetTypography,

            translationId,
            setTranslationId,
        }),
        [
            typographyEnabled,
            setTypographyEnabled,
            toggleTypographyEnabled,
            typography,
            setTypography,
            resetTypography,
            translationId,
            setTranslationId,
        ],
    );

    return <ReaderPrefsContext.Provider value={value}>{props.children}</ReaderPrefsContext.Provider>;
}

export function useReaderPrefs(): ReaderPrefsState {
    const ctx = useContext(ReaderPrefsContext);
    if (!ctx) throw new Error("useReaderPrefs must be used within <ReaderPrefsProvider />");
    return ctx;
}