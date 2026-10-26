import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
const { auth, rpc } = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/platform/serverSupabase", () => ({ getAuthenticatedSupabase: auth, jsonNoStore: (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } }) }));
import { GET } from "@/app/api/training/activity/route";
import { shiftDate } from "@/lib/training/activity/model";

const get = (suffix = "?language=nl") => new NextRequest(`http://localhost/api/training/activity${suffix}`);
const calendar = (today = "2026-09-30") => ({
  timezone: "Europe/Amsterdam", today, coverageStartedAt: "2026-09-30T18:54:00Z",
  days: Array.from({ length: 366 }, (_, i) => ({ date: shiftDate(today, i - 365), newCount: i === 365 ? 2 : 0, reviewCount: 0, activeMilliseconds: i === 365 ? 249436 : 0 })),
});
beforeEach(() => { vi.clearAllMocks(); auth.mockResolvedValue({ supabase: { rpc }, principal: { authKind: "first_party" } }); rpc.mockResolvedValue({ data: calendar(), error: null }); });

test("authenticates first-party learners before any read", async () => {
  auth.mockResolvedValue(Response.json({ error: "unauthorized" }, { status: 401 }));
  expect((await GET(get())).status).toBe(401);
  auth.mockResolvedValue({ principal: { authKind: "connected_client" } });
  expect((await GET(get())).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});

test("reads one server-anchored year for the requested language and returns only validated fields", async () => {
  rpc.mockResolvedValue({ data: { ...calendar(), internal: "hidden" }, error: null });
  const response = await GET(get());
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual(calendar());
  expect(rpc).toHaveBeenCalledWith("get_training_activity_days_v1", { p_language_code: "nl", p_days: 366 });
});

test("rejects missing/invalid language and unsupported identity or day hints", async () => {
  for (const suffix of ["", "?language=Dutch", "?language=nl&userId=victim", "?language=nl&today=2026-01-01", "?language=nl&days=10"])
    expect((await GET(get(suffix))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});

test("fails closed on errors, gaps and malformed counts", async () => {
  const bad = calendar();
  for (const data of [{ error: "unauthorized" }, { ...bad, days: bad.days.slice(1) }, { ...bad, days: bad.days.map((d, i) => i === 3 ? { ...d, reviewCount: -1 } : d) },
    { ...bad, days: bad.days.map((d, i) => i === 200 ? { ...d, date: "2026-01-01" } : d) }, { ...bad, today: "2026-10-01" }]) {
    rpc.mockResolvedValue({ data, error: null });
    expect(await (await GET(get())).json()).toEqual({ error: "activity_unavailable" });
  }
  rpc.mockResolvedValue({ data: null, error: { message: "private" } });
  expect((await GET(get())).status).toBe(503);
  rpc.mockRejectedValue(new Error("network"));
  expect((await GET(get())).status).toBe(503);
});
