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
import { ReaderDomSelectionResolver } from "./selectionResolver";

export type ReaderAnnotationsApi = {
    store: ReaderAnnotationStore;
    snapshot: AnnotationSnapshot;
    selection: SelectionAnchorInput | null;
    clearSelection: () => void;
    refreshSelection: () => void;
    createHighlight: () => string | null;
    createBookmark: () => string | null;
    createNote: (body?: string | null, title?: string | null) => string | null;
};

function canUseDom(): boolean {
    return typeof document !== "undefined" && typeof window !== "undefined";
}

function isNodeWithinRoot(root: HTMLElement, node: Node | null): boolean {
    if (!node) return false;
    return node === root || root.contains(node);
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
        // ignore
    }
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

export function useReaderAnnotations(
    rootRef: React.RefObject<HTMLElement | null>,
): ReaderAnnotationsApi {
    const store = useMemo(() => getReaderAnnotationStore(), []);
    const resolver = useMemo(() => new ReaderDomSelectionResolver(), []);

    const [snapshot, setSnapshot] = useState<AnnotationSnapshot>(() => store.getSnapshot());
    const [selection, setSelection] = useState<SelectionAnchorInput | null>(null);

    const selectionRef = useRef<SelectionAnchorInput | null>(selection);
    selectionRef.current = selection;

    const setSelectionSafe = useCallback((next: SelectionAnchorInput | null): void => {
        if (selectionEquals(selectionRef.current, next)) return;
        selectionRef.current = next;
        setSelection(next);
    }, []);

    const clearSelection = useCallback((): void => {
        clearDomSelection();
        setSelectionSafe(null);
    }, [setSelectionSafe]);

    const readSelection = useCallback((): void => {
        const root = rootRef.current;
        if (!root) {
            setSelectionSafe(null);
            return;
        }

        const sel = getActiveSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
            setSelectionSafe(null);
            return;
        }

        let range: Range;
        try {
            range = sel.getRangeAt(0);
        } catch {
            setSelectionSafe(null);
            return;
        }

        const { commonAncestorContainer } = range;
        if (!isNodeWithinRoot(root, commonAncestorContainer)) {
            setSelectionSafe(null);
            return;
        }

        const next = domSelectionToAnchorInput(sel, resolver);
        setSelectionSafe(next);
    }, [resolver, rootRef, setSelectionSafe]);

    const createAnnotationFromSelection = useCallback(
        (
            kind: "HIGHLIGHT" | "NOTE" | "BOOKMARK",
            extras?: { body?: string | null; title?: string | null },
        ): string | null => {
            const current = selectionRef.current;
            if (!current) return null;

            const annotationId = store.createTextAnnotation({
                selection: current,
                kind,
                body: extras?.body ?? null,
                title: extras?.title ?? null,
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

        const onSelectionChange = (): void => {
            readSelection();
        };

        const onPointerUp = (): void => {
            readSelection();
        };

        const onMouseUp = (): void => {
            readSelection();
        };

        const onTouchEnd = (): void => {
            readSelection();
        };

        const onKeyUp = (): void => {
            readSelection();
        };

        const onFocusIn = (): void => {
            readSelection();
        };

        const onFocusOut = (event: FocusEvent): void => {
            const root = rootRef.current;
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

        const root = rootRef.current;

        document.addEventListener("selectionchange", onSelectionChange);
        document.addEventListener("pointerup", onPointerUp);
        document.addEventListener("mouseup", onMouseUp);
        document.addEventListener("touchend", onTouchEnd);
        document.addEventListener("keyup", onKeyUp);

        root?.addEventListener("focusin", onFocusIn);
        root?.addEventListener("focusout", onFocusOut);

        readSelection();

        return () => {
            document.removeEventListener("selectionchange", onSelectionChange);
            document.removeEventListener("pointerup", onPointerUp);
            document.removeEventListener("mouseup", onMouseUp);
            document.removeEventListener("touchend", onTouchEnd);
            document.removeEventListener("keyup", onKeyUp);

            root?.removeEventListener("focusin", onFocusIn);
            root?.removeEventListener("focusout", onFocusOut);
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