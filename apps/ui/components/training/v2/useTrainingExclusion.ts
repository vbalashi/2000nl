"use client";
import React from "react";
import type {
  TrainingExclusionRequest,
  TrainingExclusionTarget,
} from "../../../../../packages/shared/types/trainingExclusion";
import { performTrainingExclusion } from "@/lib/platform/trainingExclusionClient";
import { rememberExclusionUndo } from "./trainingExclusionUndoStore";
/** Freeze an intentional request until accepted; uncertain retries reuse it. */
export function useTrainingExclusion({
  userId,
  identity,
  sessionId,
  target,
  onAccepted,
  onPendingChange,
  onStarting,
  onSessionSuperseded,
}: {
  userId: string;
  identity: string;
  sessionId: string | null | undefined;
  target: TrainingExclusionTarget;
  onAccepted: () => Promise<void>;
  onPendingChange?: (pending: boolean, token: object) => void;
  onStarting?: () => void;
  onSessionSuperseded?: () => void;
}) {
  const [busy, setBusy] = React.useState(false),
    [failed, setFailed] = React.useState(false);
  const pending = React.useRef<TrainingExclusionRequest | null>(null);
  const accepted = React.useRef(false);
  const running = React.useRef(false),
    generation = React.useRef(0);
  React.useEffect(() => {
    const currentGeneration=++generation.current;
    pending.current = null;
    accepted.current = false;
    running.current = false;
    setBusy(false);
    setFailed(false);
    return () => {
      generation.current=currentGeneration+1;
    };
  }, [identity, userId, sessionId]);
  const exclude = async () => {
    if (running.current || accepted.current || !sessionId) return;
    running.current = true;
    setBusy(true);
    setFailed(false);
    const current = generation.current;
    const token = {};
    onPendingChange?.(true, token);
    onStarting?.();
    const request = pending.current ?? {
      actionId: "exclude-pair" as const,
      clientEventId: crypto.randomUUID(),
      trainingSessionId: sessionId,
      target,
    };
    pending.current = request;
    try {
      const receipt = await performTrainingExclusion(request);
      rememberExclusionUndo({
        userId,
        request: {
          actionId: "restore-pair",
          clientEventId: crypto.randomUUID(),
          exclusionId: receipt.exclusionId,
          target: request.target,
        },
      });
      if (current !== generation.current) return;
      pending.current = null;
      accepted.current = true;
      await onAccepted();
    } catch (cause) {
      if (current !== generation.current) return;
      if (cause instanceof Error && cause.message === "training_session_superseded") {
        pending.current=null;
        accepted.current=true;
        onSessionSuperseded?.();
        return;
      }
      setFailed(true);
    } finally {
      onPendingChange?.(false, token);
      if (current === generation.current) {
        running.current = false;
        setBusy(false);
      }
    }
  };
  return {
    busy: busy || accepted.current,
    failed,
    exclude,
    available: Boolean(sessionId),
  };
}
