"use client";

import {useCallback, useLayoutEffect, useRef} from "react";

type Playback = {
  identity: string;
  active: boolean;
  enabled: boolean;
  resolve: (signal: AbortSignal) => Promise<string>;
  onPlay: (url: string) => void;
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

  return useCallback(async () => {
    const operation = latest.current;
    if (!operation.active || !operation.enabled || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const isCurrent = () => !controller.signal.aborted &&
      pending.current === controller && latest.current.active &&
      latest.current.identity === operation.identity;
    try {
      operation.onStart?.();
      const url = await operation.resolve(controller.signal);
      if (isCurrent()) operation.onPlay(url);
    } catch {
      if (isCurrent()) operation.onError();
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }, []);
}
