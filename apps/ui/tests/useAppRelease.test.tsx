import React from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
vi.mock("@/lib/appVersion", () => ({
  appVersionInfo: () => ({
    version: "1.0",
    commit: "a".repeat(40),
    buildTimestamp: "2026-10-17T08:00:00Z",
  }),
}));
import { useAppRelease } from "@/components/releases/useAppRelease";
const build = {
  version: "2.0",
  commit: "b".repeat(40),
  buildTimestamp: "2026-10-17T09:00:00Z",
};
const news = {
  id: "news-2",
  publishedAt: build.buildTimestamp,
  locale: "en",
  title: "New release",
  summary: "Two languages",
  detailsUrl: "https://example.org/blog",
};
const release = { schemaVersion: 1, build, announcement: news };
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => release }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
test("announcement read state and update attention are independent; later persists across remount", async () => {
  let hook = renderHook(() => useAppRelease("owner", false));
  await waitFor(() => expect(hook.result.current.banner).toBe(true));
  act(() => hook.result.current.markRead());
  expect(hook.result.current.unread).toBe(false);
  expect(hook.result.current.attention).toBe(true);
  act(() => hook.result.current.dismiss());
  expect(hook.result.current.banner).toBe(false);
  hook.unmount();
  hook = renderHook(() => useAppRelease("owner", false));
  await waitFor(() => expect(hook.result.current.updateAvailable).toBe(true));
  expect(hook.result.current.banner).toBe(false);
  expect(hook.result.current.unread).toBe(false);
});
test("unsafe training suppresses banner and blocks update requests until safe", async () => {
  const hook = renderHook(({ unsafe }) => useAppRelease("owner", unsafe), {
    initialProps: { unsafe: true },
  });
  await waitFor(() => expect(hook.result.current.updateAvailable).toBe(true));
  expect(hook.result.current.banner).toBe(false);
  const count = vi.mocked(fetch).mock.calls.length;
  await act(() => hook.result.current.update());
  expect(fetch).toHaveBeenCalledTimes(count);
  hook.rerender({ unsafe: false });
  expect(hook.result.current.banner).toBe(true);
});
test("a mutation starting while update preflight awaits blocks document navigation", async () => {
  const hook = renderHook(({ unsafe }) => useAppRelease("owner", unsafe), {
    initialProps: { unsafe: false },
  });
  await waitFor(() => expect(hook.result.current.banner).toBe(true));
  let resolve!: (v: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(
    new Promise((r) => (resolve = r)) as Promise<Response>,
  );
  let operation!: Promise<void>;
  act(() => {
    operation = hook.result.current.update();
  });
  hook.rerender({ unsafe: true });
  await act(async () => {
    resolve({ ok: true, json: async () => release } as Response);
    await operation;
  });
  expect(hook.result.current.status).toBe("ready");
});
test("focus and visibility deduplicate, hidden tabs stay quiet", async () => {
  const hook = renderHook(() => useAppRelease("owner", false));
  await waitFor(() => expect(hook.result.current.release).toBeTruthy());
  act(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.useFakeTimers();
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("hidden");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(16 * 60_000);
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  visibility.mockRestore();
});
test("failed request preserves known update and manual retry recovers", async () => {
  const hook = renderHook(() => useAppRelease("owner", false));
  await waitFor(() => expect(hook.result.current.updateAvailable).toBe(true));
  vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
  await act(() => hook.result.current.check());
  expect(hook.result.current.status).toBe("unknown");
  expect(hook.result.current.attention).toBe(true);
  await act(() => hook.result.current.check());
  expect(hook.result.current.status).toBe("ready");
});
test("new document verifies loaded identity against live server, cleans only update marker", async () => {
  const installed = {
    ...build,
    version: "1.0",
    commit: "a".repeat(40),
    buildTimestamp: "2026-10-17T08:00:00Z",
  };
  window.history.replaceState(
    null,
    "",
    "/?destination=settings&_appRelease=target#article",
  );
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ ...release, build: installed }),
  } as Response);
  const hook = renderHook(() => useAppRelease("owner", false));
  await waitFor(() => expect(hook.result.current.status).toBe("updated"));
  expect(window.location.search).toBe("?destination=settings");
  expect(window.location.hash).toBe("#article");
});
test("old document after reload reports failure rather than looping", async () => {
  window.history.replaceState(null, "", "/?_appRelease=target");
  const hook = renderHook(() => useAppRelease("owner", false));
  await waitFor(() => expect(hook.result.current.status).toBe("failed"));
  expect(fetch).toHaveBeenCalledTimes(1);
});
test("strict-mode mount performs a usable release check", async () => {
  const hook = renderHook(() => useAppRelease("owner", false), {
    wrapper: ({ children }) => <React.StrictMode>{children}</React.StrictMode>,
  });
  await waitFor(() => expect(hook.result.current.updateAvailable).toBe(true));
});
test("a real abort-aware fetch survives strict effect replay", async () => {
  vi.mocked(fetch).mockImplementation(
    (_url, options) =>
      new Promise((resolve, reject) => {
        options?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
        setTimeout(() => {
          if (!options?.signal?.aborted)
            resolve({ ok: true, json: async () => release } as Response);
        }, 10);
      }),
  );
  const hook = renderHook(() => useAppRelease("owner", false), {
    wrapper: ({ children }) => <React.StrictMode>{children}</React.StrictMode>,
  });
  await waitFor(() => expect(hook.result.current.updateAvailable).toBe(true));
});
test("storage failure never prevents update detection or dismissal", async () => {
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  const hook = renderHook(() => useAppRelease("owner", false));
  await waitFor(() => expect(hook.result.current.banner).toBe(true));
  act(() => hook.result.current.dismiss());
  expect(hook.result.current.banner).toBe(false);
  spy.mockRestore();
});
test("a timed-out fetch becomes unknown and can be retried", async () => {
  vi.useFakeTimers();
  vi.mocked(fetch).mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) =>
        options?.signal?.addEventListener("abort", () =>
          reject(new Error("timeout")),
        ),
      ),
  );
  const hook = renderHook(() => useAppRelease("owner", false));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5001);
  });
  expect(hook.result.current.status).toBe("unknown");
  expect(hook.result.current.updateAvailable).toBe(false);
});
test("historical service workers do not trigger blind deletion or reload", async () => {
  const getRegistrations = vi
    .fn()
    .mockResolvedValue([
      { scope: window.location.origin + "/", unregister: vi.fn() },
    ]);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistrations },
  });
  try {
    const hook = renderHook(() => useAppRelease("owner", false));
    await waitFor(() => expect(hook.result.current.updateAvailable).toBe(true));
    await act(() => hook.result.current.update());
    expect(hook.result.current.status).toBe("worker");
    expect(getRegistrations).toHaveBeenCalledOnce();
  } finally {
    Reflect.deleteProperty(navigator, "serviceWorker");
  }
});
