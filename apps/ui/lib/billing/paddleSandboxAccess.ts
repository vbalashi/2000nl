import type { SupabaseClient } from "@supabase/supabase-js";
import { sandboxFulfillmentEnabled } from "./paddleSandboxWebhook";

export type SandboxAccess = { active: false } | {
  active: true;
  plan: "month" | "year";
  validUntil: string;
  endsAfterCancel: boolean;
};

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
