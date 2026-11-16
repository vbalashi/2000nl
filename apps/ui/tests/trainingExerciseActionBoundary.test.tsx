import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { useTrainingExerciseSession } from "@/components/training/useTrainingExerciseSession";
import { performPlatformV2IdiomExerciseAction } from "@/lib/platform/platformV2IdiomExerciseClient";
import { performPlatformV2TranslationExerciseAction } from "@/lib/platform/platformV2TranslationExerciseClient";
import { POST as actionRoute } from "@/app/api/platform/v2/actions/route";
import { POST as reconcileRoute } from "@/app/api/platform/v2/actions/reconcile/route";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "test" } } }) } } }));
vi.mock("@/lib/platform/serverSupabase", async (original) => ({
  ...(await original<typeof import("@/lib/platform/serverSupabase")>()),
  getAuthenticatedSupabase: async () => ({ user: { id: "00000000-0000-4000-8000-000000000001" }, principal: { authKind: "first_party", scopes: new Set(["platform:write"]) } }),
  getPlatformServiceSupabase: () => ({ supabase: { rpc } }),
}));
const sessionId = "00000000-0000-4000-8000-000000000009";
const targetId = "00000000-0000-4000-8000-000000000003";
const baseCandidate = { status: "ready" as const, ordinal: 1, targetId, targetKey: "target", entryId: "entry", state: null };
const families = ["idiom", "translation"] as const;
let requests: { path: string; body: any }[];
let disconnect = false;
beforeEach(() => {
  vi.stubEnv("PLATFORM_V2_ACTIONS_ENABLED", "1");
  vi.stubEnv("PLATFORM_V2_IDIOM_EXERCISES_ENABLED", "1");
  vi.stubEnv("PLATFORM_V2_TRANSLATION_EXERCISES_ENABLED", "1");
  requests = []; disconnect = false; rpc.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input), body = JSON.parse(String(init?.body));
    requests.push({ path, body });
    if (disconnect && path === "/api/platform/v2/actions") { disconnect = false; throw new TypeError("Failed to fetch"); }
    const req = new NextRequest(`http://localhost${path}`, { method: "POST", headers: init?.headers, body: JSON.stringify(body) });
    return path.endsWith("/reconcile") ? reconcileRoute(req) : actionRoute(req);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function setup(family: typeof families[number]) {
  const candidate = { ...baseCandidate, family, direction: family === "idiom" ? "direct" as const : "recall" as const };
  const next = vi.fn().mockResolvedValue(candidate), progress = vi.fn(), superseded = vi.fn();
  const adapter = {
    next, capturePreparation: () => async () => ({ state: "ready" as const, content: { text: "fixture" } }), markUnavailable: vi.fn(),
    act: (item: typeof candidate, result: "success" | "fail" | "hard" | "easy", eventId: string) => family === "idiom"
      ? performPlatformV2IdiomExerciseAction({ trainingSessionId: sessionId, candidate: item as Parameters<typeof performPlatformV2IdiomExerciseAction>[0]["candidate"], reviewResult: result, clientEventId: eventId })
      : performPlatformV2TranslationExerciseAction({ trainingSessionId: sessionId, candidate: item as unknown as Parameters<typeof performPlatformV2TranslationExerciseAction>[0]["candidate"], reviewResult: result, clientEventId: eventId }),
    timing: { selection: "next-card.selection" as const, preparation: "next-card.lookup" as const },
  };
  const hook = renderHook(() => useTrainingExerciseSession({ identity: sessionId, preparationIdentity: "nl", session: { sessionId, completedActions: 0, plannedTotal: 2 }, adapter, onProgress: progress, onSuperseded: superseded }));
  return { ...hook, next, progress, superseded };
}
test.each(families)("%s: route rejection retires the controller without retrying a grade", async (family) => {
  rpc.mockResolvedValue({ data: null, error: { message: "training_session_superseded" } });
  const hook = setup(family); await waitFor(() => expect(hook.result.current.candidate).not.toBeNull());
  await act(async () => { await hook.result.current.grade("success"); });
  expect(hook.superseded).toHaveBeenCalledOnce(); expect(hook.result.current.candidate).toBeNull();
  expect(hook.result.current.actionRetryRequired).toBe(false); expect(hook.progress).not.toHaveBeenCalled();
  await act(async () => { await hook.result.current.retry(); }); expect(requests).toHaveLength(1); expect(rpc).toHaveBeenCalledOnce();
});
test.each(families.flatMap(family => ["training_exercise_state_conflict", "training_exercise_target_unavailable"].map(error => ({ family, error }))))("$family: $error retains the intent without falsely retiring", async ({ family, error }) => {
  rpc.mockResolvedValue({ data: null, error: { message: error } });
  const hook = setup(family); await waitFor(() => expect(hook.result.current.candidate).not.toBeNull());
  await act(async () => { await hook.result.current.grade("success"); });
  expect(hook.superseded).not.toHaveBeenCalled(); expect(hook.result.current.actionRetryRequired).toBe(true);
  await act(async () => { await hook.result.current.retry(); });
  expect(requests).toHaveLength(2); expect(requests[1].body).toEqual(requests[0].body); expect(hook.progress).not.toHaveBeenCalled();
});
test.each(families)("%s: ambiguous transport reconciles and Retry preserves the original event", async (family) => {
  disconnect = true; rpc.mockResolvedValue({ data: null, error: null });
  const hook = setup(family); await waitFor(() => expect(hook.result.current.candidate).not.toBeNull());
  await act(async () => { await hook.result.current.grade("success"); });
  expect(requests.map(r => r.path)).toEqual(["/api/platform/v2/actions", "/api/platform/v2/actions/reconcile"]);
  expect(requests[1].body.clientEventId).toBe(requests[0].body.clientEventId);
  expect(hook.result.current.actionRetryRequired).toBe(true); expect(hook.superseded).not.toHaveBeenCalled();
  rpc.mockResolvedValue({ data: null, error: { message: "training_exercise_state_conflict" } });
  await act(async () => { await hook.result.current.retry(); });
  expect(requests[2].body).toEqual(requests[0].body); expect(hook.progress).not.toHaveBeenCalled();
});


test.each(families)("%s: a reconciled receipt advances once without repeating the mutation", async (family) => {
  disconnect = true;
  rpc.mockImplementation(async (_name, args) => ({ data: {
    status: "duplicate", actionId: "review-exercise", clientEventId: args.p_client_event_id,
    targetId, targetKey: "target", family, direction: family === "idiom" ? "direct" : "recall",
    state: { stateRevision: "revision", fsrsReps: 1, fsrsLapses: 0, seenCount: 1, successCount: 1,
      fsrsEnabled: true, hidden: false, inLearning: false, lastResult: "success" },
  }, error: null }));
  const hook = setup(family); await waitFor(() => expect(hook.result.current.candidate).not.toBeNull());
  await act(async () => { await hook.result.current.grade("success"); });
  expect(requests.map(r => r.path)).toEqual(["/api/platform/v2/actions", "/api/platform/v2/actions/reconcile"]);
  expect(requests[1].body.clientEventId).toBe(requests[0].body.clientEventId);
  expect(hook.progress).toHaveBeenCalledOnce(); expect(hook.superseded).not.toHaveBeenCalled();
  expect(hook.result.current.actionRetryRequired).toBe(false); expect(rpc).toHaveBeenCalledOnce();
});
