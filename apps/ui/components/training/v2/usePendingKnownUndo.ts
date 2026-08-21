"use client";

import React from "react";
import { performPlatformV2TrainingAction } from "@/lib/platform/platformV2TrainingActionClient";
import {
  clearPendingKnownUndo,
  readPendingKnownUndo,
  rememberPendingKnownUndo,
  subscribePendingKnownUndo,
  type PendingKnownUndo,
} from "./pendingKnownUndoStore";

export function usePendingKnownUndo(
  currentPresentationIdentity: string | null,
) {
  const [pendingUndo, setPendingUndo] =
    React.useState<PendingKnownUndo | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const presentationIdentityRef = React.useRef(currentPresentationIdentity);
  const undoAttemptRef = React.useRef(0);
  presentationIdentityRef.current = currentPresentationIdentity;

  React.useEffect(() => {
    undoAttemptRef.current += 1;
    setBusy(false);
    setError(null);
    const sync = () => {
      const pending = readPendingKnownUndo();
      if (
        pending &&
        pending.presentationIdentity !== currentPresentationIdentity
      ) {
        rememberPendingKnownUndo(null);
        setPendingUndo(null);
        return;
      }
      setPendingUndo(pending);
    };
    sync();
    return subscribePendingKnownUndo(sync);
  }, [currentPresentationIdentity]);

  React.useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const visibleUndoKnown =
    pendingUndo?.presentationIdentity === currentPresentationIdentity
      ? pendingUndo.capability
      : null;

  const undo = React.useCallback(async () => {
    if (!visibleUndoKnown || !currentPresentationIdentity) return;
    const attemptPresentationIdentity = currentPresentationIdentity;
    const attempt = (undoAttemptRef.current += 1);
    setBusy(true);
    setError(null);
    try {
      await performPlatformV2TrainingAction(visibleUndoKnown);
      if (
        undoAttemptRef.current !== attempt ||
        presentationIdentityRef.current !== attemptPresentationIdentity
      ) {
        return;
      }
      clearPendingKnownUndo(attemptPresentationIdentity);
      setPendingUndo(null);
    } catch (cause) {
      if (
        undoAttemptRef.current !== attempt ||
        presentationIdentityRef.current !== attemptPresentationIdentity
      ) {
        return;
      }
      setError(cause instanceof Error ? cause.message : "action_failed");
    } finally {
      if (undoAttemptRef.current === attempt) setBusy(false);
    }
  }, [currentPresentationIdentity, visibleUndoKnown]);

  const dismiss = React.useCallback(() => {
    rememberPendingKnownUndo(null);
    setPendingUndo(null);
  }, []);

  return {
    busy,
    error,
    undoKnown: visibleUndoKnown,
    undo,
    dismiss,
    dismissError: () => setError(null),
  };
}
