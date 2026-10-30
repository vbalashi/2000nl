import { previewSteps, type PreviewStage } from "./content";
import { isTrainingSetupDraft } from "@/lib/training/setups/model";
import type { TrainingSetupDraft } from "@/lib/training/setups/types";

export const CHECKPOINT_KEY = "2000nl:onboarding-preview:checkpoint:v1";
export type PreviewTopic = "collections" | "card" | "stats" | "sharing" | "languages" | "appearance";
export type BuilderCheckpoint = { draft: TrainingSetupDraft; name: string };
export type Checkpoint = {
  version: 1; stage: PreviewStage; running: boolean; revealed: boolean;
  selectedEntryId: string | null; collectionId: string | null;
  selectedTrainingId: string; editingTrainingId: string | null;
  sessionCompleted: number; pane: "home" | "languages" | "appearance"; theme: "light" | "dark"; topics: PreviewTopic[]; builder: BuilderCheckpoint | null;
};
type Store = Pick<Storage, "getItem" | "setItem">;
export function readCheckpoint(storage: Store): Checkpoint | null {
  try {
    const value = JSON.parse(storage.getItem(CHECKPOINT_KEY) ?? "null");
    if (!value || value.version !== 1 || !previewSteps.some(step => step.id === value.stage)
      || typeof value.running !== "boolean" || typeof value.revealed !== "boolean"
      || typeof value.selectedTrainingId !== "string" || !Number.isInteger(value.sessionCompleted) || value.sessionCompleted < 0
      || ![value.selectedEntryId, value.collectionId, value.editingTrainingId].every(id => id === null || typeof id === "string")
      || (value.builder !== null && (!value.builder || typeof value.builder.name !== "string" || !isTrainingSetupDraft(value.builder.draft)))) return null;
    if (!["home", "languages", "appearance"].includes(value.pane)) return null;
    if (value.theme !== "light" && value.theme !== "dark") return null;
    if (!Array.isArray(value.topics) || !value.topics.every((topic: unknown) => ["collections", "card", "stats", "sharing", "languages", "appearance"].includes(String(topic)))) return null;
    return value as Checkpoint;
  } catch { return null; }
}
export function saveCheckpoint(storage: Store, checkpoint: Checkpoint): boolean {
  try { storage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoint)); return true; } catch { return false; }
}

// Shared editors own transient accordion/dialog state. After a reload, restore
// the same task and draft at its preceding visible opener rather than an absent target.
export function restorableStage(stage: PreviewStage): PreviewStage {
  if (stage === "source-pick") return "source-open";
  if (stage === "direction-pick") return "exercise-open";
  if (stage === "training-name") return "save-training";
  if (stage === "collection-name" || stage === "collection-done") return "new-collection";
  return stage;
}
