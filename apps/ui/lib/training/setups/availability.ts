import type {TrainingMode} from "@/lib/types";
import type {TrainingSetupDraft} from "./types";
export type TrainingSetupOption = {value:string;label:string;modes?:TrainingMode[]};

/** Retain historical recipes without allowing new independent sentence runs. */
export const isTrainingSetupPaused = (draft: Pick<TrainingSetupDraft, "family" | "scenarioId">) =>
  draft.family === "sentence" || draft.scenarioId === "sentences";

export const isTrainingSetupDraftSupported = (
  draft: Pick<TrainingSetupDraft, "scenarioId" | "modes" | "family">,
  scenarios: TrainingSetupOption[],
) => {
  if (isTrainingSetupPaused(draft)) return false;
  const scenario = scenarios.find(
    (option) => option.value === draft.scenarioId,
  );
  return Boolean(
    scenario?.modes?.length &&
    draft.modes.length > 0 &&
    draft.modes.every((mode) => scenario.modes?.includes(mode)),
  );
};

export const isTrainingSetupMaterialAvailable = (
  draft: Pick<TrainingSetupDraft, "listValue" | "materialMode" | "dictionaryIds">,
  lists: TrainingSetupOption[],
  dictionaries: TrainingSetupOption[] = [],
) => {
  if (draft.materialMode === "all-dictionaries") return dictionaries.length > 0;
  if (draft.materialMode === "selected-dictionaries") {
    return Boolean(draft.dictionaryIds?.some((id) => dictionaries.some((source) => source.value === id)));
  }
  return lists.some((option) => option.value === draft.listValue);
};

