import type { SupabaseClient } from "@supabase/supabase-js";
import { sandboxFulfillmentEnabled } from "./paddleSandboxWebhook";

export type SandboxAccess = { active: false } | {
  active: true;
  plan: "month" | "year";
  validUntil: string;
  endsAfterCancel: boolean;
};

export function readSandboxPortalUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin === "https://sandbox-customer-portal.paddle.com" &&
      !url.username && !url.password && !url.search && !url.hash &&
      /^\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname) ? url.href : null;
  } catch {
    return null;
  }
}

export async function readSandboxAccess(supabase: SupabaseClient): Promise<SandboxAccess> {
  if (!sandboxFulfillmentEnabled(process.env)) return { active: false };
  const { data, error } = await supabase.rpc("read_paddle_sandbox_access");
  if (error) throw new Error("sandbox_access_unavailable");
  if (data?.active === false) return { active: false };
  if (data?.active !== true || (data.plan !== "month" && data.plan !== "year") ||
    typeof data.validUntil !== "string" || !Number.isFinite(Date.parse(data.validUntil)) ||
    typeof data.endsAfterCancel !== "boolean") throw new Error("sandbox_access_unavailable");
  return { active: true, plan: data.plan, validUntil: data.validUntil, endsAfterCancel: data.endsAfterCancel };
}
