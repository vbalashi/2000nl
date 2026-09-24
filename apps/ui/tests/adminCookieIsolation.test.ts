import { expect, it, vi } from "vitest";
const { store } = vi.hoisted(() => ({ store: { getAll: vi.fn(), set: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => store }));
import { clearAdminAuthCookies } from "@/lib/admin/adminServerClient";
it("removes admin chunks and PKCE cookies while preserving learner cookies", async () => {
  const names = ["2000nl-admin-auth", "2000nl-admin-auth.0", "2000nl-admin-auth.1", "2000nl-admin-auth-code-verifier", "sb-project-auth-token", "other"];
  store.getAll.mockReturnValue(names.map(name => ({ name, value: "secret" })));
  await clearAdminAuthCookies();
  expect(store.set.mock.calls.map(call => call[0])).toEqual(names.slice(0, 4));
  for (const call of store.set.mock.calls) expect(call).toEqual([expect.any(String), "", expect.objectContaining({ maxAge: 0, path: "/", httpOnly: true })]);
});
