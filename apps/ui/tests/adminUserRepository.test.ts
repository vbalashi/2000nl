import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/adminServerClient", () => ({
  createAdminServiceClient: () => ({ rpc }),
}));
import { listAdminUsers } from "@/lib/admin/userRepository";

const rows = (count: number) => Array.from({ length: count }, (_, index) => ({
  user_id: `account-${index}`,
  email: null,
  created_at: "2026-10-01T00:00:00Z",
  last_sign_in_at: null,
  personal_list_count: 0,
  personal_entry_link_count: 0,
}));

beforeEach(() => rpc.mockReset());

describe("admin registry pagination boundary", () => {
  it.each([25, 50, 100] as const)("uses visible page size %i for the RPC and hides lookahead", async pageSize => {
    rpc.mockResolvedValue({ data: rows(pageSize + 1), error: null });
    const result = await listAdminUsers({ query: "needle", page: 2, pageSize });
    expect(rpc).toHaveBeenCalledWith("admin_user_registry_page", {
      p_query: "needle", p_user_id: null, p_page: 2, p_page_size: pageSize,
    });
    expect(result.items).toHaveLength(pageSize);
    expect(result.returned).toBe(pageSize);
    expect(result.hasNext).toBe(true);
  });

  it.each([0, 7, 25])("does not advertise a next page for %i returned rows", async count => {
    rpc.mockResolvedValue({ data: rows(count), error: null });
    const result = await listAdminUsers({ query: null, page: 3, pageSize: 25 });
    expect(result.items).toHaveLength(count);
    expect(result.hasNext).toBe(false);
  });
});
