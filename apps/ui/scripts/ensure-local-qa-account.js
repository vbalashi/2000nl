#!/usr/bin/env node
/* eslint-disable no-console */

const { createClient } = require("@supabase/supabase-js");
const {
  QA_ACCOUNT_MARKER,
  assertQaAccount,
  assertQaRequest,
  parseQaEmailList,
} = require("../lib/server/qaIdentityPolicy");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) throw new Error("Local Supabase admin configuration is missing.");

  const hostname = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error("Refusing to provision a QA account outside local Supabase.");
  }

  const request = assertQaRequest({
    requestedEmail: process.env.QA_TEST_USER_EMAIL,
    allowedEmails: parseQaEmailList(process.env.QA_TEST_USER_EMAIL_ALLOWLIST),
    referenceEmails: parseQaEmailList(process.env.QA_REFERENCE_USER_EMAILS),
  });
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  let account = data.users.find(
    (user) => String(user.email ?? "").trim().toLowerCase() === request.email
  );

  if (!account) {
    const created = await admin.auth.admin.createUser({
      email: request.email,
      email_confirm: true,
      app_metadata: { [QA_ACCOUNT_MARKER]: true },
    });
    if (created.error) throw created.error;
    account = created.data.user;
  } else if (account.app_metadata?.[QA_ACCOUNT_MARKER] !== true) {
    const updated = await admin.auth.admin.updateUserById(account.id, {
      app_metadata: { ...account.app_metadata, [QA_ACCOUNT_MARKER]: true },
    });
    if (updated.error) throw updated.error;
    account = updated.data.user;
  }

  assertQaAccount(account, request.email);
  console.log("Local dedicated QA identity is ready.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Local QA setup failed.");
  process.exitCode = 1;
});
