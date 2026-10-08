import { afterEach, expect, it, vi } from "vitest";
import { completeMeaningExclusionResume, getExclusionUndo, rememberExclusionUndo, subscribeRestoredExclusion } from "../components/training/v2/trainingExclusionUndoStore";
afterEach(() => rememberExclusionUndo(null));
it("accepted meaning resume clears only the matching exclusion notification", () => {
  rememberExclusionUndo({userId:"owner",request:{actionId:"restore-headword",clientEventId:"event",exclusionId:"mark",target:{kind:"headword",entryId:"entry"}}});
  const restored = vi.fn();
  const unsubscribe = subscribeRestoredExclusion(restored);
  completeMeaningExclusionResume("other-mark");
  expect(getExclusionUndo()).not.toBeNull();
  expect(restored).not.toHaveBeenCalled();
  completeMeaningExclusionResume("mark");
  expect(getExclusionUndo()).toBeNull();
  expect(restored).toHaveBeenCalledWith("owner","mark");
  unsubscribe();
});
