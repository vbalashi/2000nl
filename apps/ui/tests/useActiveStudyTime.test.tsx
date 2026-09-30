import React from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useActiveStudyTime, type ActiveStudyCardIdentity } from "@/components/training/useActiveStudyTime";

const card: ActiveStudyCardIdentity = { ownerId: "learner-a", sessionId: "session-a", family: "meaning", cardKey: "entry-a:word-to-definition" };
let visible: DocumentVisibilityState;
let focused: boolean;
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const visibility = (state: DocumentVisibilityState) => act(() => {
  visible = state;
  document.dispatchEvent(new Event("visibilitychange"));
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
  visible = "visible"; focused = true;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible);
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("active card attention", () => {
  test("excludes background and inactive windows, then resumes the same card", () => {
    const onDuration = vi.fn();
    const { unmount } = renderHook(() => useActiveStudyTime({ identity: card, enabled: true, onDuration }));
    advance(5000); visibility("hidden");
    advance(60000); visibility("visible");
    advance(2000);
    act(() => { focused = false; window.dispatchEvent(new Event("blur")); });
    advance(20000);
    act(() => { focused = true; window.dispatchEvent(new Event("focus")); });
    advance(1000); unmount();
    expect(onDuration.mock.calls.map(([item]) => item.activeMilliseconds)).toEqual([5000, 2000, 1000]);
    expect(onDuration.mock.calls.every(([item]) => item.cardKey === card.cardKey && item.ownerId === card.ownerId)).toBe(true);
  });

  test("loading/overlays/submission pause through eligibility, without counting the pause", () => {
    const onDuration = vi.fn();
    const { rerender, unmount } = renderHook(({ enabled }) => useActiveStudyTime({ identity: card, enabled, onDuration }), { initialProps: { enabled: false } });
    advance(5000); expect(onDuration).not.toHaveBeenCalled();
    rerender({ enabled: true }); advance(7000);
    rerender({ enabled: false }); advance(45000);
    rerender({ enabled: true }); advance(3000); unmount();
    expect(onDuration.mock.calls.map(([item]) => item.activeMilliseconds)).toEqual([7000, 3000]);
  });

  test("checkpoint/unmount/candidate replacement attribute durations to the original identity", () => {
    const onDuration = vi.fn();
    const second: ActiveStudyCardIdentity = { ...card, family: "sentence", cardKey: "sentence-target" };
    const { rerender, unmount } = renderHook(({ identity }) => useActiveStudyTime({ identity, enabled: true, onDuration }), { initialProps: { identity: card } });
    advance(16000); rerender({ identity: second });
    advance(2000); unmount();
    expect(onDuration.mock.calls.map(([item]) => [item.family, item.cardKey, item.activeMilliseconds])).toEqual([
      ["meaning", card.cardKey, 15000], ["meaning", card.cardKey, 1000], ["sentence", second.cardKey, 2000],
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("changing the account never labels the old duration with the new owner", () => {
    const onDuration = vi.fn();
    const { rerender, unmount } = renderHook(({ identity }) => useActiveStudyTime({ identity, enabled: true, onDuration }), { initialProps: { identity: card } });
    advance(3000); rerender({ identity: { ...card, ownerId: "learner-b", sessionId: "session-b" } });
    advance(2000); unmount();
    expect(onDuration.mock.calls.map(([item]) => [item.ownerId, item.sessionId, item.activeMilliseconds])).toEqual([
      ["learner-a", "session-a", 3000], ["learner-b", "session-b", 2000],
    ]);
  });

  test("pagehide stops accounting even if visibility/focus events are omitted", () => {
    const onDuration = vi.fn();
    const { unmount } = renderHook(() => useActiveStudyTime({ identity: card, enabled: true, onDuration }));
    advance(4000); act(() => window.dispatchEvent(new Event("pagehide")));
    advance(60000); act(() => window.dispatchEvent(new Event("pageshow")));
    advance(1000); unmount();
    expect(onDuration.mock.calls.map(([item]) => item.activeMilliseconds)).toEqual([4000, 1000]);
  });

  test("a face/answer rerender and StrictMode do not restart or duplicate the measurement", () => {
    const onDuration = vi.fn();
    const { rerender, unmount } = renderHook(({ revealed }) => {
      void revealed;
      useActiveStudyTime({ identity: { ...card }, enabled: true, onDuration });
    }, { initialProps: { revealed: false }, wrapper: ({ children }) => <React.StrictMode>{children}</React.StrictMode> });
    advance(5000); rerender({ revealed: true }); advance(10000); unmount();
    expect(onDuration.mock.calls.map(([item]) => item.activeMilliseconds)).toEqual([15000]);
  });

  test("no session/card identity means no timer or reported time", () => {
    const onDuration = vi.fn();
    renderHook(() => useActiveStudyTime({ identity: null, enabled: true, onDuration }));
    advance(60000); expect(onDuration).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});
