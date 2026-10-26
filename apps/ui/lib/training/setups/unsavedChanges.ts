import { canonicalDraft, type SavedTraining } from "./model";
import type { TrainingSetupDraft } from "./types";
function comparableDraft(draft: TrainingSetupDraft) {
  return canonicalDraft({...draft, family:draft.family??"meaning",materialMode:draft.materialMode??"collection",sessionSize:draft.sessionSize??10,
    modes:[...draft.modes].sort(),dictionaryIds:[...(draft.dictionaryIds??[])].sort(),partOfSpeech:[...(draft.partOfSpeech??[])].sort(),nounArticles:[...(draft.nounArticles??[])].sort()});
}
/** Compare recipe values, not interaction history or array selection order. */
export function hasUnsavedTrainingChanges(saved: SavedTraining|undefined,current:{name:string;languageCode:string;draft:TrainingSetupDraft}) {
  return Boolean(saved && (saved.name.trim()!==current.name.trim() || saved.languageCode!==current.languageCode || JSON.stringify(comparableDraft(saved.draft))!==JSON.stringify(comparableDraft(current.draft))));
}
