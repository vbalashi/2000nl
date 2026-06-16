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
export { fetchRecentHistory, fetchStats } from "./training/statsHistoryService";
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
  searchDictionaryEntriesV2,
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
  fetchNextTrainingWord,
  fetchNextTrainingWordByScenario,
  fetchScenarioStats,
  fetchTrainingScenarios,
} from "./training/selectionService";

export { type ReviewResult } from "./types";
