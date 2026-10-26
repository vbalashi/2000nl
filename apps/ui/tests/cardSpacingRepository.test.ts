import { afterEach, expect, test, vi } from "vitest";
import { cardSpacingRepository } from "@/lib/preferences/cardSpacingRepository";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
test("spacing save updates no unrelated preferences", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
  vi.stubGlobal("fetch", fetch);
  await cardSpacingRepository.save("reader", "airy");
  const [, init] = fetch.mock.calls[0];
  expect(JSON.parse(init.body)).toEqual({
    user_id: "reader",
    card_spacing: "airy",
  });
});
test("stalled spacing loads release the loading state within ten seconds", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(
    (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        ),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const result = cardSpacingRepository.load("reader").catch((error) => error);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  await vi.advanceTimersByTimeAsync(10000);
  expect(await result).toEqual(new Error("card_spacing_load_failed"));
});
test("invalid spacing is rejected before reaching storage", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    cardSpacingRepository.save("reader", "invalid" as "airy"),
  ).rejects.toThrow("invalid_card_spacing");
  expect(fetch).not.toHaveBeenCalled();
});
test("Airy round trips through the account preference repository", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 201 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ card_spacing: "airy" }), { status: 200 }),
    );
  vi.stubGlobal("fetch", fetch);
  await cardSpacingRepository.save("reader", "airy");
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    user_id: "reader",
    card_spacing: "airy",
  });
  await expect(cardSpacingRepository.load("reader")).resolves.toBe("airy");
});
