import { describe, expect, it } from "vitest";

import {
  assertQaAccount,
  assertQaRequest,
  assertQaSessionPrincipal,
  assertProductionSupabaseUrl,
} from "@/lib/server/qaIdentityPolicy";

const dedicatedQaEmail = "test@2000nl.test";
const referenceEmail = "owner@example.test";

describe("QA identity policy", () => {
  it("rejects an unapproved production Supabase origin", () => {
    expect(() => assertProductionSupabaseUrl("https://attacker.example/")).toThrow(/unapproved/i);
    expect(assertProductionSupabaseUrl("https://lliwdcpuuzjmxyzrjtoz.supabase.co")).toBe(
      "https://lliwdcpuuzjmxyzrjtoz.supabase.co"
    );
  });
  it("rejects a primary/reference identity before any account lookup", () => {
    expect(() =>
      assertQaRequest({
        requestedEmail: referenceEmail,
        allowedEmails: [dedicatedQaEmail, referenceEmail],
        referenceEmails: [referenceEmail],
      })
    ).toThrow(/reference identity/i);
  });

  it("requires an explicit allowlist", () => {
    expect(() =>
      assertQaRequest({
        requestedEmail: dedicatedQaEmail,
        allowedEmails: [],
        referenceEmails: [referenceEmail],
      })
    ).toThrow(/allowlist/i);
  });

  it("accepts only the requested allowlisted identity", () => {
    expect(
      assertQaRequest({
        requestedEmail: dedicatedQaEmail.toUpperCase(),
        allowedEmails: [dedicatedQaEmail],
        referenceEmails: [referenceEmail],
      })
    ).toEqual({ email: dedicatedQaEmail });
  });

  it("requires the durable QA marker on the server-read account", () => {
    expect(() =>
      assertQaAccount(
        {
          id: "qa-user-id",
          email: dedicatedQaEmail,
          app_metadata: {},
        },
        dedicatedQaEmail
      )
    ).toThrow(/QA marker/i);
  });

  it("rejects a session whose principal does not exactly match the marked account", () => {
    expect(() =>
      assertQaSessionPrincipal(
        {
          user: { id: "different-user-id", email: dedicatedQaEmail },
        },
        { id: "qa-user-id", email: dedicatedQaEmail }
      )
    ).toThrow(/principal/i);
  });

  it("rejects a session email that differs even only by case", () => {
    expect(() =>
      assertQaSessionPrincipal(
        {
          user: { id: "qa-user-id", email: dedicatedQaEmail.toUpperCase() },
        },
        { id: "qa-user-id", email: dedicatedQaEmail }
      )
    ).toThrow(/principal/i);
  });
});
