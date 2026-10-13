import { afterEach, expect, test, vi } from "vitest";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/translation/translationApiClient", () => ({
  fetchDictionaryMeaningTranslation: request,
}));
import { observeDictionaryMeaningTranslation } from "@/lib/translation/dictionaryTranslationObservation";
const input = { entryId: "entry", targetLanguageCode: "ru", force: true };
const pending = (needsEnqueue = false) => new Response(JSON.stringify({
  status: "pending", job: { id: "job" }, needsEnqueue,
}));
afterEach(() => { vi.useRealTimers(); request.mockReset(); });

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
  await vi.advanceTimersByTimeAsync(2_000);
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
