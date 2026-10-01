"use client";

import { useEffect, useRef } from "react";
import { ActiveStudyClock, ACTIVE_STUDY_SAMPLE_MS, type ActiveStudyCardIdentity, type ActiveStudyDuration } from "@/lib/training/activeStudyClock";

export type { ActiveStudyCardIdentity, ActiveStudyDuration } from "@/lib/training/activeStudyClock";

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
  const entryId = identity?.target?.entryId;
  const cardTypeId = identity?.target?.cardTypeId;
  const targetId = identity?.target?.targetId;

  useEffect(() => {
    if (!ownerId || !sessionId || !family || !cardKey) return;
    const target = entryId ? { entryId, cardTypeId: cardTypeId ?? null, targetId: targetId ?? null } : undefined;
    const clock = new ActiveStudyClock();
    const now = () => performance.now();
    const flush = () => {
      const activeMilliseconds = clock.takeMilliseconds(now());
      if (activeMilliseconds > 0) enqueueRef.current({ ownerId, sessionId, family, cardKey, ...(target ? { target } : {}), activeMilliseconds });
    };
    let pageActive = true;
    const hasOverlay = () => [...document.querySelectorAll("dialog[open], [role='dialog'][aria-modal='true'], [role='menu']")]
      .some(element => !element.closest("[hidden], [aria-hidden='true']") && getComputedStyle(element).display !== "none");
    const updateAttention = () => {
      clock.setRunning(pageActive && enabled && document.visibilityState === "visible" && document.hasFocus() && !hasOverlay(), now());
      flush();
    };
    // pagehide is also needed for bfcache/unload: focus/visibility is not enough.
    const leavePage = () => { pageActive = false; clock.setRunning(false, now()); flush(); };
    const returnPage = () => { pageActive = true; updateAttention(); };
    updateAttention();
    const overlays = new MutationObserver(updateAttention);
    overlays.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open", "hidden", "aria-hidden", "aria-modal", "role"] });
    const interval = window.setInterval(flush, ACTIVE_STUDY_SAMPLE_MS);
    document.addEventListener("visibilitychange", updateAttention);
    window.addEventListener("focus", updateAttention);
    window.addEventListener("blur", updateAttention);
    window.addEventListener("pagehide", leavePage);
    window.addEventListener("pageshow", returnPage);
    return () => {
      clock.setRunning(false, now());
      flush();
      overlays.disconnect();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", updateAttention);
      window.removeEventListener("focus", updateAttention);
      window.removeEventListener("blur", updateAttention);
      window.removeEventListener("pagehide", leavePage);
      window.removeEventListener("pageshow", returnPage);
    };
  }, [ownerId, sessionId, family, cardKey, enabled, entryId, cardTypeId, targetId]);
}
