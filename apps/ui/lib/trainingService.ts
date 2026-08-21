export {
  fetchUserPreferences,
  updateUserPreferences,
  type UserPreferences,
} from "./training/preferencesService";
export {
  copyEntryToUserDictionary,
  createUserDictionaryEntry,
  fetchDictionaryEntry,
  fetchDictionaryEntryById,
  fetchTrainingWordById,
  fetchTrainingWordByLookup,
} from "./training/dictionaryService";
export {
  fetchLastReviewDebug,
  recordDefinitionClick,
  recordReview,
  recordWordView,
  type LastReviewDebug,
  type RecordReviewParams,
  type WordStatusAfterReview,
} from "./training/reviewService";
export { fetchStats } from "./training/statsService";
export {
  fetchActiveList,
  fetchActiveTrainingScope,
  fetchAvailableDictionarySources,
  fetchAvailableLearningLanguages,
  fetchAvailableLists,
  fetchCuratedLists,
  fetchEntryListMemberships,
  fetchUserListMembership,
  fetchListSummaryById,
  fetchUserLists,
  fetchWordsForList,
  searchDictionaryGroups,
  searchWordEntries,
  removeWordsFromUserList,
  deleteUserList,
  createUserList,
  updateUserList,
  addWordsToUserList,
  updateActiveList,
  updateActiveTrainingScope,
} from "./training/listService";
export {
  createTrainingScenarioCatalog,
  createTrainingSessionPlanKey,
  fetchNextTrainingWord,
  fetchNextTrainingWordByScenario,
  fetchTrainingFilterSources,
  fetchScenarioStats,
  fetchTrainingScenarios,
  fetchTrainingSessionPlan,
  isTrainingFocusFilterActive,
  type TrainingScenarioCatalog,
  type TrainingSessionPlanScope,
} from "./training/selectionService";

export { type ReviewResult } from "./types";
