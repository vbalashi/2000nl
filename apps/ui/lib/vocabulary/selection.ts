export {libraryTrainingCriteria,DEFAULT_VOCABULARY_SELECTION,parseVocabularySelection,parseLibraryTrainingSelection,validFrequencyRange,vocabularySelectionActive} from "../../../../packages/shared/vocabulary-selection/v1";
export type {FrequencyProfile,VocabularyMaterialKind,MeaningLimit,VocabularySelection,LibraryTrainingSelection} from "../../../../packages/shared/vocabulary-selection/v1";
import type {MeaningLimit} from "../../../../packages/shared/vocabulary-selection/v1";
export const MEANING_LIMIT_STEPS:readonly MeaningLimit[]=[1,2,3,4,5,"all"];
export function frequencyRangeSteps(from:number,to:number):number[]{return [...new Set([1,50,100,200,500,1000,2000,5000,10000,from,to].filter(rank=>Number.isSafeInteger(rank)&&rank>=1))].sort((a,b)=>a-b);}
