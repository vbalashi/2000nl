export {
  fetchUserPreferences,
  updateUserPreferences,
  type UserPreferences,
} from "./training/preferencesService";
export {
  fetchDictionaryEntry,
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
  fetchAvailableLists,
  fetchCuratedLists,
  fetchUserListMembership,
  fetchListSummaryById,
  fetchUserLists,
  fetchWordsForList,
  searchWordEntries,
  removeWordsFromUserList,
  deleteUserList,
  createUserList,
  addWordsToUserList,
  updateActiveList,
} from "./training/listService";
export {
  fetchNextTrainingWord,
  fetchNextTrainingWordByScenario,
  fetchScenarioStats,
  fetchTrainingScenarios,
} from "./training/selectionService";

export { type ReviewResult } from "./types";
