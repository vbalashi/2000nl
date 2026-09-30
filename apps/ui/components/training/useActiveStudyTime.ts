"use client";

import { useEffect, useRef } from "react";
import { ActiveStudyClock, ACTIVE_STUDY_SAMPLE_MS } from "@/lib/training/activeStudyClock";

export type ActiveStudyCardIdentity = {
  ownerId: string;
  sessionId: string;
  family: "meaning" | "idiom" | "sentence";
  cardKey: string;
};

export type ActiveStudyDuration = ActiveStudyCardIdentity & { activeMilliseconds: number };

type Props = {
  /** Null until an authoritative owned session/card has been prepared. */
  identity: ActiveStudyCardIdentity | null;
  /** False during loading, submission, navigation or an application overlay. */
  enabled: boolean;
  /** Synchronously enqueue this measurement; persistence/retries belong outside. */
  onDuration: (duration: ActiveStudyDuration) => void;
};

/** No React state updates or timer animation; one clock per card presentation. */
export function useActiveStudyTime({ identity, enabled, onDuration }: Props): void {
  const enqueueRef = useRef(onDuration);
  enqueueRef.current = onDuration;
  const ownerId = identity?.ownerId;
  const sessionId = identity?.sessionId;
  const family = identity?.family;
  const cardKey = identity?.cardKey;

  useEffect(() => {
    if (!ownerId || !sessionId || !family || !cardKey) return;
    const clock = new ActiveStudyClock();
    const now = () => performance.now();
    const flush = () => {
      const activeMilliseconds = clock.takeMilliseconds(now());
      if (activeMilliseconds > 0) enqueueRef.current({ ownerId, sessionId, family, cardKey, activeMilliseconds });
    };
    const updateAttention = () => {
      clock.setRunning(enabled && document.visibilityState === "visible" && document.hasFocus(), now());
      flush();
    };
    // pagehide is also needed for bfcache/unload: focus/visibility is not enough.
    const leavePage = () => { clock.setRunning(false, now()); flush(); };
    updateAttention();
    const interval = window.setInterval(flush, ACTIVE_STUDY_SAMPLE_MS);
    document.addEventListener("visibilitychange", updateAttention);
    window.addEventListener("focus", updateAttention);
    window.addEventListener("blur", updateAttention);
    window.addEventListener("pagehide", leavePage);
    window.addEventListener("pageshow", updateAttention);
    return () => {
      clock.setRunning(false, now());
      flush();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", updateAttention);
      window.removeEventListener("focus", updateAttention);
      window.removeEventListener("blur", updateAttention);
      window.removeEventListener("pagehide", leavePage);
      window.removeEventListener("pageshow", updateAttention);
    };
  }, [ownerId, sessionId, family, cardKey, enabled]);
}
