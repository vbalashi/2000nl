"use client";

import {beginProviderAction} from "@/lib/diagnostics/client";
import {useCallback, useLayoutEffect, useRef} from "react";

type Playback = {
  identity: string;
  active: boolean;
  enabled: boolean;
  resolve: (signal: AbortSignal) => Promise<string>;
  onPlay: (url: string) => void | Promise<boolean>;
  onStart?: () => void;
  onError: () => void;
};

/** Audio has its own request lock and never changes the card's action/busy state. */
export function useTrainingAudioPlayback(options: Playback) {
  const latest = useRef(options);
  latest.current = options;
  const pending = useRef<AbortController | null>(null);
  useLayoutEffect(() => () => {
    pending.current?.abort();
    pending.current = null;
  }, [options.identity, options.active]);

  return useCallback(async (trigger: "manual" | "automatic" = "manual") => {
    const operation = latest.current;
    if (!operation.active || !operation.enabled || pending.current) return;
    const finish = trigger === "manual" ? beginProviderAction("audio_playback") : undefined;
    const controller = new AbortController();
    pending.current = controller;
    const isCurrent = () => !controller.signal.aborted &&
      pending.current === controller && latest.current.active &&
      latest.current.identity === operation.identity;
    try {
      operation.onStart?.();
      const url = await operation.resolve(controller.signal);
      if (!isCurrent()) { finish?.("cancelled"); return; }
      const started = await operation.onPlay(url);
      if (!isCurrent()) finish?.("cancelled");
      else if (started === true) finish?.("ready");
      else if (started === false) finish?.("failed");
    } catch (error) {
      finish?.(!isCurrent() ? "cancelled" : error instanceof Error && error.message === "audio_pending" ? "pending" : "failed");
      if (isCurrent()) operation.onError();
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }, []);
}
