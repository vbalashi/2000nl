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
  requireTrainingSessionId = false,
) {
  const [pendingUndo, setPendingUndo] =
    React.useState<PendingKnownUndo | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const presentationIdentityRef = React.useRef(currentPresentationIdentity);
  const undoAttemptRef = React.useRef(0);
  presentationIdentityRef.current = currentPresentationIdentity;

  React.useEffect(() => {
    undoAttemptRef.current += 1;
    setBusy(false);
    setErrorCode(null);
    const sync = () => {
      const pending = readPendingKnownUndo();
      if (
        pending &&
        (pending.presentationIdentity !== currentPresentationIdentity ||
          (requireTrainingSessionId && !pending.trainingSessionId))
      ) {
        rememberPendingKnownUndo(null);
        setPendingUndo(null);
        return;
      }
      setPendingUndo(pending);
    };
    sync();
    return subscribePendingKnownUndo(sync);
  }, [currentPresentationIdentity, requireTrainingSessionId]);

  React.useEffect(() => {
    if (!errorCode) return;
    const timer = window.setTimeout(() => setErrorCode(null), 5000);
    return () => window.clearTimeout(timer);
  }, [errorCode]);

  const visibleUndoKnown =
    pendingUndo?.presentationIdentity === currentPresentationIdentity &&
    (!requireTrainingSessionId || Boolean(pendingUndo.trainingSessionId))
      ? pendingUndo.capability
      : null;

  const undo = React.useCallback(async () => {
    if (
      !visibleUndoKnown ||
      !currentPresentationIdentity ||
      (requireTrainingSessionId && !pendingUndo?.trainingSessionId)
    ) {
      return;
    }
    const attemptPresentationIdentity = currentPresentationIdentity;
    const attempt = (undoAttemptRef.current += 1);
    setBusy(true);
    setErrorCode(null);
    try {
      await performPlatformV2TrainingAction(visibleUndoKnown, {
        trainingSessionId: pendingUndo?.trainingSessionId,
      });
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
      setErrorCode(cause instanceof Error ? cause.message : "action_failed");
    } finally {
      if (undoAttemptRef.current === attempt) setBusy(false);
    }
  }, [
    currentPresentationIdentity,
    pendingUndo?.trainingSessionId,
    requireTrainingSessionId,
    visibleUndoKnown,
  ]);

  const dismiss = React.useCallback(() => {
    rememberPendingKnownUndo(null);
    setPendingUndo(null);
  }, []);

  return {
    busy,
    errorCode,
    undoKnown: visibleUndoKnown,
    undo,
    dismiss,
    dismissError: () => setErrorCode(null),
  };
}
