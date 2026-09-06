import { afterEach, expect, test, vi } from "vitest";
import { readingPreferencesRepository } from "@/lib/reading/readingPreferencesRepository";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("a stalled preference read fails within ten seconds instead of leaving Settings loading forever", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  vi.stubGlobal("fetch", fetch);
  const result = readingPreferencesRepository.load("reader").catch((error) => error);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await result).toEqual(new Error("reading_preferences_load_failed"));
});

test.each([[], [{ reading_size_phone: "obsolete", reading_size_desktop: null }]])(
  "missing or invalid saved sizes default to Normal: %j",
  async (rows) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(rows), {
      headers: { "Content-Type": "application/json" },
    })));
    expect(await readingPreferencesRepository.load("reader")).toEqual({ phone: "normal", desktop: "normal" });
  },
);

test("a stalled preference save fails within ten seconds so the reader can retry", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  vi.stubGlobal("fetch", fetch);
  const result = readingPreferencesRepository.save("reader", "phone", "large").catch((error) => error);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await result).toEqual(new Error("reading_preferences_save_failed"));
});
