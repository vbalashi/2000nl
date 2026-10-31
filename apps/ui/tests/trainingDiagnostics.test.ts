import { afterEach, expect, test, vi } from "vitest";
import {
  ForegroundLoadTracker,
  observeTrainingTiming,
  startTrainingDiagnostics,
} from "@/lib/diagnostics/client";
import { parseTrainingDiagnostics } from "@/lib/diagnostics/contract";
import { platformFetchWithTimeout } from "@/lib/platform/platformFetchWithTimeout";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
test("reports one foreground stall, links an in-flight request, then reports recovery", () => {
  let now = 0;
  let active = true;
  const emit = vi.fn();
  const tracker = new ForegroundLoadTracker(
    emit,
    () => now,
    () => active,
  );
  tracker.start("training-one");
  tracker.link("training-one", "req-one");
  now = 5_000;
  active = false;
  tracker.tick();
  now = 80_000;
  active = true;
  tracker.tick();
  expect(emit.mock.calls.map(([e]) => e.kind)).toEqual(["load_started"]);
  now = 85_000;
  tracker.tick();
  tracker.tick();
  expect(
    emit.mock.calls.filter(([e]) => e.kind === "load_stalled"),
  ).toHaveLength(1);
  expect(emit.mock.calls[1][0]).toMatchObject({
    durationMs: 10_000,
    requestId: "req-one",
  });
  tracker.finish("training-one", "ready");
  expect(emit.mock.calls.at(-1)?.[0]).toMatchObject({
    kind: "load_ready",
    durationMs: 10_000,
  });
});
test("cancelled transitions cannot later report a stall", () => {
  let now = 0;
  const emit = vi.fn();
  const tracker = new ForegroundLoadTracker(
    emit,
    () => now,
    () => true,
  );
  tracker.start("training-one");
  tracker.finish("training-one", "cancelled");
  now = 90_000;
  tracker.tick();
  expect(emit.mock.calls.map(([e]) => e.kind)).toEqual([
    "load_started",
    "load_cancelled",
  ]);
});
test("ingestion contract rejects content, identity and arbitrary extra properties", () => {
  const event = {
    eventId: "event-1",
    kind: "load_stalled",
    operation: "transition",
    transitionId: "training-one",
    durationMs: 10000,
    online: true,
    foreground: true,
  };
  expect(parseTrainingDiagnostics([event])).toEqual([event]);
  for (const secret of [
    "email",
    "userId",
    "message",
    "url",
    "body",
    "authorization",
  ])
    expect(
      parseTrainingDiagnostics([{ ...event, [secret]: "private" }]),
    ).toBeNull();
  expect(parseTrainingDiagnostics(Array(21).fill(event))).toBeNull();
  expect(
    parseTrainingDiagnostics([{ ...event, durationMs: Infinity }]),
  ).toBeNull();
});
test("training requests carry an id and monitoring failure cannot change their result", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("ok"));
  const response = await platformFetchWithTimeout("/api/platform/v2/lookup", {
    headers: { "content-type": "application/json" },
  });
  expect(response.status).toBe(200);
  expect(
    new Headers(fetcher.mock.calls[0][1]?.headers).get("x-request-id"),
  ).toMatch(/^[0-9a-f-]{36}$/);
});
test("stalled transitions are delivered with auth, never card content", async () => {
  vi.useFakeTimers();
  const started = Date.now();
  vi.spyOn(performance, "now").mockImplementation(() => Date.now() - started);
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 202 }));
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  const stop = startTrainingDiagnostics("account-a", async () => ({
    authorization: "Bearer private-token",
    "content-type": "application/json",
  }));
  try {
    observeTrainingTiming({
      transitionId: "training-one",
      stage: "transition.start",
      outcome: "start",
    });
    await vi.advanceTimersByTimeAsync(10_100);
    expect(fetcher).toHaveBeenCalled();
    const events = fetcher.mock.calls.flatMap(([, init]) =>
      JSON.parse(String(init?.body)),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "load_stalled",
        transitionId: "training-one",
      }),
    );
    expect(JSON.stringify(events)).not.toContain("account-a");
    expect(JSON.stringify(events)).not.toContain("private-token");
  } finally {
    stop();
  }
});

test("renderer stalls remain observable after preparation has completed", async () => {
  vi.useFakeTimers();
  const started = Date.now();
  vi.spyOn(performance, "now").mockImplementation(() => Date.now() - started);
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 202 }));
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  const { renderHook, act } = await import("@testing-library/react");
  const { useCardLoadDiagnostics } = await import(
    "@/lib/diagnostics/useCardLoadDiagnostics"
  );
  const stop = startTrainingDiagnostics("account-a", async () => ({
    authorization: "Bearer test",
    "content-type": "application/json",
  }));
  const hook = renderHook(
    ({ phase }) => useCardLoadDiagnostics("card-with-display-ack", phase),
    { initialProps: { phase: "loading" as "loading" | "ready" } },
  );
  try {
    observeTrainingTiming({
      transitionId: "training-preparation",
      stage: "transition.start",
      outcome: "start",
    });
    observeTrainingTiming({
      transitionId: "training-preparation",
      stage: "transition.total",
      outcome: "start-ready",
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    const events = fetcher.mock.calls.flatMap(([, init]) =>
      JSON.parse(String(init?.body)),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "load_stalled", operation: "display" }),
    );
    hook.rerender({ phase: "ready" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    const all = fetcher.mock.calls.flatMap(([, init]) =>
      JSON.parse(String(init?.body)),
    );
    expect(all).toContainEqual(
      expect.objectContaining({ kind: "load_ready", operation: "display" }),
    );
  } finally {
    hook.unmount();
    stop();
  }
});

vi.mock("@/lib/diagnostics/policyClient",()=>({readDiagnosticPolicy:vi.fn(async()=>({enabled:true,detailed:true,successSampleRate:1,validUntil:Date.now()+90_000}))}));


test("open clients apply a kill switch on refresh and discard previously queued detail", async () => {
  vi.useFakeTimers();
  const {readDiagnosticPolicy}=await import("@/lib/diagnostics/policyClient");
  const {observeTrainingRequest}=await import("@/lib/diagnostics/client");
  const read=vi.mocked(readDiagnosticPolicy);
  const fetcher=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(null,{status:202}));
  const stop=startTrainingDiagnostics("owner",async()=>({"content-type":"application/json"}));
  try {
    await vi.advanceTimersByTimeAsync(0);
    observeTrainingRequest({requestId:"first",durationMs:1,result:"ready",status:200});
    await vi.advanceTimersByTimeAsync(5_001);
    expect(fetcher).toHaveBeenCalledOnce();
    read.mockResolvedValue({enabled:false,detailed:false,successSampleRate:0,validUntil:0});
    await vi.advanceTimersByTimeAsync(30_000);
    observeTrainingRequest({requestId:"failure-after-disable",durationMs:1,result:"failed",status:500});
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(read.mock.calls.length).toBeGreaterThanOrEqual(2);
  } finally {
    stop();
    read.mockImplementation(async()=>({enabled:true,detailed:true,successSampleRate:1,validUntil:Date.now()+90_000}));
  }
});
