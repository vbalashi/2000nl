import type { PlatformSenseCardCapabilityV2 } from "../../../../../packages/shared/types/platformV2";

export type UndoKnownCapability = Extract<
  PlatformSenseCardCapabilityV2,
  { actionId: "undo-known" }
>;

export type PendingKnownUndo = {
  capability: UndoKnownCapability;
  presentationIdentity: string;
};

const STORAGE_KEY = "2000nl.training.pendingKnownUndo.v2";
const CHANGE_EVENT = "2000nl:training-pending-known-undo";

let memoryPendingKnownUndo: PendingKnownUndo | null = null;

export function readPendingKnownUndo(): PendingKnownUndo | null {
  if (typeof window === "undefined") return memoryPendingKnownUndo;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      if (memoryPendingKnownUndo) {
        persistPendingKnownUndo(memoryPendingKnownUndo);
      }
      return memoryPendingKnownUndo;
    }
    const pending = parsePendingKnownUndo(raw);
    if (pending) {
      memoryPendingKnownUndo = pending;
      return pending;
    }
    memoryPendingKnownUndo = null;
    window.sessionStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    return memoryPendingKnownUndo;
  }
}

export function rememberPendingKnownUndo(pending: PendingKnownUndo | null) {
  memoryPendingKnownUndo = pending;
  persistPendingKnownUndo(pending);
  dispatchPendingKnownUndoChange();
}

export function clearPendingKnownUndo(presentationIdentity: string) {
  const pending = readPendingKnownUndo();
  if (pending?.presentationIdentity === presentationIdentity) {
    rememberPendingKnownUndo(null);
  }
}

export function subscribePendingKnownUndo(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

function parsePendingKnownUndo(raw: string): PendingKnownUndo | null {
  try {
    const pending = JSON.parse(raw) as PendingKnownUndo;
    return typeof pending.presentationIdentity === "string" &&
      pending.presentationIdentity &&
      pending.capability?.actionId === "undo-known"
      ? pending
      : null;
  } catch {
    return null;
  }
}

function persistPendingKnownUndo(pending: PendingKnownUndo | null) {
  if (typeof window === "undefined") return;
  try {
    if (pending) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // The module-level store remains authoritative within this tab.
  }
}

function dispatchPendingKnownUndoChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
