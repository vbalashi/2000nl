"use client";
import { useEffect, useState } from "react";
import { authenticatedAccountRequest } from "@/lib/preferences/accountRequest";

export type AccountReadState<T> = { status: "loading" | "error" } | { status: "ready"; value: T };

/** Bounded first-party GET for one account; stale scopes never flash another account's data.
 * `parse` must be stable (module-level or memoized). */
export function useAccountRead<T>(path: string, ownerId: string, parse: (body: unknown) => T | null, open: boolean, refresh: number): AccountReadState<T> {
  const key = JSON.stringify([path, ownerId, refresh]);
  const [result, setResult] = useState<{ key: string; state: AccountReadState<T> } | null>(null);
  useEffect(() => {
    if (!open) return;
    let current = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    setResult({ key, state: { status: "loading" } });
    void authenticatedAccountRequest(path, ownerId, { method: "GET", signal: controller.signal })
      .then(async response => {
        const value = response.ok ? parse(await response.json()) : null;
        if (value === null) throw new Error("account_read_unavailable");
        if (current) setResult({ key, state: { status: "ready", value } });
      })
      .catch(() => { if (current) setResult({ key, state: { status: "error" } }); })
      .finally(() => window.clearTimeout(timeout));
    return () => { current = false; controller.abort(); window.clearTimeout(timeout); };
  }, [key, path, ownerId, parse, open]);
  return result?.key === key ? result.state : { status: "loading" };
}
