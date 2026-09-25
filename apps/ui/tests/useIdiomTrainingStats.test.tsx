import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { readIdiomTrainingStats } from "@/lib/training/idiomStatsClient";
import { useIdiomTrainingStats } from "@/components/training/pilot/useIdiomTrainingStats";
vi.mock("@/lib/training/idiomStatsClient", () => ({ readIdiomTrainingStats: vi.fn() }));
const stats = { contractVersion: "training-idiom-stats-v1" as const, newCardsToday: 1,
  reviewCardsDone: 2, reviewCardsDue: 3, totalCardsStarted: 4, totalCardsInScope: 9 };
test("late counts cannot replace the new session or freeze its denominator", async () => {
  let resolveOld!: (value: typeof stats) => void;
  vi.mocked(readIdiomTrainingStats).mockImplementationOnce(() => new Promise(resolve => {resolveOld=resolve;}))
    .mockResolvedValueOnce({...stats,reviewCardsDue:8});
  const {result,rerender} = renderHook(({sessionId}) => useIdiomTrainingStats(sessionId,0),{initialProps:{sessionId:"old"}});
  rerender({sessionId:"new"});
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.initialReviewDue).toBe(10);
  await act(async () => resolveOld({...stats,totalCardsInScope:999}));
  expect(result.current.stats?.totalCardsInScope).toBe(9);
  expect(result.current.initialReviewDue).toBe(10);
});
