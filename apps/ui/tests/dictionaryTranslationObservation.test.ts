import { afterEach, expect, test, vi } from "vitest";
const { request, watch } = vi.hoisted(() => ({ request: vi.fn(), watch: vi.fn() }));
vi.mock("@/lib/translation/dictionaryTranslationEvents", () => ({
  publishDictionaryTranslationReady: vi.fn(), watchDictionaryTranslation: watch,
}));
vi.mock("@/lib/translation/translationApiClient", () => ({
  fetchDictionaryMeaningTranslation: request,
}));
import { observeDictionaryMeaningTranslation } from "@/lib/translation/dictionaryTranslationObservation";
const input = { entryId: "entry", targetLanguageCode: "ru", force: true };
const pending = (needsEnqueue = false) => new Response(JSON.stringify({
  status: "pending", job: { id: "job" }, needsEnqueue,
}));
afterEach(() => { vi.useRealTimers(); request.mockReset(); watch.mockReset(); });

test("polls read-only and never repeats an explicit failed-job retry", async () => {
  vi.useFakeTimers();
  request.mockResolvedValueOnce(pending()).mockResolvedValueOnce(new Response('{"status":"ready"}'));
  const result = observeDictionaryMeaningTranslation(input);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(await (await result).json()).toEqual({ status: "ready" });
  expect(request.mock.calls[0][0].force).toBe(true);
  expect(request.mock.calls[1][0]).toMatchObject({ force: false, observeOnly: true });
});

test("source invalidation requests a replacement without resetting failures", async () => {
  vi.useFakeTimers();
  request.mockResolvedValueOnce(pending(true)).mockResolvedValueOnce(new Response('{"status":"failed"}'));
  const result = observeDictionaryMeaningTranslation(input);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(await (await result).json()).toEqual({ status: "failed" });
  expect(request.mock.calls[1][0]).toMatchObject({ force: false, observeOnly: false });
});

test("a changed source without a matching job enqueues its replacement", async () => {
  vi.useFakeTimers();
  request.mockResolvedValueOnce(pending())
    .mockResolvedValueOnce(new Response('{"status":"pending","needsEnqueue":true}'))
    .mockResolvedValueOnce(new Response('{"status":"ready"}'));
  const result = observeDictionaryMeaningTranslation(input);
  await vi.advanceTimersByTimeAsync(3_000);
  expect(await (await result).json()).toEqual({ status: "ready" });
  expect(request.mock.calls[1][0]).toMatchObject({ force: false, observeOnly: true });
  expect(request.mock.calls[2][0]).toMatchObject({ force: false, observeOnly: false });
});

test("observation expiry preserves pending server state", async () => {
  vi.useFakeTimers();
  request.mockResolvedValue(pending());
  const result = observeDictionaryMeaningTranslation(input, { observationMs: 500 });
  await vi.advanceTimersByTimeAsync(500);
  expect((await (await result).json()).status).toBe("pending");
  expect(request).toHaveBeenCalledTimes(1);
});

test("background preparation enqueues once without keeping a polling loop", async () => {
  request.mockResolvedValue(pending());
  const response = await observeDictionaryMeaningTranslation({ ...input, background: true });
  expect((await response.json()).status).toBe("pending");
  expect(request).toHaveBeenCalledTimes(1);
});

test("disconnect stops observation without a cancel-job request", async () => {
  request.mockResolvedValue(pending());
  const controller = new AbortController();
  const result = observeDictionaryMeaningTranslation({ ...input, signal: controller.signal });
  const rejection = expect(result).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await rejection;
  expect(request).toHaveBeenCalledTimes(1);
});

test("a timed-out initial observation is pending, never a failed job", async () => {
  request.mockRejectedValueOnce(new Error("platform_request_timeout"));
  expect(await (await observeDictionaryMeaningTranslation(input)).json()).toEqual({status:"pending"});
});

test("transport failure and retry backoff preserve the last pending job", async () => {
  vi.useFakeTimers();
  request.mockResolvedValueOnce(pending()).mockRejectedValueOnce(new TypeError("Failed to fetch"));
  const result=observeDictionaryMeaningTranslation(input);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await (await result).json()).toMatchObject({status:"pending",job:{id:"job"}});
});

test.each([429,502,503,504,524])("HTTP %i is not evidence of a terminal translation error", async status => {
  request.mockResolvedValueOnce(new Response("temporary",{status}));
  expect(await (await observeDictionaryMeaningTranslation(input)).json()).toEqual({status:"pending"});
});


test("pending observations back off to five seconds without repeating generation", async () => {
  vi.useFakeTimers();
  request.mockImplementation(async () => pending());
  const controller = new AbortController();
  const result = observeDictionaryMeaningTranslation({ ...input, signal: controller.signal });
  const rejection = expect(result).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(0);
  expect(request).toHaveBeenCalledTimes(1);
  for (const [index, delay] of [1000, 2000, 4000, 5000, 5000].entries()) {
    await vi.advanceTimersByTimeAsync(delay - 1);
    expect(request).toHaveBeenCalledTimes(index + 1);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(index + 2);
  }
  expect(request.mock.calls.slice(1).every(([value]) =>
    value.force === false && value.observeOnly === true)).toBe(true);
  controller.abort();
  await rejection;
  await vi.advanceTimersByTimeAsync(10000);
  expect(request).toHaveBeenCalledTimes(6);
});

test("an explicit poll interval stays fixed and stops immediately on ready", async () => {
  vi.useFakeTimers();
  request.mockResolvedValueOnce(pending()).mockResolvedValueOnce(pending())
    .mockResolvedValueOnce(new Response('{"status":"ready"}'));
  const result = observeDictionaryMeaningTranslation(input, { pollMs: 250 });
  await vi.advanceTimersByTimeAsync(500);
  expect((await (await result).json()).status).toBe("ready");
  await vi.advanceTimersByTimeAsync(10000);
  expect(request).toHaveBeenCalledTimes(3);
});

test("observation deadline interrupts a longer backoff without another request", async () => {
  vi.useFakeTimers();
  request.mockImplementation(async () => pending());
  const result = observeDictionaryMeaningTranslation(input, { observationMs: 2500 });
  await vi.advanceTimersByTimeAsync(2500);
  expect((await (await result).json()).status).toBe("pending");
  expect(request).toHaveBeenCalledTimes(2);
});


test("healthy realtime waits for a targeted hint and coalesces duplicate hints", async () => {
  vi.useFakeTimers();
  let hint!: () => void;
  const stop = vi.fn();
  watch.mockImplementation((_scope, onUpdate, connection) => {
    hint = onUpdate;
    connection({status:"connected",reconnect:false});
    return stop;
  });
  request.mockResolvedValueOnce(pending()).mockResolvedValueOnce(pending()).mockResolvedValueOnce(new Response('{"status":"ready"}'));
  const result = observeDictionaryMeaningTranslation(input);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(request).toHaveBeenCalledTimes(2);
  hint(); hint(); hint();
  await vi.advanceTimersByTimeAsync(0);
  expect((await (await result).json()).status).toBe("ready");
  expect(request).toHaveBeenCalledTimes(3);
  expect(request.mock.calls[1][0]).toMatchObject({observeOnly:true,force:false});
  expect(stop).toHaveBeenCalledOnce();
});

test("healthy realtime makes a final authoritative probe when a completion hint is lost", async () => {
  vi.useFakeTimers();
  watch.mockImplementation((_scope,_onUpdate,connection) => { connection({status:"connected",reconnect:false});return vi.fn(); });
  request.mockResolvedValueOnce(pending()).mockResolvedValueOnce(pending()).mockResolvedValueOnce(new Response('{"status":"ready"}'));
  const result = observeDictionaryMeaningTranslation(input,{observationMs:10_000});
  await vi.advanceTimersByTimeAsync(8999);
  expect(request).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect((await (await result).json()).status).toBe("ready");
});

test("connection degradation interrupts sparse waiting and resumes bounded recovery", async () => {
  vi.useFakeTimers();
  let connection!: (value:{status:string;reconnect:boolean})=>void;
  watch.mockImplementation((_scope,_onUpdate,onConnection) => { connection=onConnection;connection({status:"connected",reconnect:false});return vi.fn(); });
  request.mockResolvedValueOnce(pending()).mockResolvedValueOnce(pending()).mockResolvedValueOnce(new Response('{"status":"failed"}'));
  const result=observeDictionaryMeaningTranslation(input);
  await vi.advanceTimersByTimeAsync(5000);
  expect(request).toHaveBeenCalledTimes(2);
  connection({status:"degraded",reconnect:false});
  await vi.advanceTimersByTimeAsync(0);
  expect((await (await result).json()).status).toBe("failed");
  expect(request).toHaveBeenCalledTimes(3);
});

test("abort detaches a healthy pending subscription without cancelling durable work", async () => {
  vi.useFakeTimers();
  const stop=vi.fn();
  watch.mockImplementation((_scope,_onUpdate,connection) => { connection({status:"connected",reconnect:false});return stop; });
  request.mockImplementation(async()=>pending());
  const controller=new AbortController();
  const result=observeDictionaryMeaningTranslation({...input,signal:controller.signal});
  const rejection=expect(result).rejects.toMatchObject({name:"AbortError"});
  await vi.advanceTimersByTimeAsync(0);
  expect(request).toHaveBeenCalledTimes(2);
  controller.abort();await rejection;
  expect(stop).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(request).toHaveBeenCalledTimes(2);
});
