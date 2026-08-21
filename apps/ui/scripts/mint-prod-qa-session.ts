import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import {
  assertQaRequest,
  assertProductionSupabaseUrl,
  parseQaEmailList,
} from "../lib/server/qaIdentityPolicy";
import { mintQaSession } from "../lib/server/qaSession";
import {
  persistQaSessionArtifacts,
  preserveQaRecoverySession,
} from "../lib/server/qaSessionArtifacts";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main(): Promise<void> {
  const requestedEmail = required("QA_TEST_USER_EMAIL");
  const allowedEmails = parseQaEmailList(required("QA_TEST_USER_EMAIL_ALLOWLIST"));
  const referenceEmails = parseQaEmailList(required("QA_REFERENCE_USER_EMAILS"));

  // Identity policy is evaluated before auth clients or session generation.
  assertQaRequest({ requestedEmail, allowedEmails, referenceEmails });

  const url = assertProductionSupabaseUrl(required("NEXT_PUBLIC_SUPABASE_URL"));
  const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || required("SUPABASE_SECRET_KEY");
  const outputDir = path.resolve(required("QA_SESSION_OUTPUT_DIR"));

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const publicClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { session } = await mintQaSession({
    admin,
    publicClient,
    requestedEmail,
    allowedEmails,
    referenceEmails,
    preserveRecoverySession: async (recoverySession) => {
      preserveQaRecoverySession(outputDir, recoverySession);
    },
  });

  await persistQaSessionArtifacts({
    session,
    outputDir,
    revoke: async (accessToken) => {
      const result = await admin.auth.admin.signOut(accessToken, "global");
      if (result.error) throw result.error;
    },
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "QA session mint failed.");
  process.exitCode = 1;
});
