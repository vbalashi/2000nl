import { useEffect, useState } from "react";
import { authenticatedJsonHeaders } from "@/lib/platform/platformV2Http";

export function useAssistantAccess(userId: string) {
  const [allowedUserId, setAllowedUserId] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setAllowedUserId(null);
    async function read() {
      const response = await fetch("/api/library/card-assistant", {
        headers: await authenticatedJsonHeaders(userId),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) return;
      const access = await response.json();
      if (!controller.signal.aborted && access.userId === userId && access.allowed === true)
        setAllowedUserId(userId);
    }
    if (userId) void read().catch(() => {});
    return () => controller.abort();
  }, [userId]);
  return !!userId && allowedUserId === userId;
}
