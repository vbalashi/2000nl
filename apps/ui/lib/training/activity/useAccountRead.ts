"use client";
import { useCallback } from "react";
import { authenticatedAccountRequest } from "@/lib/preferences/accountRequest";
import { useRetainedAccountRead } from "./useRetainedAccountRead";
export type { AccountReadState } from "./useRetainedAccountRead";

/** Account-scoped GET; successful content survives background revalidation.
 * `parse` must be stable (module-level or memoized). */
export function useAccountRead<T>(path: string, ownerId: string, parse: (body: unknown) => T | null, open: boolean, refresh: number) {
  const load = useCallback(async (signal: AbortSignal) => {
    const response = await authenticatedAccountRequest(path, ownerId, { method: "GET", signal });
    const value = response.ok ? parse(await response.json()) : null;
    if (value === null) throw new Error("account_read_unavailable");
    return value;
  }, [path, ownerId, parse]);
  return useRetainedAccountRead(path, ownerId, load, open, refresh);
}
