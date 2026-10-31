import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { useTrainingRunSelection, type TrainingRunSelection } from "@/lib/training/useTrainingRunSelection";

const selection: TrainingRunSelection = {
  sessionId: "run-a", family: "meaning", languageCode: "nl", scenarioId: "understanding",
  modes: ["definition-to-word"], cardFilter: "review", newReviewRatio: 2,
  listId: "list-a", listType: "curated", sessionSize: 10,
  focusFilter: { dateWindow: "all", partOfSpeech: ["zn"] },
};

test.each(["meaning", "word-in-context", "idiom", "sentence"] as const)(
  "%s start/resume owns a copy independent of later draft mutation; explicit replacement releases it",
  family => {
    const draft = structuredClone({ ...selection, family });
    const view = renderHook(() => useTrainingRunSelection());
    act(() => view.result.current.latch(draft));
    const latched = view.result.current.selection;
    draft.modes.push("word-to-definition");
    draft.focusFilter.partOfSpeech!.push("ww");
    draft.listId = "different-list";
    view.rerender();
    expect(view.result.current.selection).toBe(latched);
    expect(latched).toEqual({ ...selection, family });
    const checkPendingRead = view.result.current.isCurrent;
    expect(checkPendingRead("run-a", family)).toBe(true);
    act(() => view.result.current.latch({ ...selection, sessionId: "run-b", family }));
    expect(checkPendingRead("run-a", family)).toBe(false);
    expect(view.result.current.selection?.sessionId).toBe("run-b");
    act(() => view.result.current.release());
    expect(view.result.current.selection).toBeNull();
    expect(checkPendingRead("run-b", family)).toBe(false);
  },
);

test("an earlier selection object cannot own a rebound run with the same server ID",()=>{
 const hook=renderHook(()=>useTrainingRunSelection());
 act(()=>hook.result.current.latch({sessionId:"same",family:"meaning",languageCode:"nl",scenarioId:"understanding",modes:["word-to-definition"],cardFilter:"both",newReviewRatio:2,listId:null,listType:null,focusFilter:{dateWindow:"all"},sessionSize:5}));
 const previous=hook.result.current.selection!;expect(hook.result.current.owns(previous)).toBe(true);
 act(()=>hook.result.current.latch(previous));expect(hook.result.current.owns(previous)).toBe(false);expect(hook.result.current.owns(hook.result.current.selection!)).toBe(true);
});
