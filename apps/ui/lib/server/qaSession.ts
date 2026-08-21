import {
  assertQaAccount,
  assertQaRequest,
  assertQaSessionPrincipal,
  type VerifiedQaIdentity,
} from "./qaIdentityPolicy";

type AdminUser = {
  id?: string | null;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
};

type QaSession = {
  access_token: string;
  user: {
    id?: string | null;
    email?: string | null;
  };
};

type AdminClient = {
  auth: {
    admin: {
      listUsers(input: { page: number; perPage: number }): Promise<{
        data: { users: AdminUser[] } | null;
        error: { message?: string } | null;
      }>;
      generateLink(input: { type: "magiclink"; email: string }): Promise<{
        data: { properties?: { email_otp?: string | null } | null } | null;
        error: { message?: string } | null;
      }>;
      signOut(token: string, scope: "global"): Promise<{
        error: { message?: string } | null;
      }>;
    };
  };
};

type PublicClient = {
  auth: {
    verifyOtp(input: { email: string; token: string; type: "email" }): Promise<{
      data: { session: QaSession | null } | null;
      error: { message?: string } | null;
    }>;
  };
};

async function findAccount(admin: AdminClient, email: string): Promise<AdminUser | null> {
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage });
    if (result.error) throw new Error(result.error.message || "Failed to read QA account.");
    const users = result.data?.users ?? [];
    const found = users.find((user) => user.email?.trim().toLowerCase() === email);
    if (found) return found;
    if (users.length < perPage) return null;
  }
}

export async function mintQaSession(input: {
  admin: AdminClient;
  publicClient: PublicClient;
  requestedEmail: string | null | undefined;
  allowedEmails: readonly string[];
  referenceEmails: readonly string[];
  preserveRecoverySession?: (session: QaSession) => Promise<void>;
}): Promise<{ session: QaSession; identity: VerifiedQaIdentity }> {
  const request = assertQaRequest(input);
  const account = await findAccount(input.admin, request.email);
  const identity = assertQaAccount(account, request.email);

  const link = await input.admin.auth.admin.generateLink({
    type: "magiclink",
    email: identity.email,
  });
  const otp = link.data?.properties?.email_otp;
  if (link.error || !otp) {
    throw new Error(link.error?.message || "Failed to generate QA login token.");
  }

  const verified = await input.publicClient.auth.verifyOtp({
    email: identity.email,
    token: otp,
    type: "email",
  });
  const session = verified.data?.session;
  if (verified.error || !session) {
    throw new Error(verified.error?.message || "Failed to exchange QA login token.");
  }
  try {
    assertQaSessionPrincipal(session, identity);
  } catch (principalError) {
    const revoked = await input.admin.auth.admin.signOut(session.access_token, "global");
    if (revoked.error) {
      let recoveryError: unknown = null;
      try {
        await input.preserveRecoverySession?.(session);
      } catch (error) {
        recoveryError = error;
      }
      throw new AggregateError(
        [
          principalError,
          new Error(revoked.error.message || "Failed to revoke mismatched QA session."),
          ...(recoveryError ? [recoveryError] : []),
        ],
        "QA principal mismatch and session revocation failed.",
      );
    }
    throw principalError;
  }
  return { session, identity };
}
