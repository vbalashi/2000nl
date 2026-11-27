import { useEffect, useState } from "react";
import { authenticatedJsonHeaders } from "@/lib/platform/platformV2Http";

export function useAssistantAccess(userId: string, enabled = true) {
  const [access, setAccess] = useState<{ userId: string; allowed: boolean } | null>(null);
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
        if (!controller.signal.aborted) {
          setAccess(result?.userId === userId && typeof result.allowed === "boolean"
            ? { userId, allowed: result.allowed }
            : null);
        }
      } catch {
        if (!controller.signal.aborted) setAccess(null);
      }
    }
    void read();
    return () => controller.abort();
  }, [userId, enabled]);
  return access?.userId === userId ? access.allowed : null;
}
