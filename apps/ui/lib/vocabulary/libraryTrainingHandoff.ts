import type {TrainingSetupDraft} from "@/lib/training/setups/types";
import type {LibraryEntryFilters} from "@/lib/platform/librarySearchScope";
import {partCode} from "./partsOfSpeech";
export type LibraryTrainingHandoff={languageCode:string;material:Pick<TrainingSetupDraft,"materialMode">&Partial<TrainingSetupDraft>};
/** Copy criteria, never a result page or a mutable session. */
export function librarySelectionToTraining(scope:{languageCode:string;filters:LibraryEntryFilters;dictionaryId?:string|null;labelId?:string|null;labelName?:string|null;collection?:{id:string;type:"user"|"curated"};query:string;category?:"headwords"|"examples"|"definitions"|"alphabetical"}):LibraryTrainingHandoff{
 const {filters}=scope;
 return {languageCode:scope.languageCode,material:{
  ...(scope.collection?{materialMode:"collection" as const,listValue:`${scope.collection.type}:${scope.collection.id}`,dictionaryIds:undefined}:scope.dictionaryId?{materialMode:"selected-dictionaries" as const,dictionaryIds:[scope.dictionaryId],listValue:""}:{materialMode:"all-dictionaries" as const,dictionaryIds:undefined,listValue:""}),
  vocabulary:filters.vocabulary?{...filters.vocabulary,materialKinds:[...filters.vocabulary.materialKinds]}:undefined,
  partOfSpeech:filters.parts.map(partCode),nounArticles:filters.article?[filters.article]:[],
  librarySelection:scope.collection||scope.query.trim()||scope.labelId?{languageCode:scope.languageCode,query:scope.query.trim(),category:scope.category??"headwords",...(scope.labelId?{labelId:scope.labelId,...(scope.labelName?{labelName:scope.labelName}:{})}:{})}:undefined,
  dateWindow:"all",sourceValue:"all",daysAgo:undefined,
 }};
}
