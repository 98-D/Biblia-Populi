// apps/web/src/reader/useReaderAnnotations.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    domSelectionToAnchorInput,
    type AnnotationSnapshot,
    type SelectionAnchorInput,
} from "@biblia/annotation";
import {
    getReaderAnnotationStore,
    type ReaderAnnotationStore,
} from "./annotationStore";
import { ReaderDomSelectionResolver } from "./ReaderDomSelectionResolver";

export type ReaderAnnotationsApi = Readonly<{
    store: ReaderAnnotationStore;
    snapshot: AnnotationSnapshot;
    selection: SelectionAnchorInput | null;
    clearSelection: () => void;
    refreshSelection: () => void;
    createHighlight: () => string | null;
    createBookmark: () => string | null;
    createNote: (body?: string | null, title?: string | null) => string | null;
}>;

type SupportedAnnotationKind = "HIGHLIGHT" | "NOTE" | "BOOKMARK";

type CreateAnnotationExtras = Readonly<{
    body?: string | null;
    title?: string | null;
}>;

function canUseDom(): boolean {
    return typeof window !== "undefined" && typeof document !== "undefined";
}

function getActiveSelection(): Selection | null {
    if (!canUseDom()) return null;
    try {
        return document.getSelection();
    } catch {
        return null;
    }
}

function clearDomSelection(): void {
    if (!canUseDom()) return;
    try {
        document.getSelection()?.removeAllRanges();
    } catch {
        // ignore selection-clear failures
    }
}

function isNodeWithinRoot(root: HTMLElement, node: Node | null): boolean {
    if (!node) return false;
    return node === root || root.contains(node);
}

function normalizeMaybeString(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function selectionEquals(
     a: SelectionAnchorInput | null,
     b: SelectionAnchorInput | null,
): boolean {
    if (a === b) return true;
    if (!a || !b) return false;

    return (
         a.start.verseOrd === b.start.verseOrd &&
         a.start.verseKey === b.start.verseKey &&
         a.start.tokenIndex === b.start.tokenIndex &&
         a.start.charOffset === b.start.charOffset &&
         a.end.verseOrd === b.end.verseOrd &&
         a.end.verseKey === b.end.verseKey &&
         a.end.tokenIndex === b.end.tokenIndex &&
         a.end.charOffset === b.end.charOffset &&
         a.text === b.text &&
         a.translationId === b.translationId
    );
}

function getStableRoot(rootRef: React.RefObject<HTMLElement | null>): HTMLElement | null {
    return rootRef.current;
}

export function useReaderAnnotations(
     rootRef: React.RefObject<HTMLElement | null>,
): ReaderAnnotationsApi {
    const store = useMemo(() => getReaderAnnotationStore(), []);
    const resolver = useMemo(() => new ReaderDomSelectionResolver(), []);

    const [snapshot, setSnapshot] = useState<AnnotationSnapshot>(() => store.getSnapshot());
    const [selection, setSelection] = useState<SelectionAnchorInput | null>(null);

    const selectionRef = useRef<SelectionAnchorInput | null>(selection);
    const rootNodeRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        selectionRef.current = selection;
    }, [selection]);

    const setSelectionSafe = useCallback((next: SelectionAnchorInput | null): void => {
        if (selectionEquals(selectionRef.current, next)) return;
        selectionRef.current = next;
        setSelection(next);
    }, []);

    const readSelection = useCallback((): void => {
        const root = getStableRoot(rootRef);
        rootNodeRef.current = root;

        if (!root || !canUseDom()) {
            setSelectionSafe(null);
            return;
        }

        const domSelection = getActiveSelection();
        if (!domSelection || domSelection.rangeCount === 0 || domSelection.isCollapsed) {
            setSelectionSafe(null);
            return;
        }

        let range: Range;
        try {
            range = domSelection.getRangeAt(0);
        } catch {
            setSelectionSafe(null);
            return;
        }

        const commonAncestor = range.commonAncestorContainer;
        if (!isNodeWithinRoot(root, commonAncestor)) {
            setSelectionSafe(null);
            return;
        }

        const next = domSelectionToAnchorInput(domSelection, resolver);
        setSelectionSafe(next);
    }, [resolver, rootRef, setSelectionSafe]);

    const clearSelection = useCallback((): void => {
        clearDomSelection();
        setSelectionSafe(null);
    }, [setSelectionSafe]);

    const createAnnotationFromSelection = useCallback(
         (kind: SupportedAnnotationKind, extras?: CreateAnnotationExtras): string | null => {
             const currentSelection = selectionRef.current;
             if (!currentSelection) return null;

             const annotationId = store.createTextAnnotation({
                 selection: currentSelection,
                 kind,
                 body: normalizeMaybeString(extras?.body),
                 title: normalizeMaybeString(extras?.title),
             });

             clearSelection();
             return annotationId;
         },
         [clearSelection, store],
    );

    useEffect(() => {
        return store.subscribe((nextSnapshot) => {
            setSnapshot(nextSnapshot);
        });
    }, [store]);

    useEffect(() => {
        if (!canUseDom()) return;

        const syncRootRef = (): HTMLElement | null => {
            const root = getStableRoot(rootRef);
            rootNodeRef.current = root;
            return root;
        };

        const handleSelectionRelevantEvent = (): void => {
            readSelection();
        };

        const handleFocusOut = (event: FocusEvent): void => {
            const root = syncRootRef();
            if (!root) {
                setSelectionSafe(null);
                return;
            }

            const nextTarget = event.relatedTarget;
            if (nextTarget instanceof Node && root.contains(nextTarget)) {
                return;
            }

            readSelection();
        };

        const attachRootListeners = (root: HTMLElement | null): void => {
            if (!root) return;
            root.addEventListener("focusin", handleSelectionRelevantEvent);
            root.addEventListener("focusout", handleFocusOut);
        };

        const detachRootListeners = (root: HTMLElement | null): void => {
            if (!root) return;
            root.removeEventListener("focusin", handleSelectionRelevantEvent);
            root.removeEventListener("focusout", handleFocusOut);
        };

        const root = syncRootRef();

        document.addEventListener("selectionchange", handleSelectionRelevantEvent);
        document.addEventListener("pointerup", handleSelectionRelevantEvent);
        document.addEventListener("mouseup", handleSelectionRelevantEvent);
        document.addEventListener("touchend", handleSelectionRelevantEvent);
        document.addEventListener("keyup", handleSelectionRelevantEvent);

        attachRootListeners(root);
        readSelection();

        return () => {
            document.removeEventListener("selectionchange", handleSelectionRelevantEvent);
            document.removeEventListener("pointerup", handleSelectionRelevantEvent);
            document.removeEventListener("mouseup", handleSelectionRelevantEvent);
            document.removeEventListener("touchend", handleSelectionRelevantEvent);
            document.removeEventListener("keyup", handleSelectionRelevantEvent);

            detachRootListeners(rootNodeRef.current);
        };
    }, [readSelection, rootRef, setSelectionSafe]);

    return {
        store,
        snapshot,
        selection,
        clearSelection,
        refreshSelection: readSelection,
        createHighlight: () => createAnnotationFromSelection("HIGHLIGHT"),
        createBookmark: () => createAnnotationFromSelection("BOOKMARK"),
        createNote: (body, title) =>
             createAnnotationFromSelection("NOTE", {
                 body: body ?? null,
                 title: title ?? null,
             }),
    };
}