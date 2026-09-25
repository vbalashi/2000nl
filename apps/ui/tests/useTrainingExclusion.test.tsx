import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { useTrainingExclusion } from "@/components/training/v2/useTrainingExclusion";
import {
  getExclusionUndo,
  rememberExclusionUndo,
} from "@/components/training/v2/trainingExclusionUndoStore";
import { performTrainingExclusion } from "@/lib/platform/trainingExclusionClient";
vi.mock("@/lib/platform/trainingExclusionClient", () => ({
  performTrainingExclusion: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  rememberExclusionUndo(null);
});
test("uncertain retry reuses the request and acceptance advances only once", async () => {
  const onAccepted = vi.fn(async () => {});
  vi.mocked(performTrainingExclusion)
    .mockRejectedValueOnce(new Error("timeout"))
    .mockResolvedValueOnce({
      status: "duplicate",
      actionId: "exclude-pair",
      clientEventId: "event",
      exclusionId: "mark",
      excluded: true,
      family: "meaning",
    });
  const { result } = renderHook(() =>
    useTrainingExclusion({
      userId: "user",
      identity: "entry:direct",
      sessionId: "session",
      target: {
        kind: "meaning",
        entryId: "entry",
        cardTypeId: "word-to-definition",
      },
      onAccepted,
    }),
  );
  await act(() => result.current.exclude());
  expect(result.current.failed).toBe(true);
  expect(onAccepted).not.toHaveBeenCalled();
  await act(() => result.current.exclude());
  expect(vi.mocked(performTrainingExclusion).mock.calls[1][0]).toEqual(
    vi.mocked(performTrainingExclusion).mock.calls[0][0],
  );
  expect(onAccepted).toHaveBeenCalledTimes(1);
  expect(getExclusionUndo()).toMatchObject({
    userId: "user",
    request: { actionId: "restore-pair", exclusionId: "mark" },
  });
  await act(() => result.current.exclude());
  expect(performTrainingExclusion).toHaveBeenCalledTimes(2);
});
test("an accepted action with failed presentation never becomes another exclusion", async () => {
  vi.mocked(performTrainingExclusion).mockResolvedValue({
    status: "accepted",
    actionId: "exclude-pair",
    clientEventId: "event",
    exclusionId: "mark",
    excluded: true,
    family: "idiom",
  });
  const onAccepted = vi.fn(async () => {
    throw new Error("next-card failed");
  });
  const { result } = renderHook(() =>
    useTrainingExclusion({
      userId: "user",
      identity: "idiom",
      sessionId: "session",
      target: { kind: "exercise", targetId: "target" },
      onAccepted,
    }),
  );
  await act(() => result.current.exclude());
  await act(() => result.current.exclude());
  expect(performTrainingExclusion).toHaveBeenCalledTimes(1);
  expect(getExclusionUndo()).not.toBeNull();
});

test("superseded sessions recover instead of retrying the invalid session forever",async()=>{
  vi.mocked(performTrainingExclusion).mockRejectedValueOnce(new Error("training_session_superseded"));
  const onSessionSuperseded=vi.fn();
  const {result}=renderHook(()=>useTrainingExclusion({userId:"user",identity:"entry",sessionId:"old-session",target:{kind:"exercise",targetId:"target"},onAccepted:vi.fn(),onSessionSuperseded}));
  await act(()=>result.current.exclude());
  expect(onSessionSuperseded).toHaveBeenCalledTimes(1);
  await act(()=>result.current.exclude());
  expect(performTrainingExclusion).toHaveBeenCalledTimes(1);
});
