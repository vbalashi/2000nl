import { afterEach, expect, test, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { getSession } } }));
import { deliverStudyTime } from "@/lib/training/studyTime/delivery";

const duration = {
  sessionId: "11111111-1111-4111-8111-111111111111", family: "meaning" as const,
  cardKey: "card", activeMilliseconds: 15000,
  target: { entryId: "22222222-2222-4222-8222-222222222222", cardTypeId: "word-to-definition", targetId: null },
};
const session = (id: string) => ({ data: { session: { user: { id }, access_token: "test-only-token" } }, error: null });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

test("actual delivery authenticates the first-party request for the captured owner", async () => {
  getSession.mockResolvedValue(session("delivery-owner"));
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accepted: true, duplicate: false }) });
  vi.stubGlobal("fetch", fetch);
  deliverStudyTime({ ...duration, ownerId: "delivery-owner" });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(fetch.mock.calls[0]).toEqual(["/api/training/study-time", expect.objectContaining({
    method: "POST", keepalive: true, cache: "no-store",
    headers: { "content-type": "application/json", authorization: "Bearer test-only-token" },
  })]);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
    sessionId: duration.sessionId, entryId: duration.target.entryId, activeMilliseconds: 15000,
  });
});

test("a switch between queue guard and token capture cannot send under the next account", async () => {
  getSession.mockResolvedValueOnce(session("previous-owner")).mockResolvedValue(session("next-owner"));
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  deliverStudyTime({ ...duration, ownerId: "previous-owner" });
  await vi.waitFor(() => expect(getSession).toHaveBeenCalledTimes(2));
  expect(fetch).not.toHaveBeenCalled();
  // The bounded retry still rechecks its owner; it will discard the receipt.
  await vi.waitFor(() => expect(getSession).toHaveBeenCalledTimes(3), { timeout: 1500 });
  expect(fetch).not.toHaveBeenCalled();
});
