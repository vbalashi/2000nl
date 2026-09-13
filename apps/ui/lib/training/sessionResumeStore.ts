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
const ownerLockKey = (ownerId: string) =>
  `2000nl:training-session-owner:${ownerId}`;
let memoryOwnerId: string | null = null;

type TrainingSessionOwnerStorage = Pick<Storage, "getItem" | "setItem">;
type TrainingSessionOwnerClaim = "acquired" | "occupied" | "unavailable";
type TrainingSessionOwnerLockRequester = (
  name: string,
  hold: (claim: TrainingSessionOwnerClaim) => Promise<void>,
) => void;

type TrainingSessionOwnerCoordinator = {
  resolveOwnerId: () => Promise<string>;
  dispose: () => void;
};

type TrainingSessionOwnerChange = {
  previousOwnerId: string;
  ownerId: string;
};

type StoredTrainingSessionResumeRecord = TrainingSessionResumeRecord & {
  ownerId: string;
};

const createOwnerId = (): string => {
  const randomUuid = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (randomUuid) return randomUuid();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export function createTrainingSessionOwnerCoordinator({
  storage,
  requestLock,
  createOwnerId: createId = createOwnerId,
  previousOwnerId = null,
  onOwnerIdChanged,
}: {
  storage: TrainingSessionOwnerStorage;
  requestLock?: TrainingSessionOwnerLockRequester;
  createOwnerId?: () => string;
  previousOwnerId?: string | null;
  onOwnerIdChanged?: (change: TrainingSessionOwnerChange) => void;
}): TrainingSessionOwnerCoordinator {
  let candidate = storage.getItem(ownerStorageKey) ?? createId();
  storage.setItem(ownerStorageKey, candidate);
  let ownerPromise: Promise<string> | null = null;
  let releaseLease: (() => void) | null = null;
  let disposed = false;

  const resolveCandidate = () => {
    storage.setItem(ownerStorageKey, candidate);
    if (previousOwnerId && previousOwnerId !== candidate) {
      onOwnerIdChanged?.({
        previousOwnerId,
        ownerId: candidate,
      });
    }
    return candidate;
  };

  const claimCandidate = (ownerId: string) =>
    new Promise<TrainingSessionOwnerClaim>((resolve) => {
      if (!requestLock) {
        resolve("acquired");
        return;
      }
      let settled = false;
      let release!: () => void;
      const held = new Promise<void>((resolveHeld) => {
        release = resolveHeld;
      });
      const settle = (claim: TrainingSessionOwnerClaim) => {
        if (settled) return;
        settled = true;
        resolve(claim);
      };
      try {
        requestLock(ownerLockKey(ownerId), async (claim) => {
          settle(claim);
          if (claim !== "acquired") return;
          releaseLease = release;
          if (disposed) release();
          await held;
        });
      } catch {
        settle("unavailable");
      }
    });

  const resolveOwnerId = () => {
    ownerPromise ??= (async () => {
      while (!disposed) {
        const claim = await claimCandidate(candidate);
        if (claim === "acquired" && !disposed) {
          return resolveCandidate();
        }
        candidate = createId();
        storage.setItem(ownerStorageKey, candidate);
        if (claim === "unavailable") return resolveCandidate();
      }
      throw new Error("Training session owner coordinator was disposed");
    })();
    return ownerPromise;
  };

  return {
    resolveOwnerId,
    dispose: () => {
      disposed = true;
      releaseLease?.();
      releaseLease = null;
    },
  };
}

let browserOwnerCoordinator: TrainingSessionOwnerCoordinator | null = null;
let browserOwnerLifecycleInstalled = false;
let browserResolvedOwnerId: string | null = null;
const browserOwnerInvalidationSubscribers = new Set<() => void>();

const createBrowserLockRequester = (): TrainingSessionOwnerLockRequester => {
  if (typeof navigator === "undefined" || !navigator.locks) {
    // Without an exclusive presence primitive, keep ownership collision-safe
    // by rotating instead of trusting a possibly cloned sessionStorage value.
    // Supported browsers retain reload ownership through the Web Locks lease.
    return (_name, hold) => void hold("unavailable");
  }
  return (name, hold) => {
    let callbackStarted = false;
    void navigator.locks
      .request(name, { mode: "exclusive", ifAvailable: true }, async (lock) => {
        callbackStarted = true;
        await hold(lock ? "acquired" : "occupied");
      })
      .catch(() => {
        if (!callbackStarted) void hold("unavailable");
      });
  };
};

const suspendTrainingSessionOwner = (): void => {
  browserOwnerCoordinator?.dispose();
  browserOwnerCoordinator = null;
};

export function releaseTrainingSessionOwner(): void {
  suspendTrainingSessionOwner();
  browserResolvedOwnerId = null;
  memoryOwnerId = null;
}

export function subscribeTrainingSessionOwnerInvalidation(
  onInvalidate: () => void,
): () => void {
  browserOwnerInvalidationSubscribers.add(onInvalidate);
  return () => browserOwnerInvalidationSubscribers.delete(onInvalidate);
}

const getTrainingSessionOwnerId = async (): Promise<string> => {
  if (typeof window === "undefined") {
    memoryOwnerId ??= createOwnerId();
    return memoryOwnerId;
  }
  if (!browserOwnerLifecycleInstalled) {
    browserOwnerLifecycleInstalled = true;
    // BFCache freezes the page but preserves its JavaScript heap. Release the
    // live lease while hidden, retaining the last identity so pageshow can
    // detect whether another tab claimed it in the meantime.
    window.addEventListener("pagehide", suspendTrainingSessionOwner);
    window.addEventListener("pageshow", () => {
      void getTrainingSessionOwnerId().catch(() => undefined);
    });
  }
  try {
    browserOwnerCoordinator ??= createTrainingSessionOwnerCoordinator({
      storage: window.sessionStorage,
      requestLock: createBrowserLockRequester(),
      previousOwnerId: browserResolvedOwnerId,
      onOwnerIdChanged: () => {
        browserOwnerInvalidationSubscribers.forEach((onInvalidate) =>
          onInvalidate(),
        );
      },
    });
    const ownerId = await browserOwnerCoordinator.resolveOwnerId();
    browserResolvedOwnerId = ownerId;
    return ownerId;
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

export async function readTrainingSessionResume(
  userId: string,
): Promise<TrainingSessionResumeRecord | null> {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const record = parseResumeRecord(JSON.parse(raw));
    const ownerId = await getTrainingSessionOwnerId();
    if (
      record?.userId !== userId ||
      record.ownerId !== ownerId ||
      window.localStorage.getItem(storageKey(userId)) !== raw
    ) {
      return null;
    }
    const { ownerId: _ownerId, ...resumeRecord } = record;
    return resumeRecord;
  } catch {
    return null;
  }
}

export async function writeTrainingSessionResume(
  record: TrainingSessionResumeRecord,
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const stored: StoredTrainingSessionResumeRecord = {
      ...record,
      ownerId: await getTrainingSessionOwnerId(),
    };
    window.localStorage.setItem(
      storageKey(record.userId),
      JSON.stringify(stored),
    );
  } catch {
    // A storage quota/privacy failure must not block starting training.
  }
}

export async function clearTrainingSessionResume(userId: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return;
    const record = parseResumeRecord(JSON.parse(raw));
    const ownerId = await getTrainingSessionOwnerId();
    if (
      !record ||
      record.userId !== userId ||
      record.ownerId !== ownerId ||
      window.localStorage.getItem(storageKey(userId)) !== raw
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
  const key = storageKey(userId);
  let disposed = false;
  let removeListener: () => void = () => undefined;
  void getTrainingSessionOwnerId().then((ownerId) => {
    if (disposed) return;
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
    removeListener = () => window.removeEventListener("storage", onStorage);
  });
  return () => {
    disposed = true;
    removeListener();
  };
}
