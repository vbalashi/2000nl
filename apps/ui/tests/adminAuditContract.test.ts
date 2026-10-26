import { describe, expect, it } from "vitest";
import { projectAdminAuditEvent, type AdminAuditRecord } from "@/lib/admin/auditContract";

describe("admin audit projection", () => {
  it("retains the event's own client context and strips unrelated record fields", () => {
    const projected = projectAdminAuditEvent({
      id: "event-1",
      created_at: "2026-09-24T12:00:00.000Z",
      operator_user_id: null,
      action: "access.denied",
      target_type: "request",
      target_id: "/api/admin/dictionaries",
      outcome: "denied",
      request_id: "trace-1",
      client_ip: "198.51.100.7",
      user_agent: "Admin QA browser",
      bearer_token: "must-not-escape",
      session_token: "must-not-escape",
      request_body: "must-not-escape",
    } as unknown as AdminAuditRecord);

    expect(projected).toEqual({
      id: "event-1",
      occurredAt: "2026-09-24T12:00:00.000Z",
      operatorId: null,
      action: "access.denied",
      target: "request: /api/admin/dictionaries",
      outcome: "denied",
      correlationId: "trace-1",
      clientContext: {
        ipAddress: "198.51.100.7",
        userAgent: "Admin QA browser",
      },
    });
  });

  it("rejects unsupported events rather than turning them into a known action", () => {
    const projected = projectAdminAuditEvent({
      id: "event-2",
      created_at: "2026-09-24T12:00:00.000Z",
      operator_user_id: "operator-1",
      action: "auth.provider.full-history",
      target_type: "provider",
      target_id: "provider",
      outcome: "success",
      request_id: "trace-2",
      client_ip: null,
      user_agent: null,
    } as unknown as AdminAuditRecord);
    expect(projected).toBeNull();
  });
});
