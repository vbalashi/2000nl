import type { SupabaseClient } from "@supabase/supabase-js";
import { sandboxFulfillmentEnabled } from "./paddleSandboxWebhook";

export type SandboxAccess = { active: false } | {
  active: true;
  plan: "month" | "year";
  validUntil: string;
  endsAfterCancel: boolean;
};

export const sandboxSubscriptionId = /^sub_[a-z0-9]{26}$/;

export async function readSandboxBillingAccess(supabase: SupabaseClient): Promise<{
  access: SandboxAccess;
  subscriptionId: string | null;
}> {
  if (!sandboxFulfillmentEnabled(process.env)) return { access: { active: false }, subscriptionId: null };
  const { data, error } = await supabase.rpc("read_paddle_sandbox_access");
  if (error) throw new Error("sandbox_access_unavailable");
  const subscriptionId = typeof data?.subscriptionId === "string" && sandboxSubscriptionId.test(data.subscriptionId)
    ? data.subscriptionId : null;
  if (data?.active === false) return { access: { active: false }, subscriptionId };
  if (data?.active !== true || (data.plan !== "month" && data.plan !== "year") ||
    typeof data.validUntil !== "string" || !Number.isFinite(Date.parse(data.validUntil)) ||
    typeof data.endsAfterCancel !== "boolean") throw new Error("sandbox_access_unavailable");
  return {
    access: { active: true, plan: data.plan, validUntil: data.validUntil, endsAfterCancel: data.endsAfterCancel },
    subscriptionId,
  };
}

export async function readSandboxAccess(supabase: SupabaseClient): Promise<SandboxAccess> {
  return (await readSandboxBillingAccess(supabase)).access;
}
