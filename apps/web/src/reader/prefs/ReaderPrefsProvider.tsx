// apps/web/src/reader/prefs/ReaderPrefsProvider.tsx
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
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
    typographyEnabled: boolean;
    setTypographyEnabled: (on: boolean) => void;
    toggleTypographyEnabled: () => void;

    typography: ReaderTypography;
    setTypography: (
         patch: Partial<ReaderTypography> | ((t: ReaderTypography) => Partial<ReaderTypography>),
    ) => void;
    replaceTypography: (next: ReaderTypography) => void;
    resetTypography: () => void;

    translationId: string | null;
    setTranslationId: (id: string | null) => void;
}>;

const ReaderPrefsContext = createContext<ReaderPrefsState | null>(null);

function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof document !== "undefined";
}

function safeGet(key: string): string | null {
    try {
        return isBrowser() ? window.localStorage.getItem(key) : null;
    } catch {
        return null;
    }
}

function safeSet(key: string, val: string): void {
    try {
        if (!isBrowser()) return;
        window.localStorage.setItem(key, val);
    } catch {
        // ignore
    }
}

function safeDel(key: string): void {
    try {
        if (!isBrowser()) return;
        window.localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

function cleanTranslationId(value: string | null | undefined): string | null {
    const s = (value ?? "").trim();
    return s.length > 0 ? s : null;
}

function readTranslation(): string | null {
    return cleanTranslationId(safeGet(LS_TRANSLATION));
}

function cloneTypography(input: ReaderTypography): ReaderTypography {
    return { ...input };
}

function safeLoadTypography(): ReaderTypography | null {
    const loaded = loadReaderTypography();
    return loaded ? cloneTypography(loaded) : null;
}

export function ReaderPrefsProvider(props: { children: React.ReactNode }) {
    const { children } = props;

    const initTypographyRef = useRef<ReaderTypography | null>(null);
    if (initTypographyRef.current === null) {
        initTypographyRef.current = safeLoadTypography();
    }

    const initialTypography = initTypographyRef.current;
    const [typographyEnabled, setTypographyEnabledState] = useState<boolean>(!!initialTypography);
    const [typography, setTypographyState] = useState<ReaderTypography>(
         initialTypography ?? cloneTypography(DEFAULT_TYPOGRAPHY),
    );
    const [translationId, setTranslationIdState] = useState<string | null>(() => readTranslation());

    const mountedRef = useRef(true);
    const appliedTypographyRef = useRef<string | null>(null);
    const appliedTypographyEnabledRef = useRef<boolean | null>(null);
    const lastWrittenTranslationRef = useRef<string | null>(translationId);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const setTypographyEnabled = useCallback((on: boolean) => {
        setTypographyEnabledState(Boolean(on));
    }, []);

    const toggleTypographyEnabled = useCallback(() => {
        setTypographyEnabledState((prev) => !prev);
    }, []);

    const setTypography = useCallback(
         (patch: Partial<ReaderTypography> | ((t: ReaderTypography) => Partial<ReaderTypography>)) => {
             setTypographyEnabledState(true);

             setTypographyState((prev) => {
                 const delta = typeof patch === "function" ? patch(prev) : patch;
                 return updateTypography(prev, delta ?? {});
             });
         },
         [],
    );

    const replaceTypography = useCallback((next: ReaderTypography) => {
        setTypographyEnabledState(true);
        setTypographyState(updateTypography(DEFAULT_TYPOGRAPHY, next));
    }, []);

    const resetTypography = useCallback(() => {
        setTypographyEnabledState(false);
        setTypographyState(cloneTypography(DEFAULT_TYPOGRAPHY));
    }, []);

    const setTranslationId = useCallback((id: string | null) => {
        const next = cleanTranslationId(id);
        setTranslationIdState((prev) => {
            if (prev === next) return prev;
            return next;
        });
    }, []);

    useEffect(() => {
        const next = translationId;
        if (lastWrittenTranslationRef.current === next) return;

        lastWrittenTranslationRef.current = next;

        if (next) safeSet(LS_TRANSLATION, next);
        else safeDel(LS_TRANSLATION);
    }, [translationId]);

    useEffect(() => {
        const serialized = JSON.stringify(typography);

        if (
             appliedTypographyEnabledRef.current === typographyEnabled &&
             appliedTypographyRef.current === serialized
        ) {
            return;
        }

        appliedTypographyEnabledRef.current = typographyEnabled;
        appliedTypographyRef.current = serialized;

        if (!typographyEnabled) {
            applyReaderTypography(null);
            clearReaderTypography();
            return;
        }

        saveReaderTypography(typography);
        applyReaderTypography(typography);
    }, [typographyEnabled, typography]);

    useEffect(() => {
        if (!isBrowser()) return;

        const onStorage = (e: StorageEvent) => {
            if (!mountedRef.current) return;
            if (!e.key) return;

            if (e.key === LS_TRANSLATION) {
                const next = cleanTranslationId(e.newValue);
                lastWrittenTranslationRef.current = next;
                setTranslationIdState((prev) => (prev === next ? prev : next));
                return;
            }

            // Typography storage keys live inside the typography module.
            // We keep this deliberately broad enough to pick up its writes,
            // but narrow enough to avoid random unrelated storage churn.
            const key = e.key.toLowerCase();
            if (!key.includes("typography")) return;

            const nextTypography = safeLoadTypography();
            const nextEnabled = !!nextTypography;
            const nextValue = nextTypography ?? cloneTypography(DEFAULT_TYPOGRAPHY);

            setTypographyEnabledState((prev) => (prev === nextEnabled ? prev : nextEnabled));
            setTypographyState((prev) => {
                const prevSerialized = JSON.stringify(prev);
                const nextSerialized = JSON.stringify(nextValue);
                return prevSerialized === nextSerialized ? prev : nextValue;
            });
        };

        window.addEventListener("storage", onStorage);
        return () => {
            window.removeEventListener("storage", onStorage);
        };
    }, []);

    const value = useMemo<ReaderPrefsState>(
         () => ({
             typographyEnabled,
             setTypographyEnabled,
             toggleTypographyEnabled,

             typography,
             setTypography,
             replaceTypography,
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
             replaceTypography,
             resetTypography,
             translationId,
             setTranslationId,
         ],
    );

    return <ReaderPrefsContext.Provider value={value}>{children}</ReaderPrefsContext.Provider>;
}

export function useReaderPrefs(): ReaderPrefsState {
    const ctx = useContext(ReaderPrefsContext);
    if (!ctx) {
        throw new Error("useReaderPrefs must be used within <ReaderPrefsProvider />");
    }
    return ctx;
}