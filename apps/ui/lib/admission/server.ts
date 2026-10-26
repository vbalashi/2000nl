import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export function admissionRequired() { return process.env.ADMISSION_REQUIRED === "true"; }

// Called on every verified identity, including auth-cache hits and service-backed client issuance.
export async function checkAdmission(service: SupabaseClient, userId: string): Promise<NextResponse | null> {
  if (!admissionRequired()) return null;
  try {
    const { data, error } = await service.rpc("admission_check_user", { p_user_id: userId });
    if (error || !data || data.enabled !== true || typeof data.allowed !== "boolean") throw new Error("Admission unavailable");
    if (data.allowed) return null;
    return NextResponse.json({ error: "admission_required" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "admission_unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}

export async function checkAdmissionLazy(factory: () => SupabaseClient | null, userId: string): Promise<NextResponse | null> {
  if (!admissionRequired()) return null;
  try {
    const service = factory();
    if (service) return await checkAdmission(service, userId);
  } catch { /* Fail closed below without provider details. */ }
  return NextResponse.json({ error: "admission_unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
}
