import { CHECKPOINT_KEY, readCheckpoint, saveCheckpoint, restorableStage, type Checkpoint } from "@/app/dev/onboarding-preview/checkpoint";
import { newPreviewDraft } from "@/app/dev/onboarding-preview/journeyState";
const sample = (): Checkpoint => ({ version: 1, stage: "source-pick", running: false, revealed: false,
  selectedEntryId: "meaning-furniture", collectionId: "collection-a", selectedTrainingId: "preview-dilum",
  editingTrainingId: null, sessionCompleted: 1, pane: "home", theme: "dark", topics: ["stats", "sharing"],
  builder: { draft: { ...newPreviewDraft(), materialMode: "collection", listValue: "user:collection-a" }, name: "My draft" } });
function store(initial = "null") { let value = initial; return { getItem: () => value, setItem: vi.fn((_key: string, next: string) => { value = next; }) }; }
test("pause and reload retain the action, meaning, collection, builder draft and remaining topics", () => {
 const storage = store(); expect(saveCheckpoint(storage, sample())).toBe(true);
 expect(storage.setItem).toHaveBeenCalledWith(CHECKPOINT_KEY, expect.any(String));
 expect(readCheckpoint(storage)).toEqual(sample());
});
test("completed card and detail return can be restored without changing learned progress", () => {
 for (const stage of ["answer", "details-return", "basic-complete"] as const) {
  const saved={...sample(),stage,running:true,revealed:true}; expect(readCheckpoint(store(JSON.stringify(saved)))).toEqual(saved);
 }
});
test.each(["broken", JSON.stringify({...sample(),stage:"removed-step"}), JSON.stringify({...sample(),builder:{draft:{},name:"bad"}}), JSON.stringify({...sample(),topics:["unknown"]})])("rejects stale or malformed checkpoint %s", raw => { expect(readCheckpoint(store(raw))).toBeNull(); });
test("unavailable checkpoint storage does not pretend progress was saved", () => {
 expect(saveCheckpoint({getItem:()=>null,setItem:()=>{throw new Error("denied");}},sample())).toBe(false);
 expect(readCheckpoint({getItem:()=>{throw new Error("denied");},setItem:()=>{}})).toBeNull();
});

test("reload restores editor tasks at visible openers, preserving draft separately", () => {
 expect(restorableStage("source-pick")).toBe("source-open");
 expect(restorableStage("direction-pick")).toBe("exercise-open");
 expect(restorableStage("training-name")).toBe("save-training");
 expect(restorableStage("collection-name")).toBe("new-collection");
 expect(restorableStage("details-return")).toBe("details-return");
});
