"use client";
import { useEffect } from "react";
import { canContinueTrainingSession } from "@/lib/training/sessionLifecycle";
import { clearTrainingSessionResume } from "@/lib/training/sessionResumeStore";

/** All session families share the same home/resume finalization policy. */
export function useTrainingSessionLifecycle(userId: string | undefined, session: {
  sessionId: string;
  completedActions: number;
  plannedTotal: number | null;
  completionReason?: string | null;
  runStatus?: string;
  exhausted?: boolean;
} | null) {
  const resumable = Boolean(session && canContinueTrainingSession(session));
  const sessionId = session?.sessionId;
  useEffect(() => {
    if (userId && sessionId && !resumable) void clearTrainingSessionResume(userId);
  }, [userId, sessionId, resumable]);
  return resumable;
}
