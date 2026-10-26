import { createHealthSupabaseClient } from "@/lib/server/healthSupabase";
import { admissionRequired } from "./server";
export async function checkAdmissionHealth(): Promise<{ status: "ok" | "warning"; message?: string }> {
  try {
    const service = createHealthSupabaseClient();
    if (!service) return { status: "warning", message: "Admission configuration unavailable" };
    const { data, error } = await service.rpc("admission_check_user", { p_user_id: null });
    if (error || !data || data.enabled !== admissionRequired()) return { status: "warning", message: "Application and database admission gates do not match" };
    return { status: "ok" };
  } catch { return { status: "warning", message: "Admission configuration unavailable" }; }
}
