import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useTrainingSessionPlan } from "@/components/training/v2/useTrainingSessionPlan";
import type { TrainingSessionPlan } from "@/lib/types";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const plan = (plannedTotal: number): TrainingSessionPlan => ({
  plannedNew: plannedTotal,
  plannedReview: 0,
  plannedPractice: 0,
  plannedTotal,
  plannedAt: "2026-08-21T12:00:00.000Z",
});

test("publishes only the plan atomically bound to the current session generation and scope", async () => {
  const first = deferred<TrainingSessionPlan | null>();
  const second = deferred<TrainingSessionPlan | null>();
  const fetchPlan = vi
    .fn()
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => second.promise);
  const view = renderHook(
    ({ active, sessionGeneration, scopeKey }) =>
      useTrainingSessionPlan({
        active,
        sessionGeneration,
        scopeKey,
        fetchPlan,
      }),
    {
      initialProps: {
        active: true,
        sessionGeneration: 1,
        scopeKey: "scope-a",
      },
    },
  );

  view.rerender({ active: true, sessionGeneration: 2, scopeKey: "scope-b" });
  act(() => first.resolve(plan(7)));
  expect(view.result.current.snapshot).toBeNull();

  act(() => second.resolve(plan(3)));
  await waitFor(() =>
    expect(view.result.current.snapshot).toEqual({
      sessionGeneration: 2,
      scopeKey: "scope-b",
      plan: plan(3),
    }),
  );

  view.rerender({ active: false, sessionGeneration: 2, scopeKey: "scope-b" });
  expect(view.result.current.snapshot).toBeNull();
});
