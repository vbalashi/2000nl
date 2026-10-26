"use client";
import React from "react";
import { completeMeaningExclusionResume } from "../v2/trainingExclusionUndoStore";
import { useTrainingExclusion } from "../v2/useTrainingExclusion";
import {
  fetchMeaningProgress,
  resumeMeaningProgress,
} from "@/lib/platform/meaningProgressClient";
import type { MeaningLearningProgress } from "../../../../../packages/shared/types/meaningLearningProgress";
/** Exact-Entry actions, including retry identity, belong to this owner hook. */
export function useMeaningLearningActions(
  entryId: string,
  userId: string | undefined,
  progress: MeaningLearningProgress | undefined,
  onChanged?: () => void | Promise<void>,
  protection?: {active: boolean; headword: boolean},
) {
  const [busy, setBusy] = React.useState(false),
    [failed, setFailed] = React.useState(false);
  const pending = React.useRef<{
    progress: MeaningLearningProgress;
    eventId: string;
  }>();
  const exclusion = useTrainingExclusion({
    context: "library",
    userId: userId ?? "",
    identity: `${entryId}:${progress?.exclusionId ?? ""}`,
    sessionId: null,
    target: { kind: "headword", entryId },
    onAccepted: async () => {
      await onChanged?.();
    },
  });
  const resume = async () => {
    if (busy || !userId || protection?.active) return;
    setBusy(true);
    setFailed(false);
    try {
      const request = pending.current ?? {
        progress: await fetchMeaningProgress(entryId),
        eventId: crypto.randomUUID(),
      };
      if(protection?.headword && request.progress.exclusionId)return;
      pending.current = request;
      await resumeMeaningProgress(request.progress, request.eventId);
      completeMeaningExclusionResume(request.progress.exclusionId);
      pending.current = undefined;
      await onChanged?.();
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "meaning_progress_conflict"
      ) {
        pending.current = undefined;
        await onChanged?.();
      }
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return {
    resume,
    exclude: () => { if(!protection?.active && !protection?.headword) return exclusion.exclude(); },
    busy: busy || exclusion.busy,
    failed: failed || exclusion.failed,
  };
}
