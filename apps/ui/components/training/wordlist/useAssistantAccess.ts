import { useCallback, useEffect, useState } from "react";
import { authenticatedJsonHeaders } from "@/lib/platform/platformV2Http";
import { readAssistantAllowances, type AssistantAllowances } from "@/lib/platform/assistantAllowanceContract";

type Access = { userId: string; allowed: boolean; allowances: AssistantAllowances | null };

export function useAssistantAccess(userId: string, enabled = true) {
  const [access, setAccess] = useState<Access | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!userId || !enabled) return;
    const controller = new AbortController();
    async function read() {
      try {
        const response = await fetch("/api/library/card-assistant", {
          headers: await authenticatedJsonHeaders(userId),
          signal: controller.signal,
          cache: "no-store",
        });
        const result = response.ok ? await response.json() : null;
        if (!controller.signal.aborted)
          setAccess(result?.userId === userId && typeof result.allowed === "boolean"
            ? { userId, allowed: result.allowed, allowances: readAssistantAllowances(result.allowances) }
            : null);
      } catch {
        if (!controller.signal.aborted) setAccess(null);
      }
    }
    void read();
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
    };
  }, [userId, enabled, revision, refresh]);
  const current = access?.userId === userId ? access : null;
  return { allowed: current?.allowed ?? null, allowances: current?.allowances ?? null, refresh };
}
