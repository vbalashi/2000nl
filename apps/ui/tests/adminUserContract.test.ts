import { describe, expect, it } from "vitest";
import { parseAdminUserRegistryQuery, projectAdminUserRegistryRow } from "@/lib/admin/userContract";

describe("admin user registry contract", () => {
  it("bounds search input and accepts only supported page sizes", () => {
    const params = new URLSearchParams({ q: `  ${"x".repeat(140)}  `, page: "20001", pageSize: "75" });
    const result = parseAdminUserRegistryQuery(params);
    expect(result.query).toHaveLength(128);
    expect(result.page).toBe(10_000);
    expect(result.pageSize).toBe(25);
  });

  it("distinguishes unknown sign-in time from confirmed zero counts", () => {
    expect(projectAdminUserRegistryRow({
      user_id: "user-1",
      email: null,
      created_at: "2026-10-01T10:00:00Z",
      last_sign_in_at: null,
      personal_list_count: 0,
      personal_entry_link_count: 0,
    })).toEqual({
      userId: "user-1",
      email: null,
      createdAt: "2026-10-01T10:00:00Z",
      lastSignInAt: null,
      personalListCount: 0,
      personalEntryLinkCount: 0,
    });
  });

  it("drops malformed rows instead of fabricating profile facts", () => {
    expect(projectAdminUserRegistryRow({ user_id: "user-1", created_at: "unknown" })).toBeNull();
  });
});
