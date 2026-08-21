import { createClient } from "@supabase/supabase-js";
import { assertProductionSupabaseUrl } from "../lib/server/qaIdentityPolicy";
import { readQaRecoveryAccessToken } from "../lib/server/qaSessionRecovery";

async function main(): Promise<void> {
  const sessionPath = process.env.QA_SESSION_JSON_PATH;
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const accessToken = readQaRecoveryAccessToken(sessionPath);
  if (!accessToken) return;
  if (!configuredUrl || !serviceKey) {
    throw new Error("QA revocation configuration is missing for an existing recovery artifact.");
  }
  const url = assertProductionSupabaseUrl(configuredUrl);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init = {}) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
    },
  });
  const { error } = await admin.auth.admin.signOut(accessToken, "global");
  if (error) throw error;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "QA session revocation failed.");
  process.exitCode = 1;
});
