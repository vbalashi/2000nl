"use client";
import { useEffect, useRef, useState } from "react";
import { onPlatformV2CardStateChanged } from "@/lib/platform/platformV2CardStateChanges";

export type AccountReadState<T> =
  | { status: "loading" | "error" }
  | { status: "ready"; value: T; refreshing: boolean; refreshFailed: boolean };

/** Keep successful reads while this destination lives. Owner changes discard all scopes.
 * Opening always revalidates, including grades from other exercise families/devices.
 * The loader must be stable and honour the abort signal. */
export function useRetainedAccountRead<T>(scope: string, ownerId: string,
  load: (signal: AbortSignal) => Promise<T>, open: boolean, refresh: number): AccountReadState<T> {
  const retained = useRef({ ownerId, values: new Map<string, T>() });
  const [result, setResult] = useState<{ scope: string; ownerId: string; state: AccountReadState<T> } | null>(null);
  const [revision, setRevision] = useState(0);
  // Synchronous scoping prevents one render of another principal's values.
  if (retained.current.ownerId !== ownerId) retained.current = { ownerId, values: new Map() };
  useEffect(() => {
    const unsubscribe = onPlatformV2CardStateChanged(() => setRevision(n => n + 1));
    return () => { unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!open) return;
    let current = true;
    const controller = new AbortController();
    const cache = retained.current.values;
    const previous = cache.get(scope);
    const ready = (value: T, refreshing: boolean, refreshFailed: boolean): AccountReadState<T> =>
      ({ status: "ready", value, refreshing, refreshFailed });
    const publish = (state: AccountReadState<T>) => {
      if (current) setResult({ scope, ownerId, state });
    };
    publish(cache.has(scope) ? ready(previous!, true, false) : { status: "loading" });
    const timeout = window.setTimeout(() => {
      controller.abort();
      publish(cache.has(scope) ? ready(previous!, false, true) : { status: "error" });
      current = false;
    }, 10000);
    void load(controller.signal).then(value => {
      if (!current) return;
      // Bound language/filter history; this is not a durable browser cache.
      cache.delete(scope);
      cache.set(scope, value);
      if (cache.size > 16) cache.delete(cache.keys().next().value!);
      publish(ready(value, false, false));
    }).catch(() => {
      publish(cache.has(scope) ? ready(previous!, false, true) : { status: "error" });
    }).finally(() => window.clearTimeout(timeout));
    return () => { current = false; controller.abort(); window.clearTimeout(timeout); };
  }, [scope, ownerId, load, open, refresh, revision]);
  if (result?.ownerId === ownerId && result.scope === scope) return result.state;
  return retained.current.values.has(scope)
    ? { status: "ready", value: retained.current.values.get(scope)!, refreshing: open, refreshFailed: false }
    : { status: "loading" };
}
