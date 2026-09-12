import type {
  CardFilter,
  TrainingFocusFilter,
  TrainingMode,
  TrainingSessionSize,
  WordListType,
} from "../types";

export type TrainingSessionResumeRecord = {
  sessionId: string;
  userId: string;
  languageCode: string;
  listId: string | null;
  listType: WordListType | null;
  scenarioId: string;
  modes: TrainingMode[];
  cardFilter: CardFilter;
  newReviewRatio: number;
  focusFilter: TrainingFocusFilter;
  sessionSize: TrainingSessionSize;
};

const storageKey = (userId: string) => `2000nl:training-session:${userId}`;
const ownerStorageKey = "2000nl:training-session-owner";
let memoryOwnerId: string | null = null;

type StoredTrainingSessionResumeRecord = TrainingSessionResumeRecord & {
  ownerId: string;
};

const createOwnerId = (): string => {
  const randomUuid = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (randomUuid) return randomUuid();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const getTrainingSessionOwnerId = (): string => {
  if (typeof window === "undefined") {
    memoryOwnerId ??= createOwnerId();
    return memoryOwnerId;
  }
  try {
    const stored = window.sessionStorage.getItem(ownerStorageKey);
    if (stored) return stored;
    const created = createOwnerId();
    window.sessionStorage.setItem(ownerStorageKey, created);
    return created;
  } catch {
    memoryOwnerId ??= createOwnerId();
    return memoryOwnerId;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const isCardFilter = (value: unknown): value is CardFilter =>
  value === "new" || value === "review" || value === "both";

const isSessionSize = (value: unknown): value is TrainingSessionSize =>
  value === 5 || value === 10 || value === "all-due-today";

const isWordListType = (value: unknown): value is WordListType =>
  value === "curated" || value === "user";

const isTrainingMode = (value: unknown): value is TrainingMode =>
  value === "word-to-definition" ||
  value === "definition-to-word" ||
  value === "listen-recognize";

const parseResumeRecord = (
  value: unknown,
): StoredTrainingSessionResumeRecord | null => {
  if (!isRecord(value)) return null;
  if (
    typeof value.sessionId !== "string" ||
    typeof value.userId !== "string" ||
    typeof value.ownerId !== "string" ||
    typeof value.languageCode !== "string" ||
    typeof value.scenarioId !== "string" ||
    !isCardFilter(value.cardFilter) ||
    !isSessionSize(value.sessionSize) ||
    !Array.isArray(value.modes) ||
    !value.modes.every(isTrainingMode) ||
    typeof value.newReviewRatio !== "number" ||
    !Number.isFinite(value.newReviewRatio) ||
    !isRecord(value.focusFilter)
  ) {
    return null;
  }
  const listType = value.listType === null ? null : value.listType;
  if (listType !== null && !isWordListType(listType)) return null;
  const listId = value.listId === null ? null : value.listId;
  if (listId !== null && typeof listId !== "string") return null;
  return {
    sessionId: value.sessionId,
    userId: value.userId,
    ownerId: value.ownerId,
    languageCode: value.languageCode,
    listId,
    listType,
    scenarioId: value.scenarioId,
    modes: value.modes,
    cardFilter: value.cardFilter,
    newReviewRatio: value.newReviewRatio,
    focusFilter: value.focusFilter as TrainingFocusFilter,
    sessionSize: value.sessionSize,
  };
};

export function readTrainingSessionResume(
  userId: string,
): TrainingSessionResumeRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const record = parseResumeRecord(JSON.parse(raw));
    if (
      record?.userId !== userId ||
      record.ownerId !== getTrainingSessionOwnerId()
    ) {
      return null;
    }
    const { ownerId: _ownerId, ...resumeRecord } = record;
    return resumeRecord;
  } catch {
    return null;
  }
}

export function writeTrainingSessionResume(
  record: TrainingSessionResumeRecord,
): void {
  if (typeof window === "undefined") return;
  try {
    const stored: StoredTrainingSessionResumeRecord = {
      ...record,
      ownerId: getTrainingSessionOwnerId(),
    };
    window.localStorage.setItem(
      storageKey(record.userId),
      JSON.stringify(stored),
    );
  } catch {
    // A storage quota/privacy failure must not block starting training.
  }
}

export function clearTrainingSessionResume(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return;
    const record = parseResumeRecord(JSON.parse(raw));
    if (
      !record ||
      record.userId !== userId ||
      record.ownerId !== getTrainingSessionOwnerId()
    ) {
      return;
    }
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    // Best-effort cleanup only.
  }
}

export function subscribeTrainingSessionInvalidation(
  userId: string,
  onInvalidate: () => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const ownerId = getTrainingSessionOwnerId();
  const key = storageKey(userId);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== key || !event.newValue) return;
    try {
      const record = parseResumeRecord(JSON.parse(event.newValue));
      if (record?.userId === userId && record.ownerId !== ownerId) {
        onInvalidate();
      }
    } catch {
      // Ignore unrelated or malformed same-origin storage traffic.
    }
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
