import { describe, expect, it, vi } from "vitest";

import { mintQaSession } from "@/lib/server/qaSession";

const qa = {
  id: "qa-user-id",
  email: "test@2000nl.test",
  app_metadata: { is_qa_test_user: true },
};

function clients(account: any = qa, sessionUser: any = qa) {
  const generateLink = vi.fn(async () => ({
    data: { properties: { email_otp: "otp" } },
    error: null,
  }));
  const listUsers = vi.fn(async () => ({ data: { users: account ? [account] : [] }, error: null }));
  const verifyOtp = vi.fn(async () => ({
    data: { session: { access_token: "access-token", user: sessionUser } },
    error: null,
  }));
  const signOut: any = vi.fn(async () => ({ error: null }));
  return {
    admin: { auth: { admin: { listUsers, generateLink, signOut } } },
    publicClient: { auth: { verifyOtp } },
    spies: { listUsers, generateLink, verifyOtp, signOut },
  };
}

describe("mintQaSession", () => {
  it("fails before account lookup or session generation for a reference identity", async () => {
    const { admin, publicClient, spies } = clients();
    await expect(
      mintQaSession({
        admin,
        publicClient,
        requestedEmail: "owner@example.test",
        allowedEmails: ["owner@example.test"],
        referenceEmails: ["owner@example.test"],
      })
    ).rejects.toThrow(/reference identity/i);
    expect(spies.listUsers).not.toHaveBeenCalled();
    expect(spies.generateLink).not.toHaveBeenCalled();
  });

  it("fails before session generation when the server account lacks the QA marker", async () => {
    const { admin, publicClient, spies } = clients({ ...qa, app_metadata: {} });
    await expect(
      mintQaSession({
        admin,
        publicClient,
        requestedEmail: qa.email,
        allowedEmails: [qa.email],
        referenceEmails: [],
      })
    ).rejects.toThrow(/QA marker/i);
    expect(spies.generateLink).not.toHaveBeenCalled();
  });

  it("rejects a mismatched principal after exchange", async () => {
    const { admin, publicClient, spies } = clients(qa, { ...qa, id: "other-user-id" });
    await expect(
      mintQaSession({
        admin,
        publicClient,
        requestedEmail: qa.email,
        allowedEmails: [qa.email],
        referenceEmails: [],
      })
    ).rejects.toThrow(/principal/i);
    expect(spies.signOut).toHaveBeenCalledWith("access-token", "global");
  });

  it("preserves a recovery session when mismatch revocation also fails", async () => {
    const { admin, publicClient, spies } = clients(qa, { ...qa, id: "other-user-id" });
    spies.signOut.mockResolvedValueOnce({ error: { message: "revoke failed" } });
    const preserveRecoverySession = vi.fn(async () => {});
    await expect(
      mintQaSession({
        admin,
        publicClient,
        requestedEmail: qa.email,
        allowedEmails: [qa.email],
        referenceEmails: [],
        preserveRecoverySession,
      })
    ).rejects.toThrow(/revocation failed/i);
    expect(preserveRecoverySession).toHaveBeenCalledWith(
      expect.objectContaining({ access_token: "access-token" })
    );
  });

  it("returns a session only for the exact marked QA principal", async () => {
    const { admin, publicClient } = clients();
    const result = await mintQaSession({
      admin,
      publicClient,
      requestedEmail: qa.email,
      allowedEmails: [qa.email],
      referenceEmails: [],
    });
    expect(result.identity).toEqual({ id: qa.id, email: qa.email });
    expect(result.session.user.id).toBe(qa.id);
  });
});
