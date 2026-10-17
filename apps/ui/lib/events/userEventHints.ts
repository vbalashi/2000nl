"use client";
import { useCallback, useEffect, useRef } from "react";
import { appUserTopic, subscribeAppEvents, subscribeAppEventConnection, type AppEventKind } from "./appEvents";

/** Hints only schedule authoritative reads. Coalesce bursts and reconnects, and
 * defer a read during an optimistic write until its owner explicitly flushes. */
export function subscribeUserEventHints(userId: string | undefined, kinds: readonly AppEventKind[],
  refresh: () => void | Promise<unknown>, blocked: () => boolean = () => false) {
  let disposed = false, dirty = false, running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (disposed || !dirty || running || timer || blocked()) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (disposed || blocked()) return;
      dirty = false;
      running = true;
      void Promise.resolve().then(refresh).catch(() => { /* Read owner reports its own failure. */ }).finally(() => {
        running = false;
        flush();
      });
    }, 0);
  };
  const hint = () => { dirty = true; flush(); };
  let detach = () => {};
  if (userId) {
    // Dev fixtures and signed-out placeholders are not authenticated principals.
    let topic: string | undefined;
    try { topic = appUserTopic(userId); } catch {}
    if (topic) {
      const events = subscribeAppEvents({ topic, kinds }, event => {
        if (event.kind === "account.changed" && event.resourceId && event.resourceId !== "user_settings") return;
        hint();
      });
      let connected = false, safetyTicks = 0;
      const connection = subscribeAppEventConnection(topic, state => {
        connected = state.status === "connected";
        safetyTicks = 0;
        if (connected) hint();
      });
      // Broadcast is best effort even on a healthy connection. A sparse visible
      // reconcile bounds missed hints without reviving frequent healthy polling.
      const safety = setInterval(() => {
        safetyTicks++;
        if (document.visibilityState === "hidden") return;
        if (!connected || safetyTicks >= 15) {
          safetyTicks = 0;
          hint();
        }
      }, 60_000);
      detach = () => { clearInterval(safety); events(); connection(); };
    }
  }
  return { flush, dispose: () => { disposed = true; if (timer) clearTimeout(timer); detach(); } };
}
export function useUserEventHints(userId: string | undefined, kinds: readonly AppEventKind[],
  refresh: () => void | Promise<unknown>, blocked?: () => boolean) {
  const latest = useRef({ refresh, blocked });
  latest.current = { refresh, blocked };
  const subscription = useRef<ReturnType<typeof subscribeUserEventHints>>();
  const kindsKey = kinds.join(",");
  useEffect(() => {
    const current = subscribeUserEventHints(userId, kindsKey.split(",") as AppEventKind[],
      () => latest.current.refresh(), () => latest.current.blocked?.() ?? false);
    subscription.current = current;
    return () => { current.dispose(); };
  }, [userId, kindsKey]);
  return useCallback(() => subscription.current?.flush(), []);
}
