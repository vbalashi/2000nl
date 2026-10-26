import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { serverSupabaseConfig } from "@/lib/runtime/publicConfig";
import { admissionRequired } from "@/lib/admission/server";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
  if (!admissionRequired()) return reply({ enabled: false, status: "approved", mode: "open" });
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return reply({ error: "unauthorized" }, 401);
  try {
    const config = serverSupabaseConfig();
    if (!config.url || !config.anonKey) throw new Error("Auth unavailable");
    const client = createClient(config.url, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: identity, error: authError } = await client.auth.getUser(token);
    if (authError || !identity.user) return reply({ error: "unauthorized" }, 401);
    const { data, error } = await client.rpc("admission_request");
    if (error || !data || data.enabled !== true) throw new Error("Admission gate unavailable");
    return reply(data);
  } catch { return reply({ error: "admission_unavailable" }, 503); }
}
