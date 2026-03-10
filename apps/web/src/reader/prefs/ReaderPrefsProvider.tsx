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
        // ignore storage failures
    }
}

function safeDel(key: string): void {
    try {
        if (!isBrowser()) return;
        window.localStorage.removeItem(key);
    } catch {
        // ignore storage failures
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
    try {
        const loaded = loadReaderTypography();
        return loaded ? cloneTypography(loaded) : null;
    } catch {
        return null;
    }
}

function serializeTypography(value: ReaderTypography): string {
    return JSON.stringify(value);
}

export function ReaderPrefsProvider(props: { children: React.ReactNode }) {
    const { children } = props;

    const initTypographyRef = useRef<ReaderTypography | null>(null);
    if (initTypographyRef.current === null) {
        initTypographyRef.current = safeLoadTypography();
    }

    const initialTypography = initTypographyRef.current;
    const initialTranslation = readTranslation();

    const [typographyEnabled, setTypographyEnabledState] = useState<boolean>(() => !!initialTypography);
    const [typography, setTypographyState] = useState<ReaderTypography>(
        () => initialTypography ?? cloneTypography(DEFAULT_TYPOGRAPHY),
    );
    const [translationId, setTranslationIdState] = useState<string | null>(() => initialTranslation);

    const appliedTypographyRef = useRef<string | null>(null);
    const appliedTypographyEnabledRef = useRef<boolean | null>(null);
    const lastWrittenTranslationRef = useRef<string | null>(initialTranslation);

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
                const next = updateTypography(prev, delta ?? {});
                return serializeTypography(prev) === serializeTypography(next) ? prev : next;
            });
        },
        [],
    );

    const replaceTypography = useCallback((next: ReaderTypography) => {
        setTypographyEnabledState(true);
        setTypographyState((prev) => {
            const resolved = updateTypography(DEFAULT_TYPOGRAPHY, next);
            return serializeTypography(prev) === serializeTypography(resolved) ? prev : resolved;
        });
    }, []);

    const resetTypography = useCallback(() => {
        setTypographyEnabledState(false);
        setTypographyState((prev) => {
            const next = cloneTypography(DEFAULT_TYPOGRAPHY);
            return serializeTypography(prev) === serializeTypography(next) ? prev : next;
        });
    }, []);

    const setTranslationId = useCallback((id: string | null) => {
        const next = cleanTranslationId(id);
        setTranslationIdState((prev) => (prev === next ? prev : next));
    }, []);

    useEffect(() => {
        const next = translationId;
        if (lastWrittenTranslationRef.current === next) return;

        lastWrittenTranslationRef.current = next;

        if (next) safeSet(LS_TRANSLATION, next);
        else safeDel(LS_TRANSLATION);
    }, [translationId]);

    useEffect(() => {
        const serialized = serializeTypography(typography);

        if (
            appliedTypographyEnabledRef.current === typographyEnabled &&
            appliedTypographyRef.current === serialized
        ) {
            return;
        }

        appliedTypographyEnabledRef.current = typographyEnabled;
        appliedTypographyRef.current = serialized;

        if (!typographyEnabled) {
            clearReaderTypography();
            return;
        }

        saveReaderTypography(typography);
        applyReaderTypography(typography);
    }, [typographyEnabled, typography]);

    useEffect(() => {
        if (!isBrowser()) return;

        const onStorage = (e: StorageEvent) => {
            if (!e.key) return;

            if (e.key === LS_TRANSLATION) {
                const next = cleanTranslationId(e.newValue);
                lastWrittenTranslationRef.current = next;
                setTranslationIdState((prev) => (prev === next ? prev : next));
                return;
            }

            const key = e.key.toLowerCase();
            if (!key.includes("typography")) return;

            const nextTypography = safeLoadTypography();
            const nextEnabled = nextTypography !== null;
            const nextValue = nextTypography ?? cloneTypography(DEFAULT_TYPOGRAPHY);
            const nextSerialized = serializeTypography(nextValue);

            setTypographyEnabledState((prev) => (prev === nextEnabled ? prev : nextEnabled));
            setTypographyState((prev) => {
                const prevSerialized = serializeTypography(prev);
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