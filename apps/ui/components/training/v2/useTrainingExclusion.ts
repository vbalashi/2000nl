"use client";
import React from "react";
import type {
  TrainingExclusionRequest,
  TrainingExclusionTarget,
} from "../../../../../packages/shared/types/trainingExclusion";
import { performTrainingExclusion } from "@/lib/platform/trainingExclusionClient";
import { rememberExclusionUndo, subscribeRestoredExclusion } from "./trainingExclusionUndoStore";
/** Freeze an intentional request until accepted; uncertain retries reuse it. */
export function useTrainingExclusion({
  context = "training",
  userId,
  identity,
  sessionId,
  target,
  onAccepted,
  onPendingChange,
  onStarting,
  onSessionSuperseded,
}: {
  context?: "training" | "library";
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
  const acceptedMark = React.useRef<string | null>(null);
  const running = React.useRef(false),
    generation = React.useRef(0);
  React.useEffect(() => {
    const currentGeneration=++generation.current;
    pending.current = null;
    accepted.current = false;
    acceptedMark.current = null;
    running.current = false;
    setBusy(false);
    setFailed(false);
    return () => {
      generation.current=currentGeneration+1;
    };
  }, [identity, userId, sessionId]);
  React.useEffect(()=>subscribeRestoredExclusion((owner,mark)=>{
    if (context === "library" && owner === userId && acceptedMark.current === mark) {
      accepted.current=false;acceptedMark.current=null;setBusy(false);setFailed(false);
    }
  }),[context,userId]);
  const exclude = async () => {
    if (running.current || accepted.current || !userId || (!sessionId && !(context === "library" && target.kind === "headword"))) return;
    running.current = true;
    setBusy(true);
    setFailed(false);
    const current = generation.current;
    const token = {};
    onPendingChange?.(true, token);
    onStarting?.();
    const request: TrainingExclusionRequest = pending.current ?? (target.kind === "headword" ? {
      actionId: "exclude-headword", clientEventId: crypto.randomUUID(), target,
      ...(sessionId ? {trainingSessionId:sessionId} : {}),
    } : {
      actionId: "exclude-pair", clientEventId: crypto.randomUUID(), trainingSessionId: sessionId!, target,
    });
    pending.current = request;
    try {
      const receipt = await performTrainingExclusion(request);
      rememberExclusionUndo({
        userId,
        request: {
          actionId: request.target.kind === "headword" ? "restore-headword" : "restore-pair",
          clientEventId: crypto.randomUUID(),
          exclusionId: receipt.exclusionId,
          target: request.target.kind === "headword" ? { kind: "headword", entryId: request.target.entryId } : request.target,
        },
      });
      if (current !== generation.current) return;
      pending.current = null;
      accepted.current = true;
      acceptedMark.current = receipt.exclusionId;
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
        setBusy(accepted.current);
      }
    }
  };
  return {
    busy: busy || accepted.current,
    failed,
    exclude,
    available: Boolean(userId && (sessionId || (context === "library" && target.kind === "headword"))),
  };
}
