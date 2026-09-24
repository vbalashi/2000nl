import { beforeEach, describe, expect, it, vi } from "vitest";

const { authClient, serviceClient } = vi.hoisted(() => ({
  authClient: { auth: { getSession: vi.fn(), getUser: vi.fn() } },
  serviceClient: { from: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/adminServerClient", () => ({
  createAdminAuthClient: vi.fn(async () => authClient),
  createAdminServiceClient: vi.fn(() => serviceClient),
}));

import { AdminAccessError, requireAdmin } from "@/lib/admin/adminAccess";

const sessionId = "95b81d3e-7000-4000-8000-000000000001";
const accessToken = `header.${Buffer.from(JSON.stringify({ session_id: sessionId })).toString("base64url")}.signature`;
const user = {
  id: "95b81d3e-7000-4000-8000-000000000002",
  email: "operator@example.test",
  email_confirmed_at: "2026-09-24T10:00:00.000Z",
};

function query(result: unknown) {
  const value: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "gt", "order", "range", "limit"]) {
    value[method] = vi.fn(() => value);
  }
  value.maybeSingle = vi.fn(async () => result);
  value.insert = vi.fn(async () => ({ error: null }));
  value.then = (resolve: (result: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return value;
}

function request(path = "/api/admin/dictionaries") {
  return new Request(`https://2000.dilum.io${path}`, {
    headers: { "user-agent": "Admin QA browser", "x-forwarded-for": "198.51.100.7" },
  });
}

describe("admin server authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authClient.auth.getSession.mockResolvedValue({ data: { session: { access_token: accessToken } }, error: null });
    authClient.auth.getUser.mockResolvedValue({ data: { user }, error: null });
    serviceClient.from.mockImplementation((table: string) => {
      if (table === "admin_operators") return query({ data: { email: user.email, user_id: user.id, is_active: true, permissions: ["dictionaries.read", "audit.read"] }, error: null });
      if (table === "admin_operator_sessions") return query({ data: { auth_session_id: sessionId }, error: null });
      if (table === "user_settings") return query({ data: null, error: null });
      if (table === "admin_audit_events") return query(null);
      throw new Error(`Unexpected table ${table}`);
    });
  });

  it("allows only the active operator with a live isolated admin session", async () => {
    await expect(requireAdmin(request(), "dictionaries.read")).resolves.toMatchObject({
      userId: user.id,
      email: user.email,
      permissions: ["dictionaries.read", "audit.read"],
    });
  });

  it("denies unauthenticated requests", async () => {
    authClient.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(requireAdmin(request(), "dictionaries.read")).rejects.toMatchObject({ status: 401, code: "unauthorized" });
  });

  it("denies learner identities even if an operator row is accidentally present", async () => {
    serviceClient.from.mockImplementation((table: string) => {
      if (table === "admin_operators") return query({ data: { email: user.email, user_id: user.id, is_active: true, permissions: ["dictionaries.read"] }, error: null });
      if (table === "admin_operator_sessions") return query({ data: { auth_session_id: sessionId }, error: null });
      if (table === "user_settings") return query({ data: { user_id: user.id }, error: null });
      if (table === "admin_audit_events") return query(null);
      throw new Error(`Unexpected table ${table}`);
    });
    await expect(requireAdmin(request(), "dictionaries.read")).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("denies inactive operators even when an admin session row exists", async () => {
    serviceClient.from.mockImplementation((table: string) => {
      if (table === "admin_operators") return query({ data: { email: user.email, user_id: user.id, is_active: false, permissions: ["dictionaries.read"] }, error: null });
      if (table === "admin_operator_sessions") return query({ data: { auth_session_id: sessionId }, error: null });
      if (table === "user_settings") return query({ data: null, error: null });
      if (table === "admin_audit_events") return query(null);
      throw new Error(`Unexpected table ${table}`);
    });
    await expect(requireAdmin(request(), "dictionaries.read")).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("denies revoked or expired admin sessions", async () => {
    serviceClient.from.mockImplementation((table: string) => {
      if (table === "admin_operators") return query({ data: { email: user.email, user_id: user.id, is_active: true, permissions: ["dictionaries.read"] }, error: null });
      if (table === "admin_operator_sessions") return query({ data: null, error: null });
      if (table === "user_settings") return query({ data: null, error: null });
      if (table === "admin_audit_events") return query(null);
      throw new Error(`Unexpected table ${table}`);
    });
    await expect(requireAdmin(request(), "dictionaries.read")).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("denies operators that lack the requested capability", async () => {
    serviceClient.from.mockImplementation((table: string) => {
      if (table === "admin_operators") return query({ data: { email: user.email, user_id: user.id, is_active: true, permissions: ["audit.read"] }, error: null });
      if (table === "admin_operator_sessions") return query({ data: { auth_session_id: sessionId }, error: null });
      if (table === "user_settings") return query({ data: null, error: null });
      if (table === "admin_audit_events") return query(null);
      throw new Error(`Unexpected table ${table}`);
    });
    await expect(requireAdmin(request(), "dictionaries.read")).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("fails closed when the audit store is unavailable", async () => {
    serviceClient.from.mockImplementation((table: string) => {
      if (table === "admin_operators") return query({ data: { email: user.email, user_id: user.id, is_active: false, permissions: [] }, error: null });
      if (table === "admin_operator_sessions") return query({ data: null, error: null });
      if (table === "user_settings") return query({ data: null, error: null });
      if (table === "admin_audit_events") return { insert: vi.fn(async () => ({ error: new Error("database unavailable") })) };
      throw new Error(`Unexpected table ${table}`);
    });
    await expect(requireAdmin(request(), "dictionaries.read")).rejects.toBeInstanceOf(AdminAccessError);
    await expect(requireAdmin(request(), "dictionaries.read")).rejects.toMatchObject({ status: 503, code: "unavailable" });
  });
});
