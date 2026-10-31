"use client";
import { useLayoutEffect, useRef } from "react";
import { beginDisplayedCardLoad, endDisplayedCardLoad } from "./client";

/** Includes display acknowledgement after content preparation, not speculative prefetch. */
export function useCardLoadDiagnostics(
  identity: string,
  phase: "loading" | "ready" | "failed" | "inactive",
) {
  const pending = useRef<string | null>(null);
  useLayoutEffect(
    () => () => {
      if (pending.current) endDisplayedCardLoad(pending.current, "cancelled");
      pending.current = null;
    },
    [identity],
  );
  useLayoutEffect(() => {
    try {
      if (phase === "loading" && !pending.current) {
        pending.current = `training-display-${crypto.randomUUID()}`;
        beginDisplayedCardLoad(pending.current);
      } else if (phase !== "loading" && pending.current) {
        endDisplayedCardLoad(
          pending.current,
          phase === "inactive" ? "cancelled" : phase,
        );
        pending.current = null;
      }
    } catch {
      /* Observations cannot affect the renderer. */
    }
  }, [identity, phase]);
}
