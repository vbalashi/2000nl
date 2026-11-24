import { afterEach, expect, test, vi } from "vitest";
import { httpAttemptOutcome, recordProviderConfigurationFault } from "@/lib/providers/providerDiagnostics";
import { providerFetch } from "@/lib/providers/providerTransport";
import { beginProviderAction, startTrainingDiagnostics } from "@/lib/diagnostics/client";
import { parseTrainingDiagnostics, type TrainingDiagnostic } from "@/lib/diagnostics/contract";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

test("each dispatched attempt produces a closed result, independent of a subsequent success", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("private provider response"))
    .mockResolvedValueOnce(new Response("private content", { status: 200 }));
  const secretUrl = "https://provider.invalid/?key=private-key";
  await expect(providerFetch(secretUrl, {}, "google_tts")).rejects.toThrow("private provider response");
  expect(await (await providerFetch(secretUrl, {}, "google_tts")).text()).toBe("private content");
  const aborted = AbortSignal.abort();
  expect(() => providerFetch(secretUrl, { signal: aborted }, "google_tts")).toThrow();
  expect(fetcher).toHaveBeenCalledTimes(2);
  const records = info.mock.calls.map(([s]) => JSON.parse(s));
  expect(records.map(r => r.outcome)).toEqual(["network_error", "ok"]);
  expect(records.every(r => r.kind === "transport_attempt" && r.service === "audio")).toBe(true);
  expect(JSON.stringify(records)).not.toContain("private");
});

test("shared configuration faults require recognized provider evidence", () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  expect(httpAttemptOutcome(403)).toEqual("auth_denied");
  recordProviderConfigurationFault("openai", 429, '{"error":{"code":"rate_limit_exceeded","message":"private"}}');
  recordProviderConfigurationFault("gemini", 403, '{"error":{"message":"API_KEY_INVALID"}}');
  expect(info).not.toHaveBeenCalled();
  recordProviderConfigurationFault("deepl", 456, "");
  recordProviderConfigurationFault("azure_openai", 401, '{"error":{"code":"invalid_api_key","message":"private"}}');
  recordProviderConfigurationFault("google_tts", 400, '{"error":{"details":[{"domain":"googleapis.com","reason":"API_KEY_INVALID"}]}}');
  expect(info.mock.calls.map(([s]) => JSON.parse(s).outcome)).toEqual(["quota_exhausted", "credential_invalid", "credential_invalid"]);
  expect(JSON.stringify(info.mock.calls)).not.toContain("private");
});

test("explicit actions emit one unsampled terminal observation tied to the original action and session", async () => {
  vi.useFakeTimers();
  const posts: TrainingDiagnostic[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    if (init?.method === "GET") return Response.json({enabled:true,detailed:false,successSampleRate:0,validUntil:Date.now()+80_000});
    posts.push(...JSON.parse(String(init?.body)));
    return new Response(null, {status:202});
  });
  const stop = startTrainingDiagnostics("synthetic-account", async () => ({}));
  try {
    await vi.advanceTimersByTimeAsync(10);
    const finish = beginProviderAction("audio_playback");
    expect(finish).toBeTypeOf("function");
    finish?.("ready");
    finish?.("failed");
    await vi.advanceTimersByTimeAsync(5100);
    expect(posts.map(e => e.kind)).toEqual(["audio_play_requested","audio_play_started"]);
    expect(posts[0].requestId).toEqual(posts[1].requestId);
    expect(posts[0].eventId).not.toEqual(posts[1].eventId);
    expect(parseTrainingDiagnostics(posts)).toEqual(posts);
    expect(parseTrainingDiagnostics([{...posts[0],operation:"dictionary_translation"}])).toBeNull();
    expect(parseTrainingDiagnostics([{...posts[0],requestId:undefined}])).toBeNull();
  } finally { stop(); }
});
