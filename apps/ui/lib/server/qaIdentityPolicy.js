const QA_ACCOUNT_MARKER = "is_qa_test_user";
const PRODUCTION_SUPABASE_ORIGIN = "https://lliwdcpuuzjmxyzrjtoz.supabase.co";

function normalizeQaEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function parseQaEmailList(value) {
  return String(value ?? "")
    .split(",")
    .map(normalizeQaEmail)
    .filter(Boolean);
}

function assertQaRequest(input) {
  const email = normalizeQaEmail(input.requestedEmail);
  if (!email) throw new Error("QA test user email is required.");

  const references = new Set(input.referenceEmails.map(normalizeQaEmail).filter(Boolean));
  if (references.has(email)) {
    throw new Error("Refusing to use a primary/reference identity for QA.");
  }

  const allowlist = new Set(input.allowedEmails.map(normalizeQaEmail).filter(Boolean));
  if (allowlist.size === 0) {
    throw new Error("An explicit QA email allowlist is required.");
  }
  if (!allowlist.has(email)) {
    throw new Error("Requested identity is not in the QA email allowlist.");
  }

  return { email };
}

function assertQaAccount(account, expectedEmail) {
  const email = normalizeQaEmail(account?.email);
  const id = String(account?.id ?? "").trim();
  if (!account || !id || email !== normalizeQaEmail(expectedEmail)) {
    throw new Error("Server-read QA account does not match the requested identity.");
  }
  if (account.app_metadata?.[QA_ACCOUNT_MARKER] !== true) {
    throw new Error("Server-read account is missing the required QA marker.");
  }
  return { id, email };
}

function assertQaSessionPrincipal(session, expected) {
  const id = String(session?.user?.id ?? "").trim();
  const email = String(session?.user?.email ?? "").trim();
  if (!id || id !== expected.id || email !== expected.email) {
    throw new Error("Exchanged session principal does not match the verified QA account.");
  }
  return { id, email };
}

function assertProductionSupabaseUrl(value) {
  let origin;
  try {
    const parsed = new URL(String(value ?? ""));
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error("path");
    origin = parsed.origin;
  } catch {
    throw new Error("Production Supabase URL is invalid.");
  }
  if (origin !== PRODUCTION_SUPABASE_ORIGIN) {
    throw new Error("Refusing an unapproved production Supabase origin.");
  }
  return PRODUCTION_SUPABASE_ORIGIN;
}

module.exports = {
  QA_ACCOUNT_MARKER,
  PRODUCTION_SUPABASE_ORIGIN,
  normalizeQaEmail,
  parseQaEmailList,
  assertQaRequest,
  assertQaAccount,
  assertQaSessionPrincipal,
  assertProductionSupabaseUrl,
};
