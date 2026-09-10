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

const parseResumeRecord = (value: unknown): TrainingSessionResumeRecord | null => {
  if (!isRecord(value)) return null;
  if (
    typeof value.sessionId !== "string" ||
    typeof value.userId !== "string" ||
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
    return record?.userId === userId ? record : null;
  } catch {
    return null;
  }
}

export function writeTrainingSessionResume(
  record: TrainingSessionResumeRecord,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(record.userId), JSON.stringify(record));
  } catch {
    // A storage quota/privacy failure must not block starting training.
  }
}

export function clearTrainingSessionResume(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    // Best-effort cleanup only.
  }
}
