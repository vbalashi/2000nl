import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
const { auth, rpc } = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/platform/serverSupabase", () => ({ getAuthenticatedSupabase: auth, jsonNoStore: (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } }) }));
import { POST } from "@/app/api/training/availability/route";
const owner = "11111111-1111-4111-8111-111111111111";
const list = "22222222-2222-4222-8222-222222222222";
const draft = () => ({ family: "meaning", scenarioId: "understanding", modes: ["word-to-definition"], cardFilter: "review", listValue: `user:${list}`, newReviewRatio: 50, dateWindow: "all", sourceValue: "all", sessionSize: 5 });
const recipe = () => ({ languageCode: "nl", draft: draft() });
const value = () => ({ dueToday: 2, totalReviews: 10, newCards: 5, studyDay: "2026-10-03", timezone: "Europe/Amsterdam", asOf: "2026-10-03T12:00:00Z" });
const request = (body: unknown) => new NextRequest("http://localhost/api/training/availability", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); auth.mockResolvedValue({ user: { id: owner }, principal: { authKind: "first_party" }, supabase: { rpc } }); rpc.mockResolvedValue({ data: value(), error: null }); });
test("requires first-party authentication before reading or parsing", async () => {
  auth.mockResolvedValue(Response.json({ error: "unauthorized" }, { status: 401 })); expect((await POST(request(recipe()))).status).toBe(401);
  auth.mockResolvedValue({ principal: { authKind: "connected_client" } }); expect((await POST(request(recipe()))).status).toBe(403); expect(rpc).not.toHaveBeenCalled();
});
test("uses the server principal and projects only the display counters", async () => {
  rpc.mockResolvedValue({ data: { ...value(), ownerId: "private", entries: ["private"] }, error: null });
  const response = await POST(request(recipe())); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store"); expect(await response.json()).toEqual(value());
  expect(rpc).toHaveBeenCalledWith("read_training_recipe_availability_v1", { p_user_id: owner, p_card_type_ids: ["word-to-definition"], p_list_id: list, p_list_type: "user", p_training_filter: { dateWindow: "all" }, p_exercise_family: "meaning" });
});
test("maps idiom both and contextual Translation onto authoritative families", async () => {
  await POST(request({ languageCode: "nl", draft: { ...draft(), family: "idiom", scenarioId: "idiom", modes: ["word-to-definition", "definition-to-word"], materialMode: "all-dictionaries" } }));
  expect(rpc.mock.calls[0][1]).toMatchObject({ p_exercise_family: "idiom", p_card_type_ids: ["idiom:direct", "idiom:reverse"], p_list_id: null, p_training_filter: { dictionaryScope: { mode: "all", languageCode: "nl" } } });
  await POST(request({ languageCode: "nl", draft: { ...draft(), family: "word-in-context", modes: ["definition-to-word"] } })); expect(rpc.mock.calls[1][1]).toMatchObject({ p_exercise_family: "meaning", p_training_filter: { presentationMode: "word-in-context" } });
});
test("rejects identities, paused sentences, malformed scopes and oversized payloads without RPC", async () => {
  for (const body of [{ ...recipe(), userId: "victim" }, { ...recipe(), draft: { ...draft(), reviewTiming: "early" } }, { ...recipe(), draft: { ...draft(), family: "sentence", scenarioId: "sentences" } }, { ...recipe(), languageCode: "Dutch" }, { ...recipe(), draft: { ...draft(), listValue: "user:bad" } }, { ...recipe(), draft: { ...draft(), sourceValue: "source:bad" } }]) expect((await POST(request(body))).status).toBe(400);
  expect((await POST(request({ padding: "x".repeat(20000) }))).status).toBe(413); expect(rpc).not.toHaveBeenCalled();
});
test("redacts errors and fails closed on malformed counter results", async () => {
  for (const data of [null, { ...value(), dueToday: 11 }, { ...value(), timezone: "invalid" }, { ...value(), newCards: -1 }, { ...value(), studyDay: "2026-99-99" }]) { rpc.mockResolvedValue({ data, error: null }); const r = await POST(request(recipe())); expect(r.status).toBe(503); expect(await r.json()).toEqual({ error: "training_availability_unavailable" }); }
  rpc.mockRejectedValue(new Error("private secret")); expect((await POST(request(recipe()))).status).toBe(503);
});
