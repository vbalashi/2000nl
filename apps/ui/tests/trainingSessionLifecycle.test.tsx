import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { useTrainingExerciseProgress } from "@/components/training/useTrainingExerciseProgress";
import { useTrainingSessionLifecycle } from "@/components/training/useTrainingSessionLifecycle";
import { clearTrainingSessionResume } from "@/lib/training/sessionResumeStore";
import type { TrainingSessionProgress } from "@/lib/training/sessionLifecycle";
vi.mock("@/lib/training/sessionResumeStore", () => ({clearTrainingSessionResume:vi.fn()}));
beforeEach(() => { vi.clearAllMocks(); });

function useRun() {
  const [session, setSession] = useState({sessionId:"run",completedActions:0,plannedTotal:5,completionReason:null} as TrainingSessionProgress & {plannedTotal:number});
  const resumable = useTrainingSessionLifecycle("owner", session);
  const progress = useTrainingExerciseProgress(session, update => setSession(current => ({...current,...update})));
  return {resumable,...progress};
}

test("accepted progress survives a parent rerender and partial runs keep their resume record", () => {
  const {result,rerender} = renderHook(useRun);
  act(() => {result.current.accept();result.current.accept();});
  rerender();
  expect(result.current.completed).toBe(2);
  expect(result.current.resumable).toBe(true);
  expect(clearTrainingSessionResume).not.toHaveBeenCalled();
});

for (const [status,count] of [["completed",5],["exhausted",2],["exhausted",0]] as const) {
  test(`${status} with ${count} accepted actions finalizes once, regardless of requested size`, async () => {
    const {result,rerender} = renderHook(useRun);
    act(() => {result.current.finish({status,completedActions:count});});
    expect(result.current.completed).toBe(count);
    expect(result.current.resumable).toBe(false);
    await waitFor(() => expect(clearTrainingSessionResume).toHaveBeenCalledWith("owner"));
    rerender();
    expect(clearTrainingSessionResume).toHaveBeenCalledTimes(1);
  });
}

test("ordinary-card exhaustion uses the same finalizer without inventing completion on a load failure", async () => {
  const {result,rerender} = renderHook(({exhausted}) => useTrainingSessionLifecycle("owner", {
    sessionId:"meaning-run",completedActions:2,plannedTotal:5,exhausted,
  }), {initialProps:{exhausted:false}});
  expect(result.current).toBe(true);
  expect(clearTrainingSessionResume).not.toHaveBeenCalled();
  rerender({exhausted:true});
  expect(result.current).toBe(false);
  await waitFor(() => expect(clearTrainingSessionResume).toHaveBeenCalledWith("owner"));
});
