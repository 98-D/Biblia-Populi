// apps/web/src/reader/annotationStore.ts
import {
    ANNOTATION_KIND,
    createAnnotation,
    createAnnotationCreatedEvent,
    createAnnotationId,
    createAnnotationSpan,
    createDeviceId,
    createEventId,
    createUserId,
    reduceAnnotationEvents,
    type Annotation,
    type AnnotationEvent,
    type AnnotationId,
    type AnnotationSnapshot,
    type CreateEventMeta,
    type DeviceId,
    type SelectionAnchorInput,
    type UserId,
} from "@biblia/annotation";

const LS_KEY = "bp.reader.annotation.events.v1";
const LS_DEVICE_KEY = "bp.reader.device-id.v1";
const LS_USER_KEY = "bp.reader.user-id.v1";

export type ReaderAnnotationStoreListener = (snapshot: AnnotationSnapshot) => void;

export type ReaderAnnotationStoreOptions = {
    storageKey?: string;
    deviceStorageKey?: string;
    userStorageKey?: string;
    persist?: boolean;
    now?: () => number;
};

export type CreateTextAnnotationInput = {
    selection: SelectionAnchorInput;
    kind?: "HIGHLIGHT" | "NOTE" | "BOOKMARK";
    title?: string | null;
    body?: string | null;
    color?: string | null;
    labels?: readonly string[];
    collectionIds?: readonly string[];
    pinned?: boolean;
    archived?: boolean;
};

type PersistedAnnotationEventEnvelope = {
    type: string;
    eventId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function hasNonEmptyStringProp(value: Record<string, unknown>, key: string): boolean {
    const candidate = value[key];
    return typeof candidate === "string" && candidate.trim().length > 0;
}

function isPersistedAnnotationEventEnvelope(
     value: unknown,
): value is PersistedAnnotationEventEnvelope {
    if (!isRecord(value)) return false;
    return hasNonEmptyStringProp(value, "type") && hasNonEmptyStringProp(value, "eventId");
}

function safeJsonParse<T>(raw: string | null): T | null {
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function safeJsonStringify(value: unknown): string | null {
    try {
        return JSON.stringify(value);
    } catch {
        return null;
    }
}

function canUseWindowStorage(): boolean {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeStorageGet(key: string): string | null {
    if (!canUseWindowStorage()) return null;
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeStorageSet(key: string, value: string): void {
    if (!canUseWindowStorage()) return;
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // ignore storage quota / privacy mode failures
    }
}

function safeStorageRemove(key: string): void {
    if (!canUseWindowStorage()) return;
    try {
        window.localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

function randomHex(bytes = 10): string {
    const out = new Uint8Array(bytes);

    if (
         typeof globalThis.crypto !== "undefined" &&
         typeof globalThis.crypto.getRandomValues === "function"
    ) {
        globalThis.crypto.getRandomValues(out);
    } else {
        for (let i = 0; i < out.length; i += 1) {
            out[i] = Math.floor(Math.random() * 256);
        }
    }

    return Array.from(out, (n) => n.toString(16).padStart(2, "0")).join("");
}

function loadOrCreateBrandedId<T extends string>(
     key: string,
     create: (seed?: string) => T,
): T {
    const raw = safeStorageGet(key);
    if (typeof raw === "string" && raw.trim().length > 0) {
        try {
            return create(raw.trim());
        } catch {
            // fall through and reissue
        }
    }

    const next = create(randomHex(8));
    safeStorageSet(key, next);
    return next;
}

function materializeEvents(input: unknown): AnnotationEvent[] {
    if (!Array.isArray(input)) return [];

    const out: AnnotationEvent[] = [];
    for (const item of input) {
        if (!isPersistedAnnotationEventEnvelope(item)) continue;
        out.push(item as unknown as AnnotationEvent);
    }
    return out;
}

function sortAnnotationsNewestFirst(a: Annotation, b: Annotation): number {
    if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
    return a.annotationId.localeCompare(b.annotationId);
}

function normalizeStringList(input: readonly string[] | undefined): string[] {
    if (!input || input.length === 0) return [];

    const seen = new Set<string>();
    const out: string[] = [];

    for (const item of input) {
        if (typeof item !== "string") continue;
        const value = item.trim();
        if (!value) continue;
        if (seen.has(value)) continue;
        seen.add(value);
        out.push(value);
    }

    return out;
}

function normalizeNullableText(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizeSelectionText(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null;
    const collapsed = value.replace(/\s+/g, " ").trim();
    return collapsed.length > 0 ? collapsed : null;
}

function getKind(
     value: CreateTextAnnotationInput["kind"] | undefined,
): Annotation["kind"] {
    switch (value) {
        case "NOTE":
            return ANNOTATION_KIND.NOTE;
        case "BOOKMARK":
            return ANNOTATION_KIND.BOOKMARK;
        case "HIGHLIGHT":
        default:
            return ANNOTATION_KIND.HIGHLIGHT;
    }
}

function normalizeVerseOrdRange(startOrd: number, endOrd: number): {
    startOrd: number;
    endOrd: number;
} {
    if (startOrd <= endOrd) return { startOrd, endOrd };
    return { startOrd: endOrd, endOrd: startOrd };
}

export class ReaderAnnotationStore {
    readonly storageKey: string;
    readonly deviceStorageKey: string;
    readonly userStorageKey: string;
    readonly persist: boolean;
    readonly now: () => number;

    private events: AnnotationEvent[];
    private snapshot: AnnotationSnapshot;
    private readonly listeners = new Set<ReaderAnnotationStoreListener>();
    private readonly deviceId: DeviceId;
    private readonly userId: UserId;

    constructor(options: ReaderAnnotationStoreOptions = {}) {
        this.storageKey = options.storageKey ?? LS_KEY;
        this.deviceStorageKey = options.deviceStorageKey ?? LS_DEVICE_KEY;
        this.userStorageKey = options.userStorageKey ?? LS_USER_KEY;
        this.persist = options.persist ?? true;
        this.now = options.now ?? (() => Date.now());

        this.deviceId = loadOrCreateBrandedId(this.deviceStorageKey, createDeviceId);
        this.userId = loadOrCreateBrandedId(this.userStorageKey, createUserId);

        const raw = this.persist ? safeStorageGet(this.storageKey) : null;
        this.events = materializeEvents(safeJsonParse<unknown>(raw));

        try {
            this.snapshot = reduceAnnotationEvents(this.events);
        } catch {
            this.events = [];
            this.snapshot = reduceAnnotationEvents([]);
            if (this.persist) {
                safeStorageRemove(this.storageKey);
            }
        }
    }

    getDeviceId(): DeviceId {
        return this.deviceId;
    }

    getUserId(): UserId {
        return this.userId;
    }

    getEvents(): readonly AnnotationEvent[] {
        return this.events;
    }

    getSnapshot(): AnnotationSnapshot {
        return this.snapshot;
    }

    getAnnotation(annotationId: AnnotationId): Annotation | null {
        return this.snapshot.annotations.get(annotationId) ?? null;
    }

    hasAnnotation(annotationId: AnnotationId): boolean {
        return this.snapshot.annotations.has(annotationId);
    }

    listAnnotations(): readonly Annotation[] {
        return [...this.snapshot.annotations.values()]
             .filter((annotation) => annotation.deletedAt === null)
             .sort(sortAnnotationsNewestFirst);
    }

    listAnnotationsForVerseOrd(verseOrd: number): readonly Annotation[] {
        const out: Annotation[] = [];

        for (const annotation of this.snapshot.annotations.values()) {
            if (annotation.deletedAt !== null) continue;

            const hit = annotation.spans.some((span) => {
                if (span.deletedAt !== null) return false;
                const range = normalizeVerseOrdRange(
                     span.start.verseOrd,
                     span.end.verseOrd,
                );
                return verseOrd >= range.startOrd && verseOrd <= range.endOrd;
            });

            if (hit) out.push(annotation);
        }

        out.sort(sortAnnotationsNewestFirst);
        return out;
    }

    subscribe(listener: ReaderAnnotationStoreListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    append(event: AnnotationEvent): void {
        this.events = [...this.events, event];
        this.rebuildSnapshot();
        this.persistNow();
        this.emit();
    }

    appendMany(events: readonly AnnotationEvent[]): void {
        if (events.length === 0) return;

        this.events = [...this.events, ...events];
        this.rebuildSnapshot();
        this.persistNow();
        this.emit();
    }

    createTextAnnotation(input: CreateTextAnnotationInput): AnnotationId {
        const createdAt = this.now();
        const selection = input.selection;
        const annotationId = createAnnotationId(selection.start.verseKey);

        const span = createAnnotationSpan({
            start: selection.start,
            end: selection.end,
            text: normalizeSelectionText(selection.text),
            translationId: normalizeNullableText(selection.translationId),
            ordinal: 1,
            createdAt,
            updatedAt: createdAt,
            deletedAt: null,
        });

        const annotation = createAnnotation({
            annotationId,
            ownerUserId: this.userId,
            createdByUserId: this.userId,
            updatedByUserId: this.userId,
            deviceId: this.deviceId,
            kind: getKind(input.kind),
            title: normalizeNullableText(input.title),
            body: normalizeNullableText(input.body),
            color: normalizeNullableText(input.color),
            labels: normalizeStringList(input.labels),
            collectionIds: normalizeStringList(input.collectionIds),
            spans: [span],
            strokes: [],
            pinned: input.pinned ?? false,
            archived: input.archived ?? false,
            createdAt,
            updatedAt: createdAt,
            deletedAt: null,
            revision: 1,
        });

        const meta = this.makeEventMeta(createdAt);
        const event = createAnnotationCreatedEvent(annotation, meta);

        this.append(event);
        return annotationId;
    }

    replaceAllEvents(events: readonly AnnotationEvent[]): void {
        this.events = [...events];
        this.rebuildSnapshot();
        this.persistNow();
        this.emit();
    }

    clearAll(): void {
        this.events = [];
        this.snapshot = reduceAnnotationEvents([]);
        this.persistNow();
        this.emit();
    }

    private rebuildSnapshot(): void {
        this.snapshot = reduceAnnotationEvents(this.events);
    }

    private makeEventMeta(createdAt: number): CreateEventMeta {
        return {
            eventId: createEventId("reader"),
            userId: this.userId,
            deviceId: this.deviceId,
            createdAt,
        };
    }

    private persistNow(): void {
        if (!this.persist) return;
        const raw = safeJsonStringify(this.events);
        if (raw === null) return;
        safeStorageSet(this.storageKey, raw);
    }

    private emit(): void {
        for (const listener of this.listeners) {
            listener(this.snapshot);
        }
    }
}

let singleton: ReaderAnnotationStore | null = null;

export function getReaderAnnotationStore(): ReaderAnnotationStore {
    if (singleton) return singleton;
    singleton = new ReaderAnnotationStore();
    return singleton;
}

export function resetReaderAnnotationStoreSingleton(): void {
    singleton = null;
}