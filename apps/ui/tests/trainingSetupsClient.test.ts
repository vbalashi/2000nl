import { afterEach, beforeEach, expect, test, vi } from "vitest";
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { getSession } } }));
import { fetchAccountTrainingSetups, saveAccountTrainingSetups } from "@/lib/training/setups/client";
import { emptyTrainingSetups } from "@/lib/training/setups/model";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock);
  getSession.mockResolvedValue({ data: { session: { user: { id: "a" }, access_token: "test-token" } }, error: null });
});
afterEach(() => { vi.unstubAllGlobals(); });
test("requests account data using the current authenticated principal and no cache", async () => {
  fetchMock.mockResolvedValue(Response.json(emptyTrainingSetups()));
  expect(await fetchAccountTrainingSetups("a")).toEqual(emptyTrainingSetups());
  expect(fetchMock).toHaveBeenCalledWith("/api/training/setups", expect.objectContaining({ method: "GET", cache: "no-store", headers: expect.objectContaining({ authorization: "Bearer test-token" }) }));
});
test("switched/signed-out sessions cannot send requests for another account", async () => {
  await expect(fetchAccountTrainingSetups("b")).rejects.toThrow();
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  expect(await saveAccountTrainingSetups("a", 0, emptyTrainingSetups().document)).toEqual({ kind: "error" });
  expect(fetchMock).not.toHaveBeenCalled();
});
test("maps server conflicts separately from failed or malformed responses", async () => {
  const snapshot = { ...emptyTrainingSetups(), revision: 7 };
  fetchMock.mockResolvedValue(Response.json({ snapshot }, { status: 409 }));
  expect(await saveAccountTrainingSetups("a", 0, snapshot.document)).toEqual({ kind: "conflict", snapshot });
  fetchMock.mockResolvedValue(Response.json({ error: "unavailable" }, { status: 503 }));
  expect(await saveAccountTrainingSetups("a", 0, snapshot.document)).toEqual({ kind: "error" });
  await expect(fetchAccountTrainingSetups("a")).rejects.toThrow();
});

test("contextual Translation survives save and authenticated fetch without sentence conversion",async()=>{
 const document={schemaVersion:1 as const,mainTrainingId:"context",trainings:[{id:"context",name:"Translation",languageCode:"nl",draft:{family:"word-in-context" as const,scenarioId:"understanding",modes:["definition-to-word" as const],cardFilter:"both" as const,listValue:"curated:nt2",sourceValue:"all",newReviewRatio:2,dateWindow:"all" as const,sessionSize:10}}]};
 const snapshot={revision:4,document};
 fetchMock.mockResolvedValueOnce(Response.json(snapshot)).mockResolvedValueOnce(Response.json(snapshot));
 expect(await saveAccountTrainingSetups("a",3,document)).toEqual({kind:"saved",snapshot});
 expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({expectedRevision:3,document});
 expect(await fetchAccountTrainingSetups("a")).toEqual(snapshot);
});
