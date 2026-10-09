"use client";
import { useCallback, useRef, useState } from "react";
import type { TrainingSessionProgress } from "@/lib/training/sessionLifecycle";

/** One progress/terminal handoff for exercise runtimes, independent of card content. */
export function useTrainingExerciseProgress(
  session: { sessionId: string; completedActions: number },
  onProgress?: (progress: TrainingSessionProgress) => void,
) {
  const [completed, setCompleted] = useState(session.completedActions);
  const completedRef = useRef(session.completedActions);
  const notifyRef = useRef(onProgress);
  notifyRef.current = onProgress;
  const publish = useCallback((completedActions: number, completionReason: TrainingSessionProgress["completionReason"]) => {
    completedRef.current = completedActions;
    setCompleted(completedActions);
    notifyRef.current?.({ sessionId: session.sessionId, completedActions, completionReason });
    return completedActions;
  }, [session.sessionId]);
  const accept = useCallback(() => publish(completedRef.current + 1, null), [publish]);
  const finish = useCallback((result: {
    status: "completed" | "exhausted";
    completedActions?: number;
  }) => publish(result.completedActions ?? completedRef.current, result.status), [publish]);
  return { completed, accept, finish };
}
