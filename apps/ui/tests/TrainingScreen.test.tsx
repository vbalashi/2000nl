import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import type {
  ActiveTrainingScope,
  DictionaryEntry,
  TrainingScenario,
} from "@/lib/types";
import type { TrainingSessionSnapshot } from "@/lib/trainingService";
import type { AppDestination } from "@/components/navigation/appDestination";
import { TrainingSessionSurface } from "@/components/training/v2/TrainingSessionSurface";
import type { TrainingSessionNoticeInput } from "@/components/training/v2/TrainingSessionSurface";
import type { TrainingSessionChromeProps } from "@/components/training/v2/TrainingSessionChrome";
import type { FooterStatsProps } from "@/components/training/FooterStats";
import type { PlatformHeadwordGroupV2 } from "../../../packages/shared/types/platformV2";
import {
  releaseTrainingSessionOwner,
  writeTrainingSessionResume,
} from "@/lib/training/sessionResumeStore";

// Screen integration tests exercise the real V2 transition owner. The card
// stub models asynchronous acceptance; actual capabilities, keys, swipe and
// content are covered by TrainingSenseCardV2Session/Stage tests.

function getPrimaryNavigation() {
  return screen.getByRole("navigation", { name: "Primary" });
}

const mockWord = {
  id: "word-1",
  headword: "huis",
  mode: "word-to-definition",
  isFirstEncounter: false,
  raw: {
    meanings: [{ definition: "Een gebouw", links: [] }],
  },
};

const overrideWord = {
  ...mockWord,
  id: "word-2",
  headword: "boom",
};

const normalNextWord = {
  ...mockWord,
  id: "word-3",
  headword: "fiets",
};

const defaultAvailableList = {
  id: "list-1",
  name: "Test list",
  type: "curated" as const,
  item_count: 1,
};

const activeList = {
  id: "list-active",
  name: "Active list",
  type: "curated" as const,
  item_count: 10,
  card_policy: "restrict" as const,
  card_type_ids: ["listen-recognize"],
};

const secondaryList = {
  id: "list-secondary",
  name: "Secondary list",
  type: "curated" as const,
  item_count: 2,
  default_scenario_id: "listening",
};

const userOwnedList = {
  id: "list-user",
  name: "My saved words",
  type: "user" as const,
  item_count: 3,
};

const mixedUserList = {
  id: "list-mixed",
  name: "Travel mix",
  type: "user" as const,
  item_count: 4,
  is_mixed_language: true,
};

const dictionarySourceList = {
  id: "list-dictionary",
  name: "VanDale",
  type: "curated" as const,
  item_count: 0,
};

const dictionaryHuis = {
  id: "word-1",
  headword: "huis",
  part_of_speech: "zn",
  raw: { meanings: [{ definition: "Een gebouw", links: [] }] },
  is_nt2_2000: true,
};

const dictionaryBoom = {
  id: "word-2",
  headword: "boom",
  part_of_speech: "zn",
  raw: { meanings: [{ definition: "Een hoge plant", links: [] }] },
  is_nt2_2000: false,
};

const dictionaryCompound = {
  id: "word-3",
  headword: "bejaardenhuis",
  part_of_speech: "zn",
  raw: { meanings: [{ definition: "Een tehuis voor ouderen", links: [] }] },
  is_nt2_2000: false,
};

const dictionarySter = {
  id: "word-ster",
  headword: "ster",
  part_of_speech: "zn",
  raw: { meanings: [{ definition: "Een hemellichaam", links: [] }] },
  is_nt2_2000: false,
};

const dictionaryStedelijk = {
  id: "word-stedelijk",
  headword: "stedelijk",
  part_of_speech: "bn",
  raw: { meanings: [{ definition: "Met een stad te maken", links: [] }] },
  is_nt2_2000: false,
};

const userDictionaryGedoe = {
  id: "user-entry-1",
  dictionary_id: "dict-user",
  dictionary_name: "My dictionary",
  dictionary_slug: "user-user-1-nl",
  dictionary_kind: "user",
  language_code: "nl",
  headword: "gedoe",
  part_of_speech: "zn",
  raw: {
    headword: "gedoe",
    languageCode: "nl",
    definition: "lastige situatie",
    translation: { languageCode: "en", text: "hassle" },
  },
  is_nt2_2000: false,
};

const fetchNextTrainingWordByScenario = vi.fn().mockResolvedValue(mockWord);
const fetchStats = vi.fn().mockResolvedValue({
  newWordsToday: 0,
  newCardsToday: 0,
  learningStartedToday: 0,
  graduatedNewWordsToday: 0,
  dailyNewLimit: 10,
  reviewWordsDone: 0,
  reviewCardsDone: 0,
  reviewWordsDue: 0,
  reviewCardsDue: 0,
  totalWordsLearned: 0,
  totalWordsInList: 2000,
});
const prefetchPlatformV2TrainingEntry = vi.fn().mockResolvedValue({
  state: "ready",
  group: { header: { audio: null, text: "huis" } },
  entry: { entryId: mockWord.id },
});
const preparePlatformV2TrainingEntry = vi.fn().mockResolvedValue({
  state: "ready",
  translation: "cached",
  audio: "ready",
});
const preloadPlatformV2Audio = vi.fn().mockResolvedValue(undefined);
const clearPlatformV2TrainingClientCaches = vi.fn();
const mockV2ProgressAction = vi.fn();
const mockV2ProgressActionCompleted = vi.fn();
let mockV2AcceptanceGate: Promise<void> | null = null;
let mockV2SessionState: "ready" | "loading" = "ready";
const fetchAvailableLists = vi.fn().mockResolvedValue([defaultAvailableList]);
const fetchAvailableLearningLanguages = vi.fn().mockResolvedValue([
  {
    code: "nl",
    label: "Nederlands",
    dictionaryCount: 1,
    curatedListCount: 1,
    userListCount: 0,
    hasTrainingEligibleLists: true,
  },
  {
    code: "en",
    label: "English",
    dictionaryCount: 2,
    curatedListCount: 1,
    userListCount: 0,
    hasTrainingEligibleLists: true,
  },
]);
const fetchAvailableDictionarySources = vi.fn().mockResolvedValue([
  {
    id: "dict-vandale",
    languageCode: "nl",
    slug: "nl-vandale",
    name: "VanDale woordenboek",
    kind: "curated",
    visibility: "public",
    isEditable: false,
    entryCount: 2000,
  },
]);
const defaultActiveTrainingScope: ActiveTrainingScope = {
  languageCode: "nl",
  activeListId: null,
  activeListType: null,
  activeScenario: "understanding",
  cardFilter: "both",
  modesEnabled: ["word-to-definition"],
  newReviewRatio: 2,
  hasSavedScope: false,
  isValid: true,
};
const fetchActiveTrainingScope = vi
  .fn()
  .mockResolvedValue(defaultActiveTrainingScope);
const fetchListSummaryById = vi.fn().mockResolvedValue(null);
const updateActiveTrainingScope = vi
  .fn()
  .mockResolvedValue({ scope: null, error: null });
const searchWordEntries = vi.fn().mockResolvedValue({
  items: [dictionaryHuis],
  total: 1,
});
const searchDictionaryGroups = vi.fn().mockResolvedValue({
  items: [dictionaryHuis],
  total: 1,
});
const fetchPlatformV2LibraryGroupPage = vi.fn(
  async ({
    query,
    contentLanguageCode,
  }: {
    query: string;
    contentLanguageCode: string;
  }) => {
    const result = await searchDictionaryGroups({
      query,
      languageCode: contentLanguageCode,
      dictionaryIds: undefined,
      limit: 6,
    });
    return {
      groups: result.items.map((entry: DictionaryEntry) => ({
        headwordGroupId: `group-${entry.id}`,
        dictionary: {
          dictionaryId: entry.dictionary_id ?? "dictionary-vandale",
          sourceLanguageCode: entry.language_code ?? contentLanguageCode,
          displayName: entry.dictionary_name ?? "Van Dale",
          messageKey: "dictionary.source",
        },
        header: { text: entry.headword },
        senseCount: 1,
        entryCount: 1,
        indicators: entry.is_nt2_2000
          ? [
              {
                indicatorId: "nt2-2000",
                value: "true",
                messageKey: "indicator.nt2-2000",
              },
            ]
          : [],
        entries: [
          {
            kind: "sense-card" as const,
            entryId: entry.id,
            meaningOrdinal: 1,
            partOfSpeech: entry.part_of_speech
              ? {
                  termId: `pos:${entry.part_of_speech}`,
                  messageKey: `pos.${entry.part_of_speech}`,
                  sourceValue: entry.part_of_speech,
                }
              : undefined,
            card: null,
            contentRevision: `revision-${entry.id}`,
            summaryContentNodeId: `definition-${entry.id}`,
            contentNodes: [
              {
                contentNodeId: `definition-${entry.id}`,
                parentContentNodeId: null,
                kind: "definition" as const,
                order: 0,
                text:
                  entry.raw.meanings?.[0]?.definition ??
                  "Geen definitie beschikbaar.",
                sourceTextFingerprint: `fingerprint-${entry.id}`,
                translations: [],
              },
            ],
            translation: null,
            capabilities: [],
          },
        ],
      })),
      selectedTierComplete: true,
      nextGroupCursor: null,
    };
  },
);
const fetchWordsForList = vi.fn().mockResolvedValue({
  items: [dictionaryHuis],
  total: 1,
});
const fetchPlatformV2LibraryGroup = vi.fn(
  async ({
    query,
    entryId,
    contentLanguageCode,
  }: {
    query: string;
    entryId: string;
    contentLanguageCode: string;
  }): Promise<PlatformHeadwordGroupV2 | null> => {
    const page = await fetchPlatformV2LibraryGroupPage({
      query,
      contentLanguageCode,
    });
    const groups = page.groups as PlatformHeadwordGroupV2[];
    const matchingGroup = groups.find((group) =>
      group.entries.some(
        (entry) =>
          (entry.kind === "sense-card" && entry.entryId === entryId) ||
          (entry.kind === "cross-reference" &&
            entry.crossReferenceId === entryId),
      ),
    );
    if (matchingGroup) return matchingGroup;
    if (entryId !== userDictionaryGedoe.id) return null;
    const baseEntry = groups[0]?.entries[0];
    if (!baseEntry || baseEntry.kind !== "sense-card") return null;
    return {
      ...groups[0],
      headwordGroupId: "group-user-entry-1",
      header: { ...groups[0].header, text: userDictionaryGedoe.headword },
      entries: [
        {
          ...baseEntry,
          entryId,
          contentRevision: "revision-user-entry-1",
          contentNodes: baseEntry.contentNodes.map((node) => ({
            ...node,
            text: userDictionaryGedoe.raw.definition ?? node.text,
          })),
        },
      ],
    };
  },
);
const fetchDictionaryEntry = vi.fn().mockResolvedValue(null);
const fetchDictionaryEntryById = vi.fn().mockResolvedValue(null);
const fetchTrainingWordByLookup = vi.fn().mockResolvedValue(overrideWord);
const fetchEntryListMemberships = vi.fn().mockResolvedValue(new Map());
const createUserDictionaryEntry = vi.fn().mockResolvedValue("user-entry-1");
const copyEntryToUserDictionary = vi.fn().mockResolvedValue("user-entry-copy");
const addWordsToUserList = vi.fn().mockResolvedValue({ error: null });
const createUserList = vi.fn().mockResolvedValue(userOwnedList);
const fetchUserListMembership = vi.fn().mockResolvedValue(new Set());
const removeWordsFromUserList = vi.fn().mockResolvedValue({ error: null });
const deleteUserList = vi.fn().mockResolvedValue({ error: null });
const updateUserList = vi.fn().mockResolvedValue(userOwnedList);
const fetchTrainingScenarios = vi.fn().mockResolvedValue([
  {
    id: "understanding",
    enabled: true,
    nameNl: "Begrip",
    nameEn: "Understanding",
    description: null,
    cardModes: ["word-to-definition"],
    graduationThreshold: 0,
    sortOrder: 0,
  },
  {
    id: "listening",
    enabled: true,
    nameNl: "Luisteren",
    nameEn: "Listening",
    description: null,
    cardModes: ["listen-recognize"],
    graduationThreshold: 0,
    sortOrder: 1,
  },
]);
const createTrainingScenarioCatalog = vi.fn(() => {
  let request: ReturnType<typeof fetchTrainingScenarios> | null = null;
  const fetch = vi.fn(() => {
    request ??= fetchTrainingScenarios();
    return request;
  });
  const invalidate = vi.fn(() => {
    request = null;
  });
  return {
    fetch,
    invalidate,
    resolveModes: async (scenarioId: string) => {
      const scenarios = (await fetch()) as TrainingScenario[];
      return (
        scenarios.find((scenario) => scenario.id === scenarioId)?.cardModes ??
        null
      );
    },
  };
});
const fetchTrainingFilterSources = vi.fn().mockResolvedValue([
  {
    sourceId: "source-youtube-1",
    kind: "youtube_video",
    provider: "youtube",
    externalId: "video-1",
    title: "TRAPPIST-1",
    label: "YouTube · TRAPPIST-1",
    eventCount: 3,
    lastSeenAt: "2026-06-23T10:00:00Z",
  },
]);
const fetchTrainingSessionSnapshot = vi.fn().mockResolvedValue(null);
const isTrainingFocusFilterActive = vi.fn((filter) =>
  Boolean(
    filter &&
    (filter.dateWindow !== "all" ||
      filter.sourceId ||
      filter.sourceKind ||
      filter.externalId),
  ),
);
const fetchUserPreferences = vi.fn().mockResolvedValue({
  themePreference: "system",
  modesEnabled: ["word-to-definition"],
  cardFilter: "both",
  languageCode: "nl",
  newReviewRatio: 2,
  activeScenario: "understanding",
  translationLang: null,
});
const updateUserPreferences = vi.fn().mockResolvedValue(undefined);
const createTrainingSessionPlanKey = vi.fn(
  (userId: string, modes: string[], scope: unknown) =>
    JSON.stringify({ userId, modes, scope }),
);
const fetchTrainingSessionPlan = vi.fn().mockResolvedValue({
  plannedNew: 1,
  plannedReview: 1,
  plannedPractice: 0,
  plannedTotal: 2,
  plannedAt: "2026-08-21T12:00:00.000Z",
});
const startTrainingSession = vi.fn().mockResolvedValue({
  sessionId: "00000000-0000-4000-8000-000000000901",
  plannedNew: 1,
  plannedReview: 1,
  plannedPractice: 0,
  plannedTotal: 2,
  plannedAt: "2026-08-21T12:00:00.000Z",
});
const fetchRecentTrainingHistory = vi.fn().mockResolvedValue({
  items: [],
  hasMore: false,
});

vi.mock("@/lib/trainingService", () => ({
  createTrainingScenarioCatalog,
  createTrainingSessionPlanKey,
  fetchDictionaryEntry,
  fetchDictionaryEntryById,
  createUserDictionaryEntry,
  copyEntryToUserDictionary,
  fetchNextTrainingWord: vi.fn().mockResolvedValue(mockWord),
  fetchNextTrainingWordByScenario,
  fetchTrainingFilterSources,
  fetchTrainingSessionSnapshot,
  fetchTrainingScenarios,
  fetchTrainingSessionPlan,
  startTrainingSession,
  isTrainingFocusFilterActive,
  fetchStats,
  fetchActiveTrainingScope,
  fetchListSummaryById,
  fetchAvailableLists,
  fetchAvailableLearningLanguages,
  fetchAvailableDictionarySources,
  fetchWordsForList,
  searchDictionaryGroups,
  searchWordEntries,
  fetchEntryListMemberships,
  addWordsToUserList,
  createUserList,
  fetchUserListMembership,
  removeWordsFromUserList,
  deleteUserList,
  updateUserList,
  updateActiveTrainingScope,
  fetchTrainingWordByLookup,
  fetchUserPreferences,
  updateUserPreferences,
}));

vi.mock("@/lib/training/trainingHistoryService", () => ({
  fetchRecentTrainingHistory: () => fetchRecentTrainingHistory(),
}));

vi.mock("@/lib/platform/platformV2LibraryClient", () => ({
  fetchPlatformV2LibraryGroupPage: (input: {
    query: string;
    contentLanguageCode: string;
  }) => fetchPlatformV2LibraryGroupPage(input),
  fetchPlatformV2LibraryGroup: (
    input: Parameters<typeof fetchPlatformV2LibraryGroup>[0],
  ) => fetchPlatformV2LibraryGroup(input),
  requestPlatformV2LibraryTranslation: vi.fn().mockResolvedValue("failed"),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      signOut: vi.fn(),
    },
  },
}));

vi.mock("@/lib/platform/platformV2TrainingClient", () => ({
  prefetchPlatformV2TrainingEntry: (...args: unknown[]) =>
    prefetchPlatformV2TrainingEntry(...args),
  preloadPlatformV2Audio: (...args: unknown[]) =>
    preloadPlatformV2Audio(...args),
  clearPlatformV2TrainingClientCaches: (...args: unknown[]) =>
    clearPlatformV2TrainingClientCaches(...args),
}));

vi.mock("@/lib/platform/platformV2TrainingPreparationClient", () => ({
  preparePlatformV2TrainingEntry: (...args: unknown[]) =>
    preparePlatformV2TrainingEntry(...args),
}));

vi.mock("@/components/training/v2/TrainingSenseCardV2Session", () => ({
  TrainingSenseCardV2Session: ({
    word,
    trainingSessionId,
    presentationIdentity,
    focusOnPresentation,
    onOpenDetails,
    onLoadFailure,
    onRetryAlternative,
    onProgressActionAccepted,
    onProgressActionPendingChange,
    sessionChrome,
    sessionFooter,
    sessionNotice,
    interactionDisabled,
  }: {
    word: { headword: string };
    trainingSessionId?: string | null;
    presentationIdentity: string | null;
    focusOnPresentation?: boolean;
    onOpenDetails?: () => void;
    onLoadFailure?: (failure: "model-invalid") => void;
    onRetryAlternative?: (failure: "model-invalid") => void;
    onProgressActionAccepted: (capability: {
      actionId: string;
    }) => Promise<unknown>;
    onProgressActionPendingChange?: (pending: boolean) => void;
    sessionChrome?: TrainingSessionChromeProps | null;
    sessionFooter: FooterStatsProps;
    sessionNotice?: TrainingSessionNoticeInput | null;
    interactionDisabled?: boolean;
  }) => {
    const stageRef = React.useRef<HTMLDivElement>(null);
    // Match the real V2 session: a grade stays busy until the accepted-action
    // transition resolves, not merely until the next headword is rendered.
    const [busy, setBusy] = React.useState(false);
    const busyRef = React.useRef(false);
    const failed = word.headword === "broken-card";
    const loading = mockV2SessionState === "loading";
    React.useEffect(() => {
      if (focusOnPresentation) stageRef.current?.focus();
    }, [focusOnPresentation]);
    React.useEffect(() => {
      if (failed) onLoadFailure?.("model-invalid");
    }, [failed, onLoadFailure]);
    if (failed) {
      return (
        <TrainingSessionSurface
          phase="failure"
          chrome={sessionChrome}
          footer={sessionFooter}
          notice={sessionNotice}
        >
          <div role="alert" data-training-v2-state="model-invalid">
            This training card could not be loaded.
            <button
              type="button"
              onClick={() => onRetryAlternative?.("model-invalid")}
            >
              Try again
            </button>
          </div>
        </TrainingSessionSurface>
      );
    }
    if (loading) {
      return (
        <TrainingSessionSurface
          phase="loading"
          chrome={sessionChrome}
          footer={sessionFooter}
          notice={sessionNotice}
        >
          <div
            role="status"
            data-testid="training-v2-loading"
            data-training-v2-state="loading"
          >
            Loading training card
          </div>
        </TrainingSessionSurface>
      );
    }
    return (
      <TrainingSessionSurface
        phase="ready"
        chrome={sessionChrome}
        footer={sessionFooter}
        notice={sessionNotice}
      >
        <div
          ref={stageRef}
          tabIndex={-1}
          data-testid="mock-training-sense-card-v2"
          data-training-session-id={trainingSessionId ?? ""}
          data-presentation-identity={presentationIdentity ?? ""}
        >
          <span aria-live="polite">
            {focusOnPresentation ? "Next training card" : ""}
          </span>
          <h2>{word.headword}</h2>
          {onOpenDetails ? (
            <button type="button" onClick={onOpenDetails}>
              Word details
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || interactionDisabled}
            onClick={async () => {
              if (busyRef.current || interactionDisabled) return;
              busyRef.current = true;
              setBusy(true);
              onProgressActionPendingChange?.(true);
              try {
                mockV2ProgressAction();
                // The real session awaits the server mutation before invoking
                // acceptance. Do not turn a click into a synchronous receipt.
                await Promise.resolve();
                const result = await onProgressActionAccepted({
                  actionId: "review-card",
                });
                if (mockV2AcceptanceGate) await mockV2AcceptanceGate;
                mockV2ProgressActionCompleted(result);
              } finally {
                onProgressActionPendingChange?.(false);
                busyRef.current = false;
                setBusy(false);
              }
            }}
          >
            Mock V2 grade
          </button>
        </div>
      </TrainingSessionSurface>
    );
  },
  TrainingKnownUndoNotice: () => null,
}));

const { TrainingScreen: ProductionTrainingScreen } =
  await import("@/components/training/TrainingScreen");
const { getOnboardingTranslation } = await import("@/lib/onboardingI18n");

const defaultStartupSnapshot = {
  transitionId: "test-startup",
  interfaceLanguage: "en" as const,
  preferences: {
    themePreference: "system" as const,
    audioQuality: "free" as const,
    modesEnabled: ["word-to-definition" as const],
    cardFilter: "both" as const,
    languageCode: "nl",
    newReviewRatio: 2,
    activeScenario: "understanding",
    translationLang: "ru",
    preferences: { onboardingLanguage: "en" as const },
  },
};

function TrainingScreen(
  props: Omit<
    React.ComponentProps<typeof ProductionTrainingScreen>,
    "startupSnapshot" | "onRequestDestination"
  > & {
    onRequestDestination?: (destination: AppDestination) => void;
  },
) {
  const [internalDestination, setInternalDestination] =
    React.useState<AppDestination>(props.destination ?? "training");
  return (
    <ProductionTrainingScreen
      {...props}
      trainingTodaySetupEnabled={props.trainingTodaySetupEnabled ?? false}
      destination={
        props.onRequestDestination ? props.destination : internalDestination
      }
      onRequestDestination={
        props.onRequestDestination ?? setInternalDestination
      }
      startupSnapshot={defaultStartupSnapshot}
    />
  );
}

const user: User = { id: "user-1", email: "user@test.com" } as User;

const defaultMatchMedia = window.matchMedia;

class DeterministicBrowserLocks {
  private readonly held = new Set<string>();

  request = <T,>(
    name: string,
    _options: LockOptions,
    callback: (lock: Lock | null) => Promise<T> | T,
  ): Promise<T> => {
    if (this.held.has(name)) return Promise.resolve(callback(null));
    this.held.add(name);
    return Promise.resolve(
      callback({ name, mode: "exclusive" } as Lock),
    ).finally(() => this.held.delete(name));
  };

  holdExternally(name: string) {
    this.held.add(name);
  }

  releaseExternal(name: string) {
    this.held.delete(name);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  releaseTrainingSessionOwner();
  window.localStorage.clear();
  window.sessionStorage.clear();
  fetchNextTrainingWordByScenario.mockReset().mockResolvedValue(mockWord);
  mockV2SessionState = "ready";
  mockV2AcceptanceGate = null;
  prefetchPlatformV2TrainingEntry.mockReset().mockResolvedValue({
    state: "ready",
    group: { header: { audio: null, text: "huis" } },
    entry: { entryId: mockWord.id },
  });
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});
afterEach(() => {
  window.matchMedia = defaultMatchMedia;
});

const useTwoListScope = () => {
  fetchActiveTrainingScope.mockResolvedValue({
    ...defaultActiveTrainingScope,
    activeListId: activeList.id,
    activeListType: activeList.type,
    hasSavedScope: true,
  });
  fetchListSummaryById.mockResolvedValue(activeList);
  fetchAvailableLists.mockResolvedValue([
    activeList,
    secondaryList,
    userOwnedList,
  ]);
};

const restoreDefaultListScope = () => {
  fetchActiveTrainingScope.mockResolvedValue(defaultActiveTrainingScope);
  fetchListSummaryById.mockResolvedValue(null);
  fetchAvailableLists.mockResolvedValue([defaultAvailableList]);
};

const restoreDefaultSearchResults = () => {
  searchWordEntries.mockResolvedValue({
    items: [dictionaryHuis],
    total: 1,
  });
  searchDictionaryGroups.mockResolvedValue({
    items: [dictionaryHuis],
    total: 1,
  });
};

const restoreDefaultListResults = () => {
  fetchWordsForList.mockResolvedValue({
    items: [dictionaryHuis],
    total: 1,
  });
};

const waitForInitialTrainingFetches = async () => {
  await screen.findByRole("heading", { name: "huis" });
  await waitFor(() =>
    expect(
      fetchNextTrainingWordByScenario.mock.calls.length,
    ).toBeGreaterThanOrEqual(2),
  );
};

const expectOnlyBackgroundSelectionSince = (callCount: number) => {
  // Settings/hydration may refresh preparation. That may select ahead, but it
  // must exclude the displayed card and must not replace its presentation.
  for (const call of fetchNextTrainingWordByScenario.mock.calls.slice(callCount)) {
    expect(call[6]).toContain("word-1:word-to-definition");
  }
};

test("search action opens the dedicated dictionary search surface", async () => {
  render(<TrainingScreen user={user} />);

  await screen.findByRole("heading", { name: "huis" });

  fireEvent.keyDown(window, { key: "s" });

  await screen.findByTestId("library-workspace");
  await screen.findByPlaceholderText(/zoek in het woordenboek/i);
  expect(screen.getByTestId("library-workspace")).toBeInTheDocument();
  expect(screen.getByText(/Zoekt in VanDale woordenboek/i)).toBeInTheDocument();
  expect(screen.getByText("Typ een woord om te zoeken")).toBeInTheDocument();
  expect(screen.getByLabelText(/alleen deze lijst/i)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Zoeken" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Lijsten" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/Alleen actieve lijst/i)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /wis zoekopdracht/i }),
  ).not.toBeInTheDocument();
  expect(searchWordEntries).not.toHaveBeenCalled();
});

test("onboarding copy matches the five reachable tour targets", () => {
  for (const language of ["nl", "en", "ru"] as const) {
    expect(getOnboardingTranslation(language).onboarding.steps).toHaveLength(5);
  }
});

test("does not expose Recent through the global R shortcut", async () => {
  fetchUserPreferences.mockResolvedValue({
    themePreference: "system",
    modesEnabled: ["word-to-definition"],
    cardFilter: "both",
    languageCode: "nl",
    newReviewRatio: 2,
    activeScenario: "understanding",
    translationLang: null,
    preferences: {
      onboardingCompleted: true,
      onboardingLanguage: "nl",
    },
  });

  render(<TrainingScreen user={user} />);

  await screen.findByRole("heading", { name: "huis" });
  expect(
    document.querySelector("[data-tour='settings-button']"),
  ).toBeInTheDocument();
  expect(
    document.querySelector("[data-tour='sidebar-toggle']"),
  ).not.toBeInTheDocument();
  expect(
    document.querySelector("[data-tour='search-button']"),
  ).not.toBeInTheDocument();
  fireEvent.keyDown(window, { key: "r" });

  expect(
    screen.queryByRole("button", { name: "Recent" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Sluiten" }),
  ).not.toBeInTheDocument();

  fetchUserPreferences.mockResolvedValue({
    themePreference: "system",
    modesEnabled: ["word-to-definition"],
    cardFilter: "both",
    languageCode: "nl",
    newReviewRatio: 2,
    activeScenario: "understanding",
    translationLang: null,
  });
});

test("V2 answer-card overflow opens the retained details surface", async () => {
  mockV2ProgressAction.mockClear();
  prefetchPlatformV2TrainingEntry.mockReset();
  prefetchPlatformV2TrainingEntry.mockResolvedValue({
    state: "ready",
    group: { header: { audio: null, text: "huis" } },
    entry: { entryId: mockWord.id },
  });

  try {
    render(<TrainingScreen user={user} />);

    const stageBefore = await screen.findByTestId(
      "mock-training-sense-card-v2",
    );
    const presentationIdentity = stageBefore.getAttribute(
      "data-presentation-identity",
    );
    fireEvent.click(screen.getByRole("button", { name: "Word details" }));

    expect(
      await screen.findByTestId("library-sense-card-group"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Recent" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("library-details-actions"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^(Close|Sluiten)$/ }));
    const stageAfter = await screen.findByTestId("mock-training-sense-card-v2");
    expect(stageAfter).toHaveAttribute(
      "data-presentation-identity",
      presentationIdentity,
    );
    expect(
      within(stageAfter).getByRole("heading", { name: "huis" }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(stageAfter).getByRole("button", { name: "Mock V2 grade" }),
    );
    expect(mockV2ProgressAction).toHaveBeenCalledTimes(1);
  } finally {
    prefetchPlatformV2TrainingEntry.mockReset();
  }
});

test("global Details and shortcut help preserve the V2 turn and omit retired actions", async () => {
  render(<TrainingScreen user={user} />);
  await waitForInitialTrainingFetches();
  const stage = screen.getByTestId("mock-training-sense-card-v2");
  const identity = stage.getAttribute("data-presentation-identity");

  fireEvent.keyDown(window, { key: "I", shiftKey: true });
  expect(
    await screen.findByTestId("library-sense-card-group"),
  ).toBeInTheDocument();
  expect(
    screen.queryByTestId("library-details-actions"),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^(Close|Sluiten)$/ }));

  fireEvent.keyDown(window, { key: "?", shiftKey: true });
  expect(
    await screen.findByRole("heading", { name: "Keyboard shortcuts" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Freeze until tomorrow")).not.toBeInTheDocument();
  expect(screen.queryByText("Do not show again")).not.toBeInTheDocument();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(
    screen.queryByRole("heading", { name: "Keyboard shortcuts" }),
  ).not.toBeInTheDocument();
  expect(screen.getByTestId("mock-training-sense-card-v2")).toBe(stage);
  expect(stage).toHaveAttribute("data-presentation-identity", identity);
});

test("shell Library replaces the visible destination without remounting the current Training turn", async () => {
  function Harness() {
    const [destination, setDestination] =
      React.useState<AppDestination>("training");
    return (
      <TrainingScreen
        user={user}
        destination={destination}
        onRequestDestination={setDestination}
      />
    );
  }

  render(<Harness />);

  await waitForInitialTrainingFetches();
  const stageBefore = screen.getByTestId("mock-training-sense-card-v2");
  const presentationBefore = stageBefore.getAttribute(
    "data-presentation-identity",
  );
  const trainingFetchCount = fetchNextTrainingWordByScenario.mock.calls.length;
  fireEvent.keyDown(window, { key: "s" });

  expect(
    await screen.findByRole("heading", { name: /Bibliotheek|Library/ }),
  ).toBeInTheDocument();
  expect(screen.getByTestId("library-workspace")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expectOnlyBackgroundSelectionSince(trainingFetchCount);

  fireEvent.click(
    within(getPrimaryNavigation()).getByRole("button", {
      name: "Training",
    }),
  );

  expect(screen.getByRole("heading", { name: "huis" })).toBeInTheDocument();
  expect(screen.getByTestId("mock-training-sense-card-v2")).toBe(stageBefore);
  expect(stageBefore).toHaveAttribute(
    "data-presentation-identity",
    presentationBefore,
  );
  expectOnlyBackgroundSelectionSince(trainingFetchCount);
});

test("Statistics and Settings destinations preserve the current Training turn", async () => {
  function Harness() {
    const [destination, setDestination] =
      React.useState<AppDestination>("training");
    return (
      <TrainingScreen
        user={user}
        destination={destination}
        onRequestDestination={setDestination}
      />
    );
  }

  render(<Harness />);

  await waitForInitialTrainingFetches();
  const stageBefore = screen.getByTestId("mock-training-sense-card-v2");
  const presentationBefore = stageBefore.getAttribute(
    "data-presentation-identity",
  );
  const trainingFetchCount = fetchNextTrainingWordByScenario.mock.calls.length;

  fireEvent.click(
    within(getPrimaryNavigation()).getByRole("button", {
      name: /Statistieken|Statistics/,
    }),
  );
  expect(
    await screen.findByRole("heading", { name: /Statistieken|Statistics/ }),
  ).toBeInTheDocument();

  fireEvent.click(
    within(getPrimaryNavigation()).getByRole("button", {
      name: "Training",
    }),
  );
  expect(screen.getByTestId("mock-training-sense-card-v2")).toBe(stageBefore);

  fireEvent.click(screen.getByLabelText("Settings"));
  expect(
    await screen.findByRole("heading", { name: /Instellingen|Settings/ }),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Audio kwaliteit/i)).not.toBeInTheDocument();

  fireEvent.click(
    within(getPrimaryNavigation()).getByRole("button", {
      name: "Training",
    }),
  );
  expect(screen.getByTestId("mock-training-sense-card-v2")).toBe(stageBefore);
  expect(stageBefore).toHaveAttribute(
    "data-presentation-identity",
    presentationBefore,
  );
  expectOnlyBackgroundSelectionSince(trainingFetchCount);
});

test("first-pilot Training opens on Today and Continue reveals the mounted card", async () => {
  render(
    <TrainingScreen
      user={user}
      trainingTodaySetupEnabled
      onRequestDestination={vi.fn()}
    />,
  );

  expect(
    await screen.findByRole("heading", { name: /Good morning|Goedemorgen/ }),
  ).toBeInTheDocument();
  expect(
    document.querySelector('[data-app-mobile-navigation="menu"]'),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(fetchNextTrainingWordByScenario).toHaveBeenCalled(),
  );
  expect(
    screen.queryByRole("heading", { name: "huis" }),
  ).not.toBeInTheDocument();

  fireEvent.click(
    screen.getByRole("button", { name: /Continue session|Sessie doorgaan/ }),
  );
  expect(
    await screen.findByRole("heading", { name: "huis" }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(fetchTrainingSessionPlan).toHaveBeenCalledWith(
      "user-1",
      ["word-to-definition"],
      expect.objectContaining({
        cardFilter: "both",
        trainingFilter: expect.objectContaining({ dateWindow: "all" }),
      }),
    ),
  );
  expect(fetchTrainingSessionPlan).toHaveBeenCalledTimes(1);
  expect(getPrimaryNavigation()).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Wijzigen" }),
  ).not.toBeInTheDocument();

  fireEvent.click(
    screen.getByRole("button", {
      name: /Sessie sluiten|Close session|Закрыть сессию/,
    }),
  );
  expect(
    screen.getByRole("heading", { name: /Good morning|Goedemorgen/ }),
  ).toBeInTheDocument();
  expect(
    document.querySelector('[data-app-mobile-navigation="menu"]'),
  ).toBeInTheDocument();

  fireEvent.click(
    screen.getByRole("button", { name: /Continue session|Sessie doorgaan/ }),
  );
  await waitFor(() =>
    expect(fetchTrainingSessionPlan).toHaveBeenCalledTimes(2),
  );
});

test("delayed first card keeps the Today shell until Continue can reveal it", async () => {
  let resolveFirstCard!: (word: typeof mockWord) => void;
  fetchNextTrainingWordByScenario.mockReset();
  fetchNextTrainingWordByScenario.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveFirstCard = resolve;
      }),
  );
  fetchNextTrainingWordByScenario.mockResolvedValue(mockWord);

  try {
    render(
      <TrainingScreen
        user={user}
        trainingTodaySetupEnabled
        onRequestDestination={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: /Loading card|Kaart laden/,
      }),
    ).toBeInTheDocument();
    const todayShell = document.querySelector<HTMLElement>(
      '[data-training-pilot-surface="today"]',
    );
    expect(todayShell).toBeInTheDocument();
    expect(screen.getByLabelText("2000nl")).toBeInTheDocument();
    expect(screen.queryByTestId("training-card-frame")).not.toBeInTheDocument();
    expect(screen.queryByText("Laden…")).not.toBeInTheDocument();

    await waitFor(() => expect(resolveFirstCard).toEqual(expect.any(Function)));
    await act(async () => resolveFirstCard(mockWord));

    expect(
      await screen.findByRole("heading", { name: /Good morning|Goedemorgen/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "huis" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Continue session|Sessie doorgaan/ }),
    );
    expect(
      await screen.findByRole("heading", { name: "huis" }),
    ).toBeInTheDocument();
  } finally {
    fetchNextTrainingWordByScenario.mockReset();
    fetchNextTrainingWordByScenario.mockResolvedValue(mockWord);
  }
});

test("resumes a still-active server session after refresh without starting another session", async () => {
  await writeTrainingSessionResume({
    sessionId: "session-resume",
    userId: "user-1",
    languageCode: "nl",
    listId: "list-1",
    listType: "curated",
    scenarioId: "understanding",
    modes: ["word-to-definition"],
    cardFilter: "both",
    newReviewRatio: 2,
    focusFilter: { dateWindow: "all" },
    sessionSize: 5,
  });
  fetchTrainingSessionSnapshot.mockResolvedValueOnce({
    sessionId: "session-resume",
    sessionSize: 5,
    plannedNew: 3,
    plannedReview: 2,
    plannedPractice: 0,
    plannedTotal: 5,
    plannedAt: "2026-09-10T12:00:00.000Z",
    members: [
      {
        ordinal: 1,
        entryId: "word-1",
        cardTypeId: "word-to-definition",
        queueSource: "new",
        consumedAt: "2026-09-10T12:01:00.000Z",
        unavailableAt: null,
      },
      {
        ordinal: 2,
        entryId: "word-2",
        cardTypeId: "word-to-definition",
        queueSource: "new",
        consumedAt: null,
        unavailableAt: "2026-09-10T12:02:30.000Z",
      },
      {
        ordinal: 3,
        entryId: "word-3",
        cardTypeId: "word-to-definition",
        queueSource: "review",
        consumedAt: "2026-09-10T12:03:00.000Z",
        unavailableAt: null,
      },
      {
        ordinal: 4,
        entryId: "word-4",
        cardTypeId: "word-to-definition",
        queueSource: "review",
        consumedAt: null,
        unavailableAt: null,
      },
      {
        ordinal: 5,
        entryId: "word-5",
        cardTypeId: "word-to-definition",
        queueSource: "review",
        consumedAt: null,
        unavailableAt: null,
      },
    ],
  });

  render(
    <React.StrictMode>
      <TrainingScreen user={user} trainingTodaySetupEnabled />
    </React.StrictMode>,
  );
  await waitFor(() => expect(fetchTrainingSessionSnapshot).toHaveBeenCalled());
  expect(
    await screen.findByTestId("mock-training-sense-card-v2"),
  ).toBeInTheDocument();
  expect(await screen.findByTestId("training-session-position")).toHaveTextContent(
    "2 / 5",
  );
  expect(fetchTrainingSessionSnapshot).toHaveBeenCalledWith(
    "user-1",
    "session-resume",
  );
  expect(startTrainingSession).not.toHaveBeenCalled();
  expect(
    fetchNextTrainingWordByScenario.mock.calls.some((args) =>
      args.some((value: unknown) => value === "session-resume"),
    ),
  ).toBe(true);
});

test("superseded saved session clears its queue and returns to a deliberate local start", async () => {
  await writeTrainingSessionResume({
    sessionId: "session-superseded",
    userId: "user-1",
    languageCode: "nl",
    listId: "list-1",
    listType: "curated",
    scenarioId: "understanding",
    modes: ["word-to-definition"],
    cardFilter: "both",
    newReviewRatio: 2,
    focusFilter: { dateWindow: "all" },
    sessionSize: 5,
  });
  fetchTrainingSessionSnapshot.mockResolvedValueOnce({
    sessionId: "session-superseded",
    runStatus: "superseded",
    runGeneration: null,
    sessionSize: 5,
    plannedNew: 3,
    plannedReview: 2,
    plannedPractice: 0,
    plannedTotal: 5,
    plannedAt: "2026-09-10T12:00:00.000Z",
    members: [
      {
        ordinal: 1,
        entryId: "word-1",
        cardTypeId: "word-to-definition",
        queueSource: "new",
        consumedAt: null,
        unavailableAt: null,
      },
    ],
  });

  render(<TrainingScreen user={user} trainingTodaySetupEnabled />);

  expect(
    await screen.findByRole("button", { name: "Start training here" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("This will reset training on another device."),
  ).toBeInTheDocument();
  expect(
    screen.queryByTestId("mock-training-sense-card-v2"),
  ).not.toBeInTheDocument();
  expect(window.localStorage.getItem("2000nl:training-session:user-1")).toBeNull();
});

test.each(["focus", "visibilitychange"] as const)(
  "%s fallback fences a superseded queue when the cross-tab notification was lost",
  async (returnEvent) => {
    await writeTrainingSessionResume({
      sessionId: "session-visibility",
      userId: "user-1",
      languageCode: "nl",
      listId: "list-1",
      listType: "curated",
      scenarioId: "understanding",
      modes: ["word-to-definition"],
      cardFilter: "both",
      newReviewRatio: 2,
      focusFilter: { dateWindow: "all" },
      sessionSize: 5,
    });
    const activeSnapshot = {
      sessionId: "session-visibility",
      runStatus: "active" as const,
      runGeneration: 1,
      sessionSize: 5,
      plannedNew: 3,
      plannedReview: 2,
      plannedPractice: 0,
      plannedTotal: 5,
      plannedAt: "2026-09-10T12:00:00.000Z",
      members: [
        {
          ordinal: 1,
          entryId: "word-1",
          cardTypeId: "word-to-definition",
          queueSource: "new",
          consumedAt: null,
          unavailableAt: null,
        },
      ],
    };
    fetchTrainingSessionSnapshot
      .mockResolvedValueOnce(activeSnapshot)
      .mockResolvedValueOnce({
        ...activeSnapshot,
        runStatus: "superseded",
        runGeneration: null,
      });

    render(<TrainingScreen user={user} trainingTodaySetupEnabled />);
    await screen.findByTestId("mock-training-sense-card-v2");

    act(() => {
      if (returnEvent === "focus") {
        window.dispatchEvent(new Event("focus"));
      } else {
        document.dispatchEvent(new Event("visibilitychange"));
      }
    });

    expect(
      await screen.findByRole("button", { name: "Start training here" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("mock-training-sense-card-v2"),
    ).not.toBeInTheDocument();
  },
);

test("a foreign tab start promptly invalidates this tab's superseded card", async () => {
  await writeTrainingSessionResume({
    sessionId: "session-tab-a",
    userId: "user-1",
    languageCode: "nl",
    listId: "list-1",
    listType: "curated",
    scenarioId: "understanding",
    modes: ["word-to-definition"],
    cardFilter: "both",
    newReviewRatio: 2,
    focusFilter: { dateWindow: "all" },
    sessionSize: 5,
  });
  const activeSnapshot = {
    sessionId: "session-tab-a",
    runStatus: "active" as const,
    runGeneration: 1,
    sessionSize: 5 as const,
    plannedNew: 1,
    plannedReview: 0,
    plannedPractice: 0,
    plannedTotal: 1,
    plannedAt: "2026-09-10T12:00:00.000Z",
    members: [
      {
        ordinal: 1,
        entryId: "word-1",
        cardTypeId: "word-to-definition",
        queueSource: "new",
        consumedAt: null,
        unavailableAt: null,
      },
    ],
  };
  fetchTrainingSessionSnapshot
    .mockResolvedValueOnce(activeSnapshot)
    .mockResolvedValueOnce({
      ...activeSnapshot,
      runStatus: "superseded",
      runGeneration: null,
    });

  render(<TrainingScreen user={user} trainingTodaySetupEnabled />);
  await screen.findByTestId("mock-training-sense-card-v2");

  const foreignRecord = JSON.stringify({
    sessionId: "session-tab-b",
    userId: "user-1",
    ownerId: "tab-b",
    languageCode: "nl",
    listId: "list-1",
    listType: "curated",
    scenarioId: "understanding",
    modes: ["word-to-definition"],
    cardFilter: "both",
    newReviewRatio: 2,
    focusFilter: { dateWindow: "all" },
    sessionSize: 5,
  });
  window.localStorage.setItem("2000nl:training-session:user-1", foreignRecord);
  act(() => {
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "2000nl:training-session:user-1",
        newValue: foreignRecord,
      }),
    );
  });

  expect(
    await screen.findByRole("button", { name: "Start training here" }),
  ).toBeInTheDocument();
  expect(fetchTrainingSessionSnapshot).toHaveBeenCalledTimes(2);
  expect(window.localStorage.getItem("2000nl:training-session:user-1")).toBe(
    foreignRecord,
  );
});

test("visible authority polling invalidates a cross-device takeover without starting a queue", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");
  let documentHidden = false;
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => documentHidden,
  });

  try {
    await writeTrainingSessionResume({
      sessionId: "session-phone",
      userId: "user-1",
      languageCode: "nl",
      listId: "list-1",
      listType: "curated",
      scenarioId: "understanding",
      modes: ["word-to-definition"],
      cardFilter: "both",
      newReviewRatio: 2,
      focusFilter: { dateWindow: "all" },
      sessionSize: 5,
    });
    const activeSnapshot = {
      sessionId: "session-phone",
      runStatus: "active" as const,
      runGeneration: 1,
      sessionSize: 5 as const,
      plannedNew: 1,
      plannedReview: 0,
      plannedPractice: 0,
      plannedTotal: 1,
      plannedAt: "2026-09-10T12:00:00.000Z",
      members: [
        {
          ordinal: 1,
          entryId: "word-1",
          cardTypeId: "word-to-definition",
          queueSource: "new",
          consumedAt: null,
          unavailableAt: null,
        },
      ],
    };
    fetchTrainingSessionSnapshot
      .mockResolvedValueOnce(activeSnapshot)
      .mockResolvedValueOnce({
        ...activeSnapshot,
        runStatus: "superseded",
        runGeneration: null,
      });

    render(<TrainingScreen user={user} trainingTodaySetupEnabled />);
    await screen.findByTestId("mock-training-sense-card-v2");
    expect(fetchTrainingSessionSnapshot).toHaveBeenCalledTimes(1);

    documentHidden = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchTrainingSessionSnapshot).toHaveBeenCalledTimes(1);

    documentHidden = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(
      await screen.findByRole("button", { name: "Start training here" }),
    ).toBeInTheDocument();
    expect(fetchTrainingSessionSnapshot).toHaveBeenCalledTimes(2);
    expect(startTrainingSession).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("mock-training-sense-card-v2"),
    ).not.toBeInTheDocument();
  } finally {
    if (hiddenDescriptor) {
      Object.defineProperty(document, "hidden", hiddenDescriptor);
    } else {
      Reflect.deleteProperty(document, "hidden");
    }
    vi.useRealTimers();
  }
});

test("a deferred authority result for session A cannot reset newly started session B", async () => {
  let resolveSessionAValidation!: (snapshot: {
    sessionId: string;
    runStatus: "superseded";
    runGeneration: null;
    sessionSize: 5;
    plannedNew: number;
    plannedReview: number;
    plannedPractice: number;
    plannedTotal: number;
    plannedAt: string;
    members: Array<{
      ordinal: number;
      entryId: string;
      cardTypeId: string;
      queueSource: string;
      consumedAt: null;
      unavailableAt: null;
    }>;
  }) => void;
  const deferredSessionAValidation = new Promise<Parameters<
    typeof resolveSessionAValidation
  >[0]>((resolve) => {
    resolveSessionAValidation = resolve;
  });
  const sessionASnapshot = {
    sessionId: "session-a",
    runStatus: "active" as const,
    runGeneration: 1,
    sessionSize: 5 as const,
    plannedNew: 1,
    plannedReview: 0,
    plannedPractice: 0,
    plannedTotal: 1,
    plannedAt: "2026-09-10T12:00:00.000Z",
    members: [
      {
        ordinal: 1,
        entryId: "word-1",
        cardTypeId: "word-to-definition",
        queueSource: "new",
        consumedAt: null,
        unavailableAt: null,
      },
    ],
  };
  await writeTrainingSessionResume({
    sessionId: "session-a",
    userId: "user-1",
    languageCode: "nl",
    listId: "list-1",
    listType: "curated",
    scenarioId: "understanding",
    modes: ["word-to-definition"],
    cardFilter: "both",
    newReviewRatio: 2,
    focusFilter: { dateWindow: "all" },
    sessionSize: 5,
  });
  fetchTrainingSessionSnapshot
    .mockResolvedValueOnce(sessionASnapshot)
    .mockReturnValueOnce(deferredSessionAValidation);

  render(<TrainingScreen user={user} trainingTodaySetupEnabled />);
  const sessionACard = await screen.findByTestId(
    "mock-training-sense-card-v2",
  );
  expect(sessionACard).toHaveAttribute("data-training-session-id", "session-a");

  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() =>
    expect(fetchTrainingSessionSnapshot).toHaveBeenCalledTimes(2),
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: /Sessie sluiten|Close session|Закрыть сессию/,
    }),
  );
  await screen.findByRole("heading", { name: /Good morning|Goedemorgen/ });
  fireEvent.click(
    screen.getByRole("button", {
      name: /Start current setup|Start huidige instelling/,
    }),
  );
  await waitFor(() => expect(startTrainingSession).toHaveBeenCalledOnce());
  const sessionBCard = await screen.findByTestId(
    "mock-training-sense-card-v2",
  );
  expect(sessionBCard).toHaveAttribute(
    "data-training-session-id",
    "00000000-0000-4000-8000-000000000901",
  );

  await act(async () => {
    resolveSessionAValidation({
      ...sessionASnapshot,
      runStatus: "superseded",
      runGeneration: null,
    });
    await deferredSessionAValidation;
  });

  expect(screen.getByTestId("mock-training-sense-card-v2")).toHaveAttribute(
    "data-training-session-id",
    "00000000-0000-4000-8000-000000000901",
  );
  expect(
    screen.queryByRole("button", { name: "Start training here" }),
  ).not.toBeInTheDocument();
  expect(startTrainingSession).toHaveBeenCalledTimes(1);
});

test("a fresh tab does not adopt another tab's resumable session", async () => {
  await writeTrainingSessionResume({
    sessionId: "session-tab-a",
    userId: "user-1",
    languageCode: "nl",
    listId: "list-1",
    listType: "curated",
    scenarioId: "understanding",
    modes: ["word-to-definition"],
    cardFilter: "both",
    newReviewRatio: 2,
    focusFilter: { dateWindow: "all" },
    sessionSize: 5,
  });
  releaseTrainingSessionOwner();
  window.sessionStorage.clear();

  render(<TrainingScreen user={user} trainingTodaySetupEnabled />);

  expect(
    await screen.findByRole("heading", { name: /Good morning|Goedemorgen/ }),
  ).toBeInTheDocument();
  expect(fetchTrainingSessionSnapshot).not.toHaveBeenCalled();
  expect(
    window.localStorage.getItem("2000nl:training-session:user-1"),
  ).not.toBeNull();
});

test("BFCache restore drops the active queue when another tab acquired its owner lease", async () => {
  const locksDescriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
  const locks = new DeterministicBrowserLocks();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: locks.request },
  });
  let externallyHeldLock: string | null = null;

  try {
    await writeTrainingSessionResume({
      sessionId: "session-bfcache",
      userId: "user-1",
      languageCode: "nl",
      listId: "list-1",
      listType: "curated",
      scenarioId: "understanding",
      modes: ["word-to-definition"],
      cardFilter: "both",
      newReviewRatio: 2,
      focusFilter: { dateWindow: "all" },
      sessionSize: 5,
    });
    const ownerId = window.sessionStorage.getItem(
      "2000nl:training-session-owner",
    );
    expect(ownerId).not.toBeNull();
    externallyHeldLock = `2000nl:training-session-owner:${ownerId}`;
    const activeSnapshot = {
      sessionId: "session-bfcache",
      runStatus: "active" as const,
      runGeneration: 1,
      sessionSize: 5 as const,
      plannedNew: 1,
      plannedReview: 0,
      plannedPractice: 0,
      plannedTotal: 1,
      plannedAt: "2026-09-10T12:00:00.000Z",
      members: [
        {
          ordinal: 1,
          entryId: "word-1",
          cardTypeId: "word-to-definition",
          queueSource: "new",
          consumedAt: null,
          unavailableAt: null,
        },
      ],
    };
    fetchTrainingSessionSnapshot.mockResolvedValue(activeSnapshot);

    render(<TrainingScreen user={user} trainingTodaySetupEnabled />);
    await screen.findByTestId("mock-training-sense-card-v2");

    await act(async () => {
      const event = new Event("pagehide");
      Object.defineProperty(event, "persisted", { value: true });
      window.dispatchEvent(event);
      await Promise.resolve();
      await Promise.resolve();
    });
    locks.holdExternally(externallyHeldLock);

    await act(async () => {
      const event = new Event("pageshow");
      Object.defineProperty(event, "persisted", { value: true });
      window.dispatchEvent(event);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      await screen.findByRole("button", { name: "Start training here" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("mock-training-sense-card-v2"),
    ).not.toBeInTheDocument();
    expect(startTrainingSession).not.toHaveBeenCalled();
    expect(
      window.localStorage.getItem("2000nl:training-session:user-1"),
    ).not.toBeNull();
  } finally {
    if (externallyHeldLock) locks.releaseExternal(externallyHeldLock);
    releaseTrainingSessionOwner();
    if (locksDescriptor) {
      Object.defineProperty(navigator, "locks", locksDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "locks");
    }
  }
});

test("offline disables answers until reconnect authority validation succeeds", async () => {
  let resolveReconnect!: (snapshot: TrainingSessionSnapshot) => void;
  const reconnectSnapshot = new Promise<TrainingSessionSnapshot>((resolve) => {
    resolveReconnect = resolve;
  });
  const activeSnapshot = {
    sessionId: "session-offline",
    runStatus: "active" as const,
    runGeneration: 1,
    sessionSize: 5 as const,
    plannedNew: 1,
    plannedReview: 0,
    plannedPractice: 0,
    plannedTotal: 1,
    plannedAt: "2026-09-10T12:00:00.000Z",
    members: [
      {
        ordinal: 1,
        entryId: "word-1",
        cardTypeId: "word-to-definition",
        queueSource: "new",
        consumedAt: null,
        unavailableAt: null,
      },
    ],
  };
  await writeTrainingSessionResume({
    sessionId: "session-offline",
    userId: "user-1",
    languageCode: "nl",
    listId: "list-1",
    listType: "curated",
    scenarioId: "understanding",
    modes: ["word-to-definition"],
    cardFilter: "both",
    newReviewRatio: 2,
    focusFilter: { dateWindow: "all" },
    sessionSize: 5,
  });
  fetchTrainingSessionSnapshot
    .mockResolvedValueOnce(activeSnapshot)
    .mockReturnValueOnce(reconnectSnapshot);

  render(<TrainingScreen user={user} trainingTodaySetupEnabled />);
  const answer = await screen.findByRole("button", { name: "Mock V2 grade" });
  expect(answer).toBeEnabled();

  act(() => window.dispatchEvent(new Event("offline")));
  expect(answer).toBeDisabled();

  act(() => window.dispatchEvent(new Event("online")));
  await waitFor(() =>
    expect(fetchTrainingSessionSnapshot).toHaveBeenCalledTimes(2),
  );
  expect(answer).toBeDisabled();

  await act(async () => {
    resolveReconnect(activeSnapshot);
    await reconnectSnapshot;
  });
  expect(answer).toBeEnabled();
  expect(startTrainingSession).not.toHaveBeenCalled();
});

test("superseded resume restores every still-permitted setup setting before Start here", async () => {
  fetchTrainingScenarios.mockResolvedValueOnce([
    {
      id: "understanding",
      enabled: true,
      nameNl: "Begrip",
      nameEn: "Understanding",
      description: null,
      cardModes: ["word-to-definition", "definition-to-word"],
      graduationThreshold: 0,
      sortOrder: 0,
    },
  ]);
  fetchAvailableLists.mockImplementation(
    async (_userId: string, languageCode: string) =>
      languageCode === "en" ? [userOwnedList] : [defaultAvailableList],
  );
  await writeTrainingSessionResume({
    sessionId: "session-superseded-settings",
    userId: "user-1",
    languageCode: "en",
    listId: userOwnedList.id,
    listType: userOwnedList.type,
    scenarioId: "understanding",
    modes: ["word-to-definition", "definition-to-word"],
    cardFilter: "review",
    newReviewRatio: 5,
    focusFilter: {
      dateWindow: "daysAgo",
      daysAgo: 14,
      sourceId: "source-youtube-1",
    },
    sessionSize: "all-due-today",
  });
  fetchTrainingSessionSnapshot.mockResolvedValueOnce({
    sessionId: "session-superseded-settings",
    runStatus: "superseded",
    runGeneration: null,
    sessionSize: "all-due-today",
    plannedNew: 0,
    plannedReview: 10,
    plannedPractice: 0,
    plannedTotal: 10,
    plannedAt: "2026-09-10T12:00:00.000Z",
    members: [
      {
        ordinal: 1,
        entryId: "word-1",
        cardTypeId: "definition-to-word",
        queueSource: "review",
        consumedAt: null,
        unavailableAt: null,
      },
    ],
  });

  render(<TrainingScreen user={user} trainingTodaySetupEnabled />);

  await waitFor(() =>
    expect(fetchAvailableLists).toHaveBeenCalledWith("user-1", "en"),
  );
  await waitFor(() =>
    expect(fetchTrainingSessionSnapshot).toHaveBeenCalledWith(
      "user-1",
      "session-superseded-settings",
    ),
  );
  const startHere = await screen.findByRole("button", {
    name: "Start training here",
  });
  expect(screen.getByRole("button", { name: "Meaning" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "Reverse" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "New" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(screen.getByRole("button", { name: "Reviews" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByLabelText("Word list")).toHaveValue(
    `user:${userOwnedList.id}`,
  );
  expect(screen.getByLabelText("Source")).toHaveValue(
    "source:source-youtube-1",
  );
  expect(screen.getByLabelText("Time window")).toHaveValue("daysAgo");
  expect(screen.getByLabelText("Days ago")).toHaveValue(14);
  expect(screen.getByRole("button", { name: "All due today" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  updateActiveTrainingScope.mockClear();
  startTrainingSession.mockClear();
  fireEvent.click(startHere);

  await waitFor(() => expect(startTrainingSession).toHaveBeenCalledOnce());
  expect(updateActiveTrainingScope).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: "user-1",
      languageCode: "en",
      listId: userOwnedList.id,
      listType: userOwnedList.type,
      activeScenario: "understanding",
      cardFilter: "review",
      modesEnabled: ["word-to-definition", "definition-to-word"],
      newReviewRatio: 5,
    }),
  );
  expect(startTrainingSession).toHaveBeenCalledWith(
    "user-1",
    ["word-to-definition", "definition-to-word"],
    expect.objectContaining({
      listId: userOwnedList.id,
      listType: userOwnedList.type,
      cardFilter: "review",
      trainingFilter: {
        dateWindow: "daysAgo",
        daysAgo: 14,
        sourceId: "source-youtube-1",
      },
      sessionSize: "all-due-today",
    }),
    expect.any(String),
  );
});

test("pilot Start persists the complete selection in one scope update", async () => {
  fetchTrainingScenarios.mockResolvedValueOnce([
    {
      id: "understanding",
      enabled: true,
      nameNl: "Begrip",
      nameEn: "Understanding",
      description: null,
      cardModes: ["word-to-definition", "definition-to-word"],
      graduationThreshold: 0,
      sortOrder: 0,
    },
  ]);
  render(<TrainingScreen user={user} trainingTodaySetupEnabled />);

  await screen.findByRole("heading", { name: /Good morning|Goedemorgen/ });
  updateActiveTrainingScope.mockClear();
  fireEvent.click(
    screen.getByRole("button", { name: /Adjust training|Training aanpassen/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: /Reverse|Omgekeerd/ }));
  fireEvent.click(
    screen.getByRole("button", {
      name: /1 new · 3 review|1 nieuw · 3 herhaling/,
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: /Start training|Training starten/ }),
  );

  await waitFor(() => expect(updateActiveTrainingScope).toHaveBeenCalledOnce());
  expect(updateActiveTrainingScope).toHaveBeenCalledWith({
    userId: user.id,
    languageCode: "nl",
    listId: defaultAvailableList.id,
    listType: defaultAvailableList.type,
    activeScenario: "understanding",
    cardFilter: "both",
    modesEnabled: ["word-to-definition", "definition-to-word"],
    newReviewRatio: 3,
  });
});

test("pilot Setup applies source and date filters only when Start commits the draft", async () => {
  render(<TrainingScreen user={user} trainingTodaySetupEnabled />);
  await screen.findByRole("heading", { name: /Good morning|Goedemorgen/ });
  await waitFor(() =>
    expect(fetchTrainingFilterSources).toHaveBeenCalledWith(user.id),
  );
  fireEvent.click(
    screen.getByRole("button", { name: /Adjust training|Training aanpassen/ }),
  );
  fireEvent.change(screen.getByLabelText("Time window"), {
    target: { value: "today" },
  });
  fireEvent.change(screen.getByLabelText("Source"), {
    target: { value: "source:source-youtube-1" },
  });
  expect(
    fetchNextTrainingWordByScenario.mock.calls.some(
      (call) => call[8]?.sourceId === "source-youtube-1",
    ),
  ).toBe(false);
  fetchNextTrainingWordByScenario.mockClear();
  fireEvent.click(
    screen.getByRole("button", { name: /Start training|Training starten/ }),
  );
  await waitFor(() =>
    expect(
      fetchNextTrainingWordByScenario.mock.calls.map((call) => call[8]),
    ).toContainEqual(
      expect.objectContaining({
        dateWindow: "today",
        sourceId: "source-youtube-1",
      }),
    ),
  );
});

test("pilot Start keeps recovery visible when the replacement queue fails", async () => {
  render(<TrainingScreen user={user} trainingTodaySetupEnabled />);

  await screen.findByRole("heading", { name: /Good morning|Goedemorgen/ });
  fireEvent.click(
    screen.getByRole("button", { name: /Adjust training|Training aanpassen/ }),
  );
  fetchNextTrainingWordByScenario.mockRejectedValueOnce(
    Object.assign(new Error("canceling statement due to statement timeout"), {
      code: "57014",
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: /Start training|Training starten/ }),
  );

  expect(
    await screen.findByRole("heading", {
      name: /Training could not be loaded|Training kon niet worden geladen/,
    }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "huis" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", {
      name: /No cards match this setup|Geen kaarten voor deze selectie/,
    }),
  ).not.toBeInTheDocument();
});

test("pilot Start shows empty recovery when the replacement queue has no cards", async () => {
  render(<TrainingScreen user={user} trainingTodaySetupEnabled />);

  await screen.findByRole("heading", { name: /Good morning|Goedemorgen/ });
  fireEvent.click(
    screen.getByRole("button", { name: /Adjust training|Training aanpassen/ }),
  );
  fetchNextTrainingWordByScenario.mockResolvedValueOnce(null);
  fireEvent.click(
    screen.getByRole("button", { name: /Start training|Training starten/ }),
  );

  expect(
    await screen.findByRole("heading", {
      name: /No cards match this setup|Geen kaarten voor deze selectie/,
    }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", {
      name: /Training could not be loaded|Training kon niet worden geladen/,
    }),
  ).not.toBeInTheDocument();
});

test("pilot Setup shows Listening as unavailable without enabling it", async () => {
  fetchTrainingScenarios.mockResolvedValueOnce([
    {
      id: "understanding",
      enabled: true,
      nameNl: "Begrip",
      nameEn: "Understanding",
      description: null,
      cardModes: ["word-to-definition"],
      graduationThreshold: 0,
      sortOrder: 0,
    },
    {
      id: "listening",
      enabled: false,
      nameNl: "Luisteren",
      nameEn: "Listening",
      description: null,
      cardModes: ["listen-recognize"],
      graduationThreshold: 0,
      sortOrder: 1,
    },
  ]);

  render(<TrainingScreen user={user} trainingTodaySetupEnabled />);

  await screen.findByRole("heading", { name: /Good morning|Goedemorgen/ });
  fireEvent.click(
    screen.getByRole("button", { name: /Adjust training|Training aanpassen/ }),
  );
  expect(
    await screen.findByRole("button", { name: /Listening|Luisteren/ }),
  ).toBeDisabled();
});

test("pilot cannot start a scenario before backend capabilities resolve", async () => {
  let resolveScenarios: (
    value: Awaited<ReturnType<typeof fetchTrainingScenarios>>,
  ) => void = () => undefined;
  fetchTrainingScenarios.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveScenarios = resolve;
      }),
  );

  render(<TrainingScreen user={user} trainingTodaySetupEnabled />);

  await screen.findByRole("heading", { name: /Good morning|Goedemorgen/ });
  fireEvent.click(
    screen.getByRole("button", { name: /Adjust training|Training aanpassen/ }),
  );
  expect(
    screen.getByRole("button", { name: /Loading Training|Training laden/ }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: /Listening|Luisteren/ }),
  ).toBeDisabled();

  await act(async () => {
    resolveScenarios([
      {
        id: "understanding",
        enabled: true,
        nameNl: "Begrip",
        nameEn: "Understanding",
        description: null,
        cardModes: ["word-to-definition"],
        graduationThreshold: 0,
        sortOrder: 0,
      },
    ]);
  });
  expect(
    await screen.findByRole("button", {
      name: /Start training|Training starten/,
    }),
  ).toBeEnabled();
});

test("pilot cannot start when no authoritative scenario is available", async () => {
  fetchTrainingScenarios.mockResolvedValueOnce([]);

  render(<TrainingScreen user={user} trainingTodaySetupEnabled />);

  await screen.findByRole("heading", { name: /Good morning|Goedemorgen/ });
  fireEvent.click(
    screen.getByRole("button", { name: /Adjust training|Training aanpassen/ }),
  );
  const unavailableStart = await screen.findByRole("button", {
    name: /Choose a training goal|Kies een trainingsdoel/,
  });
  expect(unavailableStart).toBeDisabled();
  updateActiveTrainingScope.mockClear();
  fireEvent.click(unavailableStart);
  expect(updateActiveTrainingScope).not.toHaveBeenCalled();
});

test("pilot does not start a card mode omitted by the authoritative scenario", async () => {
  fetchActiveTrainingScope.mockResolvedValueOnce({
    ...defaultActiveTrainingScope,
    modesEnabled: ["definition-to-word"],
    hasSavedScope: true,
  });
  fetchTrainingScenarios.mockResolvedValueOnce([
    {
      id: "understanding",
      enabled: true,
      nameNl: "Begrip",
      nameEn: "Understanding",
      description: null,
      cardModes: ["word-to-definition"],
      graduationThreshold: 0,
      sortOrder: 0,
    },
  ]);

  render(<TrainingScreen user={user} trainingTodaySetupEnabled />);

  await screen.findByRole("heading", { name: /Good morning|Goedemorgen/ });
  const unavailableStart = await screen.findByRole("button", {
    name: /Choose a training goal|Kies een trainingsdoel/,
  });
  expect(unavailableStart).toBeDisabled();
  updateActiveTrainingScope.mockClear();
  fireEvent.click(unavailableStart);
  expect(updateActiveTrainingScope).not.toHaveBeenCalled();

  fireEvent.click(
    screen.getByRole("button", { name: /Adjust training|Training aanpassen/ }),
  );
  expect(
    screen.queryByRole("button", { name: /Reverse|Omgekeerd/ }),
  ).not.toBeInTheDocument();
  const normalizedStart = await screen.findByRole("button", {
    name: /Start training|Training starten/,
  });
  expect(normalizedStart).toBeEnabled();
  fireEvent.click(normalizedStart);
  await waitFor(() =>
    expect(updateActiveTrainingScope).toHaveBeenCalledWith(
      expect.objectContaining({ modesEnabled: ["word-to-definition"] }),
    ),
  );
});

test("dictionary search scope changes lookup language without changing training", async () => {
  updateActiveTrainingScope.mockClear();
  searchDictionaryGroups.mockClear();

  render(<TrainingScreen user={user} />);

  await screen.findByRole("heading", { name: "huis" });

  fireEvent.keyDown(window, { key: "s" });
  await screen.findByText("Zoekbereik");

  const languageSelect = screen.getByLabelText("Leertaal");
  fireEvent.change(languageSelect, { target: { value: "en" } });

  const queryInput = await screen.findByPlaceholderText(
    /zoek in het woordenboek/i,
  );
  fireEvent.change(queryInput, { target: { value: "bank" } });

  await waitFor(() =>
    expect(searchDictionaryGroups).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "bank",
        languageCode: "en",
      }),
    ),
  );
  expect(updateActiveTrainingScope).not.toHaveBeenCalled();
});

test("dictionary search can create a private user dictionary entry", async () => {
  fetchAvailableLists.mockResolvedValue([defaultAvailableList, userOwnedList]);
  createUserDictionaryEntry.mockClear();
  addWordsToUserList.mockClear();
  fetchTrainingWordByLookup.mockClear();
  fetchDictionaryEntryById.mockClear();
  fetchDictionaryEntryById.mockResolvedValueOnce(userDictionaryGedoe);
  fetchTrainingWordByLookup.mockResolvedValueOnce({
    ...userDictionaryGedoe,
    mode: "word-to-definition",
    isFirstEncounter: false,
  });

  try {
    render(<TrainingScreen user={user} />);

    await waitForInitialTrainingFetches();
    updateActiveTrainingScope.mockClear();
    fireEvent.keyDown(window, { key: "s" });

    fireEvent.click(
      await screen.findByRole("button", { name: "Eigen entry toevoegen" }),
    );
    fireEvent.change(screen.getByLabelText("Hoofdwoord"), {
      target: { value: "gedoe" },
    });
    fireEvent.change(screen.getByLabelText("Definitie"), {
      target: { value: "lastige situatie" },
    });
    fireEvent.change(screen.getByLabelText("Vertaling"), {
      target: { value: "hassle" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Opslaan in mijn woordenboek" }),
    );

    await waitFor(() =>
      expect(createUserDictionaryEntry).toHaveBeenCalledWith({
        entry: {
          headword: "gedoe",
          languageCode: "nl",
          definition: "lastige situatie",
          translation: { languageCode: "en", text: "hassle" },
        },
      }),
    );
    expect(fetchDictionaryEntryById).toHaveBeenCalledWith(
      "user-entry-1",
      "user-1",
    );
    expect(
      await screen.findByText("Eigen entry toegevoegd aan mijn woordenboek."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("gedoe").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/My dictionary/i).length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getByRole("button", { name: /Collecties|Collections/i }),
    );
    const collectionsDialog = await screen.findByRole("dialog", {
      name: /Collecties voor deze betekenis|Collections for this meaning/i,
    });
    fireEvent.click(within(collectionsDialog).getByRole("checkbox"));
    await waitFor(() =>
      expect(addWordsToUserList).toHaveBeenCalledWith("list-user", [
        "user-entry-1",
      ]),
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: /Hierna trainen|Train next/i,
      }),
    );
    await waitFor(() =>
      expect(fetchTrainingWordByLookup).toHaveBeenCalledWith(
        "user-entry-1",
        "user-1",
      ),
    );
    expect(updateActiveTrainingScope).not.toHaveBeenCalledWith(
      expect.objectContaining({ listId: "list-user" }),
    );
  } finally {
    restoreDefaultListScope();
    fetchDictionaryEntryById.mockResolvedValue(null);
    fetchTrainingWordByLookup.mockResolvedValue(overrideWord);
  }
});

test("dictionary lookup preserves an open entry with an explicit stale-detail label", async () => {
  searchDictionaryGroups.mockImplementation(
    async ({ query }: { query?: string }) =>
      query === "boom"
        ? { items: [dictionaryBoom], total: 1 }
        : { items: [dictionaryHuis], total: 1 },
  );

  try {
    render(<TrainingScreen user={user} />);

    await screen.findByRole("heading", { name: "huis" });
    fireEvent.keyDown(window, { key: "s" });

    const queryInput = await screen.findByPlaceholderText(
      /zoek in het woordenboek/i,
    );
    fireEvent.change(queryInput, { target: { value: "huis" } });
    await screen.findByText("Details");

    fireEvent.change(queryInput, { target: { value: "boom" } });

    await screen.findByText("boom");
    expect(
      await screen.findByText(
        "Deze entry is bewaard terwijl de zoekresultaten veranderden.",
      ),
    ).toBeInTheDocument();
  } finally {
    restoreDefaultSearchResults();
  }
});

test("dictionary lookup ignores stale responses from older queries", async () => {
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  };
  const steSearch = deferred<{
    items: (typeof dictionaryStedelijk)[];
    total: number;
  }>();
  const sterSearch = deferred<{
    items: (typeof dictionarySter)[];
    total: number;
  }>();

  searchDictionaryGroups.mockImplementation(({ query }: { query?: string }) => {
    if (query === "ste") return steSearch.promise;
    if (query === "ster") return sterSearch.promise;
    return Promise.resolve({ items: [], total: 0 });
  });

  try {
    render(<TrainingScreen user={user} />);

    await screen.findByRole("heading", { name: "huis" });
    fireEvent.keyDown(window, { key: "s" });

    const queryInput = await screen.findByPlaceholderText(
      /zoek in het woordenboek/i,
    );
    fireEvent.change(queryInput, { target: { value: "ste" } });
    await waitFor(() =>
      expect(searchDictionaryGroups).toHaveBeenCalledWith(
        expect.objectContaining({ query: "ste" }),
      ),
    );

    fireEvent.change(queryInput, { target: { value: "ster" } });
    await waitFor(() =>
      expect(searchDictionaryGroups).toHaveBeenCalledWith(
        expect.objectContaining({ query: "ster" }),
      ),
    );

    await act(async () => {
      sterSearch.resolve({ items: [dictionarySter], total: 1 });
      await sterSearch.promise;
    });

    expect(
      await screen.findByRole("button", {
        name: /ster[\s\S]*Van Dale/i,
      }),
    ).toBeInTheDocument();

    await act(async () => {
      steSearch.resolve({ items: [dictionaryStedelijk], total: 3964 });
      await steSearch.promise;
    });

    expect(
      screen.getByRole("button", { name: /ster[\s\S]*Van Dale/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("stedelijk")).not.toBeInTheDocument();
    expect(screen.queryByText(/3964 resultaten/i)).not.toBeInTheDocument();
  } finally {
    restoreDefaultSearchResults();
  }
});

test("dictionary lookup preserves server Headword Group order", async () => {
  searchDictionaryGroups.mockResolvedValueOnce({
    items: [
      {
        ...dictionaryHuis,
        dictionary_name: "Van Dale NT2",
        search_match_group: "exact-headword",
        search_match_label: "Exacte match",
        search_group_rank: 1,
      },
      {
        ...dictionaryCompound,
        dictionary_name: "Van Dale NT2",
        search_match_group: "related-headword",
        search_match_label: "Samenstelling",
        search_group_rank: 3,
      },
    ],
    total: 2,
  });

  render(<TrainingScreen user={user} />);

  await screen.findByRole("heading", { name: "huis" });
  fireEvent.keyDown(window, { key: "s" });

  const queryInput = await screen.findByPlaceholderText(
    /zoek in het woordenboek/i,
  );
  fireEvent.change(queryInput, { target: { value: "huis" } });

  const exact = await screen.findByRole("button", {
    name: /^huis[\s\S]*Van Dale NT2/i,
  });
  const compound = screen.getByRole("button", {
    name: /^bejaardenhuis[\s\S]*Van Dale NT2/i,
  });

  expect(
    exact.compareDocumentPosition(compound) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

test("dictionary lookup empty state names the dictionary source search", async () => {
  searchDictionaryGroups.mockResolvedValue({ items: [], total: 0 });

  try {
    render(<TrainingScreen user={user} />);

    await screen.findByRole("heading", { name: "huis" });
    fireEvent.keyDown(window, { key: "s" });
    fireEvent.change(
      await screen.findByPlaceholderText(/zoek in het woordenboek/i),
      {
        target: { value: "zzzz" },
      },
    );

    expect(
      await screen.findByText("Geen woordenboekresultaten gevonden."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/De zoekopdracht in VanDale woordenboek vond niets/i),
    ).toBeInTheDocument();
  } finally {
    restoreDefaultSearchResults();
  }
});

test("footer list selector still changes active training scope", async () => {
  useTwoListScope();
  fetchNextTrainingWordByScenario.mockClear();
  updateActiveTrainingScope.mockClear();
  fetchStats.mockClear();
  let resolveOldSelection!: (word: typeof mockWord) => void;
  const oldSelection = new Promise<typeof mockWord>((resolve) => {
    resolveOldSelection = resolve;
  });
  let resolveSecondary!: (word: typeof overrideWord) => void;
  const secondarySelection = new Promise<typeof overrideWord>((resolve) => {
    resolveSecondary = resolve;
  });
  let resolvePersistence!: (result: {
    scope: ActiveTrainingScope;
    error: null;
  }) => void;
  const persistence = new Promise<{
    scope: ActiveTrainingScope;
    error: null;
  }>((resolve) => {
    resolvePersistence = resolve;
  });
  fetchNextTrainingWordByScenario.mockImplementation(
    async (
      _userId: string,
      _scenarioId: string,
      _excludeWordIds: string[],
      scope: { listId?: string } = {},
    ) =>
      scope.listId === secondaryList.id ? secondarySelection : oldSelection,
  );
  updateActiveTrainingScope.mockReturnValue(persistence);

  try {
    render(<TrainingScreen user={user} />);

    await waitFor(() =>
      expect(fetchNextTrainingWordByScenario).toHaveBeenCalled(),
    );

    expect(
      screen.queryByRole("button", { name: /active list/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Wijzigen" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /active list/i }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /secondary list/i }),
    );

    await waitFor(() =>
      expect(updateActiveTrainingScope).toHaveBeenCalledWith({
        userId: "user-1",
        languageCode: "nl",
        listId: "list-secondary",
        listType: "curated",
        activeScenario: "listening",
      }),
    );
    await act(async () => resolveOldSelection(mockWord));
    expect(
      screen.queryByRole("heading", { name: "huis" }),
    ).not.toBeInTheDocument();
    await act(async () =>
      resolvePersistence({
        scope: {
          ...defaultActiveTrainingScope,
          activeListId: secondaryList.id,
          activeListType: secondaryList.type,
          activeScenario: "listening",
          hasSavedScope: true,
        },
        error: null,
      }),
    );
    expect(
      fetchNextTrainingWordByScenario.mock.calls.some((call) => {
        const scope = call[3] as { listId?: string; listType?: string };
        return (
          call[1] === "listening" &&
          scope?.listId === "list-secondary" &&
          scope?.listType === "curated"
        );
      }),
    ).toBe(true);
    await act(async () => resolveSecondary(overrideWord));
    expect(
      await screen.findByRole("heading", { name: "boom" }),
    ).toBeInTheDocument();
  } finally {
    restoreDefaultListScope();
    fetchNextTrainingWordByScenario.mockResolvedValue(mockWord);
    updateActiveTrainingScope.mockResolvedValue({ scope: null, error: null });
  }
});

test("footer card-filter change reloads without the previous finite session", async () => {
  fetchNextTrainingWordByScenario
    .mockReset()
    .mockImplementationOnce(() => new Promise(() => undefined))
    .mockResolvedValue(mockWord);

  render(<TrainingScreen user={user} />);
  await screen.findByRole("button", { name: "Wijzigen" });

  fetchNextTrainingWordByScenario.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Wijzigen" }));
  fireEvent.click(
    screen.getByRole("button", { name: /Nieuw \+ Herhaling/ }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: /Alleen nieuw/ }),
  );

  await waitFor(() =>
    expect(
      fetchNextTrainingWordByScenario.mock.calls.some(
        (call) => call[4] === "new",
      ),
    ).toBe(true),
  );
  const replacementCall = fetchNextTrainingWordByScenario.mock.calls.find(
    (call) => call[4] === "new",
  );
  expect(replacementCall?.[11]).toBeUndefined();
});

test("initial load waits for an unsaved list default scenario", async () => {
  fetchActiveTrainingScope.mockResolvedValue({
    ...defaultActiveTrainingScope,
    activeListId: secondaryList.id,
    activeListType: secondaryList.type,
    activeScenario: "understanding",
    hasSavedScope: false,
  });
  fetchListSummaryById.mockResolvedValue(secondaryList);
  fetchAvailableLists.mockResolvedValue([secondaryList]);
  fetchNextTrainingWordByScenario.mockClear();

  try {
    render(<TrainingScreen user={user} />);

    await screen.findByRole("heading", { name: "huis" });
    expect(fetchNextTrainingWordByScenario).toHaveBeenCalled();
    expect(
      fetchNextTrainingWordByScenario.mock.calls.every(
        (call) => call[1] === "listening",
      ),
    ).toBe(true);
  } finally {
    restoreDefaultListScope();
  }
});

test("search detail trains a selected entry as the next card without changing active scope", async () => {
  useTwoListScope();
  searchDictionaryGroups.mockResolvedValue({
    items: [dictionaryBoom],
    total: 1,
  });
  fetchTrainingWordByLookup.mockClear();
  fetchTrainingWordByLookup.mockResolvedValueOnce(overrideWord);
  fetchNextTrainingWordByScenario.mockClear();
  updateActiveTrainingScope.mockClear();

  try {
    render(<TrainingScreen user={user} />);

    await waitForInitialTrainingFetches();
    fetchNextTrainingWordByScenario.mockClear();
    updateActiveTrainingScope.mockClear();

    fireEvent.keyDown(window, { key: "s" });
    fireEvent.change(
      await screen.findByPlaceholderText(/zoek in het woordenboek/i),
      {
        target: { value: "boom" },
      },
    );
    await screen.findAllByText("boom");

    fireEvent.click(
      await screen.findByRole("button", {
        name: /Hierna trainen|Train next/i,
      }),
    );

    await screen.findByRole("heading", { name: "boom" });
    expect(
      await screen.findByText(
        "boom is nu de volgende kaart. Daarna gaat normale training verder.",
      ),
    ).toBeInTheDocument();
    expect(fetchTrainingWordByLookup).toHaveBeenCalledWith("word-2", "user-1");
    expect(updateActiveTrainingScope).not.toHaveBeenCalled();
    expect(
      fetchNextTrainingWordByScenario.mock.calls.some((call) => {
        const scope = call[3] as { listId?: string; listType?: string };
        return scope?.listId === "list-secondary";
      }),
    ).toBe(false);
  } finally {
    restoreDefaultSearchResults();
    restoreDefaultListScope();
    fetchTrainingWordByLookup.mockResolvedValue(overrideWord);
  }
});

test("keeps the current V2 card when a selected-word warm fails", async () => {
  let resolveOverrideLookup!: (value: unknown) => void;
  const readyLookup = (entryId: string, text: string) => ({
    state: "ready",
    group: { header: { audio: null, text } },
    entry: { entryId },
  });

  useTwoListScope();
  searchDictionaryGroups.mockResolvedValue({
    items: [dictionaryBoom],
    total: 1,
  });
  fetchTrainingWordByLookup.mockClear();
  fetchTrainingWordByLookup.mockResolvedValueOnce(overrideWord);
  prefetchPlatformV2TrainingEntry.mockReset();
  prefetchPlatformV2TrainingEntry.mockImplementation(
    (input: { entryId: string }) =>
      input.entryId === overrideWord.id
        ? new Promise((resolve) => {
            resolveOverrideLookup = resolve;
          })
        : Promise.resolve(readyLookup(input.entryId, "huis")),
  );

  try {
    render(<TrainingScreen user={user} />);
    await screen.findByRole("heading", { name: "huis" });

    fireEvent.keyDown(window, { key: "s" });
    fireEvent.change(
      await screen.findByPlaceholderText(/zoek in het woordenboek/i),
      { target: { value: "boom" } },
    );
    await screen.findAllByText("boom");

    fireEvent.click(
      await screen.findByRole("button", {
        name: /Hierna trainen|Train next/i,
      }),
    );

    await waitFor(() =>
      expect(fetchTrainingWordByLookup).toHaveBeenCalledWith(
        overrideWord.id,
        user.id,
      ),
    );
    expect(screen.getByRole("heading", { name: "huis" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "boom" }),
    ).not.toBeInTheDocument();

    await act(async () => {
      resolveOverrideLookup({ state: "lookup-http-error", status: 503 });
    });
    expect(
      await screen.findByText("Kon dit woord niet laden; probeer het opnieuw."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "huis" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "boom" }),
    ).not.toBeInTheDocument();
  } finally {
    prefetchPlatformV2TrainingEntry.mockReset();
    restoreDefaultSearchResults();
    restoreDefaultListScope();
    fetchTrainingWordByLookup.mockResolvedValue(overrideWord);
  }
});

test("search detail copies a trusted entry into the user dictionary", async () => {
  useTwoListScope();
  searchDictionaryGroups.mockResolvedValue({
    items: [dictionaryHuis],
    total: 1,
  });
  copyEntryToUserDictionary.mockClear();
  fetchDictionaryEntryById.mockClear();
  fetchDictionaryEntryById.mockResolvedValueOnce({
    ...userDictionaryGedoe,
    id: "user-entry-copy",
    headword: "huis",
    raw: {
      headword: "huis",
      languageCode: "nl",
      definition: "mijn huisdefinitie",
      sourceEntryId: "word-1",
    },
  });
  updateActiveTrainingScope.mockClear();

  try {
    render(<TrainingScreen user={user} />);

    await waitForInitialTrainingFetches();
    updateActiveTrainingScope.mockClear();

    fireEvent.keyDown(window, { key: "s" });
    fireEvent.change(
      await screen.findByPlaceholderText(/zoek in het woordenboek/i),
      {
        target: { value: "huis" },
      },
    );
    await screen.findByText("Details");

    fireEvent.click(
      await screen.findByRole("button", {
        name: /Kopieer naar mijn woordenboek|Copy to my dictionary/i,
      }),
    );

    await waitFor(() =>
      expect(copyEntryToUserDictionary).toHaveBeenCalledWith({
        entryId: "word-1",
      }),
    );
    expect(fetchDictionaryEntryById).toHaveBeenCalledWith(
      "user-entry-copy",
      "user-1",
    );
    // The exact copied entry is now selected through the same identity-based
    // details path; its V2 content is owned by the following lookup request.
    // The service and hydration assertions above protect the copy contract
    // without coupling this test to that subsequent network response.
    expect(updateActiveTrainingScope).not.toHaveBeenCalled();
  } finally {
    restoreDefaultSearchResults();
    restoreDefaultListScope();
    fetchDictionaryEntryById.mockResolvedValue(null);
  }
});

test("next-card override is one-shot and normal training resumes after review", async () => {
  searchDictionaryGroups.mockResolvedValue({
    items: [dictionaryBoom],
    total: 1,
  });
  fetchTrainingWordByLookup.mockClear();
  fetchTrainingWordByLookup.mockResolvedValueOnce(overrideWord);
  fetchNextTrainingWordByScenario.mockReset();
  fetchNextTrainingWordByScenario
    .mockResolvedValueOnce(mockWord)
    .mockResolvedValue(normalNextWord);

  try {
    render(<TrainingScreen user={user} />);

    await screen.findByRole("heading", { name: "huis" });

    fireEvent.keyDown(window, { key: "s" });
    fireEvent.change(
      await screen.findByPlaceholderText(/zoek in het woordenboek/i),
      {
        target: { value: "boom" },
      },
    );
    await screen.findAllByText("boom");
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Hierna trainen|Train next/i,
      }),
    );

    await screen.findByRole("heading", { name: "boom" });
    await waitFor(() =>
      expect(fetchTrainingWordByLookup).toHaveBeenCalledTimes(1),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mock V2 grade" }));
    });
    expect(mockV2ProgressAction).toHaveBeenCalledTimes(1);
    await screen.findByRole("heading", { name: "fiets" });
    expect(fetchTrainingWordByLookup).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText(/Daarna gaat normale training verder/i),
    ).not.toBeInTheDocument();
  } finally {
    restoreDefaultSearchResults();
    fetchNextTrainingWordByScenario.mockReset();
    fetchNextTrainingWordByScenario.mockResolvedValue(mockWord);
    fetchTrainingWordByLookup.mockResolvedValue(overrideWord);
  }
});

test("V2 layout keeps its theme owner when Today setup is disabled", async () => {
  prefetchPlatformV2TrainingEntry.mockResolvedValue({
    state: "ready",
    group: { header: { audio: null, text: "huis" } },
    entry: { entryId: mockWord.id },
  });
  try {
    render(<TrainingScreen user={user} trainingTodaySetupEnabled={false} />);
    const card = await screen.findByTestId("mock-training-sense-card-v2");
    const viewport = card.closest('[data-training-session-layout="v2"]');
    expect(viewport).not.toBeNull();
    expect(viewport?.className).toContain("viewport");
    expect(
      screen.queryByTestId("training-session-chrome"),
    ).not.toBeInTheDocument();
  } finally {
    prefetchPlatformV2TrainingEntry.mockReset();
  }
});

test("V2 card owns scrolling without a second legacy scroll region", async () => {
  prefetchPlatformV2TrainingEntry.mockReset();
  prefetchPlatformV2TrainingEntry.mockResolvedValue({
    state: "ready",
    group: { header: { audio: null, text: "huis" } },
    entry: { entryId: mockWord.id },
  });
  try {
    render(<TrainingScreen user={user} trainingTodaySetupEnabled />);

    await screen.findByRole("heading", { name: /Good morning|Goedemorgen/ });
    fireEvent.click(
      screen.getByRole("button", {
        name: /Continue session|Sessie doorgaan/,
      }),
    );

    await screen.findByTestId("mock-training-sense-card-v2");
    const scrollRegion = await screen.findByTestId(
      "training-card-scroll-region",
    );
    expect(scrollRegion.className).toContain("overflow-clip");
    expect(scrollRegion.className).not.toContain("overflow-y-auto");
    const frame = screen.getByTestId("training-card-frame");
    expect(frame.className).toContain("flex-1");
    expect(frame.className).not.toContain("h-[580px]");
    expect(
      screen.queryByRole("button", { name: /Antwoord tonen|Show answer/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Opnieuw|Again/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("training-session-chrome")).toBeInTheDocument();
    expect(screen.getByTestId("training-session-chrome")).toHaveTextContent(
      /New \+ review0/,
    );
    expect(screen.getByTestId("training-session-position")).toHaveTextContent(
      "0 / 2",
    );
    expect(
      screen.getByTestId("training-session-progress-track"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("app-header")).toBeInTheDocument();
    expect(getPrimaryNavigation()).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Theme: System" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Search" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Help" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "History" })).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: "Account" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Close session" }),
    ).toHaveLength(1);
    const compactFooter = document.querySelector('footer[data-compact="true"]');
    expect(compactFooter).toBeInTheDocument();
    expect(
      within(compactFooter as HTMLElement).queryByRole("button", {
        name: "Adjust",
      }),
    ).not.toBeInTheDocument();
    expect(compactFooter).not.toHaveTextContent(/VanDale 2k|Begrip/);
    fireEvent.click(
      within(screen.getByTestId("training-session-chrome")).getByRole(
        "button",
        { name: "Close session" },
      ),
    );
    expect(
      await screen.findByRole("heading", { name: /Good morning|Goedemorgen/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("training-session-chrome"),
    ).not.toBeInTheDocument();
  } finally {
    prefetchPlatformV2TrainingEntry.mockReset();
  }
});

test("approved Training History control requests the authoritative destination by keyboard", async () => {
  prefetchPlatformV2TrainingEntry.mockReset();
  prefetchPlatformV2TrainingEntry.mockResolvedValue({
    state: "ready",
    group: { header: { audio: null, text: "huis" } },
    entry: { entryId: mockWord.id },
  });
  const onRequestDestination = vi.fn();
  try {
    render(
      <TrainingScreen
        user={user}
        trainingTodaySetupEnabled
        onRequestDestination={onRequestDestination}
      />,
    );

    await screen.findByRole("heading", { name: /Good morning|Goedemorgen/ });
    fireEvent.click(
      screen.getByRole("button", {
        name: /Continue session|Sessie doorgaan/,
      }),
    );
    await screen.findByTestId("mock-training-sense-card-v2");

    const history = screen.getByRole("button", { name: "History" });
    history.focus();
    await act(async () => userEvent.keyboard("{Enter}"));

    expect(onRequestDestination).toHaveBeenCalledWith("history");
  } finally {
    prefetchPlatformV2TrainingEntry.mockReset();
  }
});

test("keyboard return from History restores focus to its stable Training trigger", async () => {
  prefetchPlatformV2TrainingEntry.mockReset();
  prefetchPlatformV2TrainingEntry.mockResolvedValue({
    state: "ready",
    group: { header: { audio: null, text: "huis" } },
    entry: { entryId: mockWord.id },
  });

  function Harness() {
    const [destination, setDestination] =
      React.useState<AppDestination>("training");
    return (
      <TrainingScreen
        user={user}
        destination={destination}
        trainingTodaySetupEnabled
        onRequestDestination={setDestination}
        onReturnFromHistory={() => setDestination("training")}
      />
    );
  }

  try {
    render(<Harness />);
    await screen.findByRole("heading", { name: /Good morning|Goedemorgen/ });
    fireEvent.click(
      screen.getByRole("button", {
        name: /Continue session|Sessie doorgaan/,
      }),
    );
    await screen.findByTestId("mock-training-sense-card-v2");

    const history = screen.getByRole("button", { name: "History" });
    history.focus();
    await userEvent.keyboard("{Enter}");
    expect(
      await screen.findByRole("heading", { name: "History" }),
    ).toHaveFocus();

    const back = screen.getByRole("button", { name: "Back to training" });
    back.focus();
    await act(async () => userEvent.keyboard("{Enter}"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "History" })).toHaveFocus(),
    );
  } finally {
    prefetchPlatformV2TrainingEntry.mockReset();
  }
});

test("V2 loading retains the existing session chrome and footer", async () => {
  mockV2SessionState = "loading";
  prefetchPlatformV2TrainingEntry.mockReset();
  prefetchPlatformV2TrainingEntry.mockResolvedValue({
    state: "ready",
    group: { header: { audio: null, text: "huis" } },
    entry: { entryId: mockWord.id },
  });

  try {
    render(<TrainingScreen user={user} trainingTodaySetupEnabled />);
    await screen.findByRole("heading", { name: /Good morning|Goedemorgen/ });
    fireEvent.click(
      screen.getByRole("button", {
        name: /Continue session|Sessie doorgaan/,
      }),
    );

    expect(
      await screen.findByTestId("training-v2-loading"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("training-session-chrome")).toBeInTheDocument();
    expect(
      screen.getByTestId("training-session-footer-progress"),
    ).toBeInTheDocument();
  } finally {
    mockV2SessionState = "ready";
    prefetchPlatformV2TrainingEntry.mockReset();
  }
});

test("routes listening mode through the V2 renderer without a legacy marker", async () => {
  fetchActiveTrainingScope.mockReset();
  fetchActiveTrainingScope.mockResolvedValue({
    ...defaultActiveTrainingScope,
    activeScenario: "listening",
    modesEnabled: ["listen-recognize"],
  });
  fetchUserPreferences.mockReset();
  fetchUserPreferences.mockResolvedValue({
    themePreference: "system",
    modesEnabled: ["listen-recognize"],
    cardFilter: "both",
    languageCode: "nl",
    newReviewRatio: 2,
    activeScenario: "listening",
    translationLang: null,
  });
  fetchNextTrainingWordByScenario.mockReset();
  fetchNextTrainingWordByScenario.mockResolvedValue({
    ...mockWord,
    mode: "listen-recognize",
  });
  prefetchPlatformV2TrainingEntry.mockResolvedValue({
    state: "ready",
    group: { header: { audio: null, text: "huis" } },
    entry: { entryId: mockWord.id },
  });

  try {
    const { container } = render(
      <TrainingScreen user={user} trainingTodaySetupEnabled={false} />,
    );

    await waitFor(() =>
      expect(
        container.querySelector('[data-testid="mock-training-sense-card-v2"]'),
      ).not.toBeNull(),
    );
    expect(
      container.querySelector('[data-training-renderer="legacy"]'),
    ).not.toBeInTheDocument();
  } finally {
    fetchActiveTrainingScope.mockReset();
    fetchActiveTrainingScope.mockResolvedValue(defaultActiveTrainingScope);
    fetchUserPreferences.mockReset();
    fetchUserPreferences.mockResolvedValue({
      themePreference: "system",
      modesEnabled: ["word-to-definition"],
      cardFilter: "both",
      languageCode: "nl",
      newReviewRatio: 2,
      activeScenario: "understanding",
      translationLang: null,
    });
    fetchNextTrainingWordByScenario.mockReset();
    fetchNextTrainingWordByScenario.mockResolvedValue(mockWord);
    prefetchPlatformV2TrainingEntry.mockReset();
  }
});

test("keeps the V2 loading surface when the pilot has no current card yet", async () => {
  fetchNextTrainingWordByScenario.mockImplementationOnce(
    () => new Promise(() => undefined),
  );

  try {
    render(<TrainingScreen user={user} trainingTodaySetupEnabled={false} />);

    expect(
      await screen.findByTestId("training-v2-loading"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("training-card-scroll-region"),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-training-renderer="legacy"]'),
    ).not.toBeInTheDocument();
  } finally {
    fetchNextTrainingWordByScenario.mockReset();
    fetchNextTrainingWordByScenario.mockResolvedValue(mockWord);
  }
});

test("renders an explicit V2 state instead of falling back for unsupported listen-type", async () => {
  fetchNextTrainingWordByScenario.mockReset();
  fetchNextTrainingWordByScenario.mockResolvedValue({
    ...mockWord,
    mode: "listen-type",
  });

  try {
    render(<TrainingScreen user={user} trainingTodaySetupEnabled={false} />);

    expect(
      await screen.findByTestId("training-v2-unsupported-mode"),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-training-renderer="legacy"]'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("mock-training-sense-card-v2"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Terug naar Vandaag|Back to Today|Вернуться на Сегодня/i,
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByTestId("training-v2-unsupported-mode"),
      ).not.toBeInTheDocument(),
    );
  } finally {
    fetchNextTrainingWordByScenario.mockReset();
    fetchNextTrainingWordByScenario.mockResolvedValue(mockWord);
  }
});

test("keeps the current V2 card visible until the prefetched DTO is ready", async () => {
  let resolveNextLookup!: (value: unknown) => void;
  // The real V2 client shares one in-flight lookup for an exact card target.
  const nextLookup = new Promise((resolve) => {
    resolveNextLookup = resolve;
  });
  const word1 = { ...mockWord, id: "word-1", headword: "huis" };
  const word2 = { ...mockWord, id: "word-2", headword: "boom" };
  const readyLookup = {
    state: "ready",
    group: { header: { audio: null, text: "huis" } },
    entry: { entryId: "word-1" },
  };

  fetchNextTrainingWordByScenario.mockReset();
  fetchNextTrainingWordByScenario
    .mockResolvedValueOnce(word1)
    .mockResolvedValue(word2);
  prefetchPlatformV2TrainingEntry.mockReset();
  prefetchPlatformV2TrainingEntry.mockImplementation(
    (input: { entryId: string }) =>
      input.entryId === word2.id
        ? nextLookup
        : Promise.resolve(readyLookup),
  );

  try {
    await act(async () => {
      render(<TrainingScreen user={user} />);
    });
    await screen.findByRole("heading", { name: "huis" });
    await waitFor(() =>
      expect(prefetchPlatformV2TrainingEntry).toHaveBeenCalledWith(
        expect.objectContaining({ entryId: word2.id }),
      ),
    );
    const schedulerCallsBeforeGrade =
      fetchNextTrainingWordByScenario.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Mock V2 grade" }));
    expect(screen.getByRole("heading", { name: "huis" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "boom" }),
    ).not.toBeInTheDocument();
    await act(async () => Promise.resolve());
    expectOnlyBackgroundSelectionSince(schedulerCallsBeforeGrade);

    await act(async () => {
      resolveNextLookup({
        ...readyLookup,
        group: { header: { audio: null, text: "boom" } },
        entry: { entryId: word2.id },
      });
    });
    expect(
      await screen.findByRole("heading", { name: "boom" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Next training card")).toBeInTheDocument();
    expect(screen.getByTestId("mock-training-sense-card-v2")).toHaveFocus();
  } finally {
    prefetchPlatformV2TrainingEntry.mockReset();
    prefetchPlatformV2TrainingEntry.mockResolvedValue(readyLookup);
    fetchNextTrainingWordByScenario.mockReset();
    fetchNextTrainingWordByScenario.mockResolvedValue(mockWord);
  }
});

test("publishes a new presentation identity when the same V2 word is presented again", async () => {
  const repeatedWord = { ...mockWord, id: "word-repeat", headword: "huis" };
  const readyLookup = {
    state: "ready",
    group: { header: { audio: null, text: "huis" } },
    entry: { entryId: repeatedWord.id },
  };

  fetchNextTrainingWordByScenario.mockReset();
  fetchNextTrainingWordByScenario.mockResolvedValue(repeatedWord);
  prefetchPlatformV2TrainingEntry.mockReset();
  prefetchPlatformV2TrainingEntry.mockResolvedValue(readyLookup);

  try {
    render(<TrainingScreen user={user} />);
    await screen.findByRole("heading", { name: "huis" });
    await waitFor(() =>
      expect(fetchNextTrainingWordByScenario.mock.calls.length).toBeGreaterThan(
        1,
      ),
    );

    const firstIdentity = screen
      .getByTestId("mock-training-sense-card-v2")
      .getAttribute("data-presentation-identity");
    expect(firstIdentity).toEqual(expect.any(String));
    expect(firstIdentity).not.toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Mock V2 grade" }));

    await waitFor(() =>
      expect(
        screen
          .getByTestId("mock-training-sense-card-v2")
          .getAttribute("data-presentation-identity"),
      ).not.toBe(firstIdentity),
    );
  } finally {
    prefetchPlatformV2TrainingEntry.mockReset();
    prefetchPlatformV2TrainingEntry.mockResolvedValue(readyLookup);
    fetchNextTrainingWordByScenario.mockReset();
    fetchNextTrainingWordByScenario.mockResolvedValue(mockWord);
  }
});

test("uses only the on-demand fallback when grading before next-turn selection resolves", async () => {
  const resolveStaleSelections: Array<(value: typeof mockWord | null) => void> =
    [];
  let selectionCall = 0;
  let allowFallback = false;
  const word1 = { ...mockWord, id: "word-1", headword: "huis" };
  const word2 = { ...mockWord, id: "word-2", headword: "boom" };
  const readyLookup = {
    state: "ready",
    group: { header: { audio: null, text: "boom" } },
    entry: { entryId: word2.id },
  };

  fetchNextTrainingWordByScenario.mockReset();
  fetchNextTrainingWordByScenario.mockImplementation(() => {
    selectionCall += 1;
    if (selectionCall === 1) return Promise.resolve(word1);
    if (allowFallback) return Promise.resolve(word2);
    return new Promise((resolve) => {
      resolveStaleSelections.push(resolve);
    });
  });
  prefetchPlatformV2TrainingEntry.mockReset();
  prefetchPlatformV2TrainingEntry.mockResolvedValue(readyLookup);

  try {
    render(<TrainingScreen user={user} />);
    await screen.findByRole("heading", { name: "huis" });
    await waitFor(() =>
      expect(fetchNextTrainingWordByScenario.mock.calls.length).toBeGreaterThan(
        1,
      ),
    );
    // Let the initial selection effect and its replacement request settle
    // before recording the baseline; otherwise a slower runner can classify
    // that replacement as a post-grade fallback.
    await act(async () => Promise.resolve());
    const callsBeforeGrade = fetchNextTrainingWordByScenario.mock.calls.length;

    allowFallback = true;
    fireEvent.click(screen.getByRole("button", { name: "Mock V2 grade" }));

    expect(
      await screen.findByRole("heading", { name: "boom" }),
    ).toBeInTheDocument();
    await act(async () => Promise.resolve());
    const callsAfterGrade =
      fetchNextTrainingWordByScenario.mock.calls.slice(callsBeforeGrade);
    expect(
      callsAfterGrade.filter((call) => {
        const excludedCardKeys = call[6] as string[];
        return (
          excludedCardKeys.includes("word-1:word-to-definition") &&
          !excludedCardKeys.includes("word-2:word-to-definition")
        );
      }),
    ).toHaveLength(1);
    const callsAfterPresentation =
      fetchNextTrainingWordByScenario.mock.calls.length;

    await act(async () => {
      resolveStaleSelections.forEach((resolve) => resolve(word2));
    });
    expect(fetchNextTrainingWordByScenario).toHaveBeenCalledTimes(
      callsAfterPresentation,
    );
  } finally {
    prefetchPlatformV2TrainingEntry.mockReset();
    prefetchPlatformV2TrainingEntry.mockResolvedValue(readyLookup);
    fetchNextTrainingWordByScenario.mockReset();
    fetchNextTrainingWordByScenario.mockResolvedValue(mockWord);
  }
});

test("shows load-only recovery and blocks a repeated V2 grade after an accepted action", async () => {
  const word1 = { ...mockWord, id: "word-1", headword: "huis" };
  const word2 = { ...mockWord, id: "word-2", headword: "boom" };
  let word2Ready = false;

  mockV2ProgressAction.mockClear();
  fetchNextTrainingWordByScenario.mockReset();
  fetchNextTrainingWordByScenario
    .mockResolvedValueOnce(word1)
    .mockResolvedValueOnce(null)
    .mockResolvedValue(word2);
  prefetchPlatformV2TrainingEntry.mockReset();
  prefetchPlatformV2TrainingEntry.mockImplementation(
    (input: { entryId: string }) =>
      Promise.resolve(
        input.entryId === word2.id
          ? word2Ready
            ? {
                state: "ready",
                group: { header: { audio: null, text: "boom" } },
                entry: { entryId: word2.id },
              }
            : { state: "lookup-http-error", status: 503 }
          : {
              state: "ready",
              group: { header: { audio: null, text: "huis" } },
              entry: { entryId: word1.id },
            },
      ),
  );

  try {
    render(<TrainingScreen user={user} />);
    await screen.findByRole("heading", { name: "huis" });
    await waitFor(() =>
      expect(
        fetchNextTrainingWordByScenario.mock.calls.length,
      ).toBeGreaterThanOrEqual(2),
    );

    fireEvent.click(screen.getByRole("button", { name: "Mock V2 grade" }));
    await waitFor(() =>
      expect(prefetchPlatformV2TrainingEntry).toHaveBeenCalledWith(
        expect.objectContaining({ entryId: word2.id }),
      ),
    );

    expect(screen.getByRole("heading", { name: "huis" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "boom" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Training could not be loaded/i }),
    ).not.toBeInTheDocument();
    const recovery = await screen.findByRole("alert");
    expect(recovery).toHaveTextContent(
      /verbinding werd onderbroken|connection was interrupted|соединение прервалось/i,
    );
    expect(
      screen.getByRole("button", { name: "Mock V2 grade" }),
    ).toBeDisabled();
    expect(mockV2ProgressAction).toHaveBeenCalledTimes(1);

    word2Ready = true;
    fireEvent.click(
      screen.getByRole("button", {
        name: /Opnieuw proberen|Try again|Повторить/i,
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "boom" }),
    ).toBeInTheDocument();
    expect(mockV2ProgressAction).toHaveBeenCalledTimes(1);
    const retryCall = fetchNextTrainingWordByScenario.mock.calls.at(-1);
    expect(retryCall?.[6]).toEqual(
      expect.arrayContaining(["word-1:word-to-definition"]),
    );
  } finally {
    prefetchPlatformV2TrainingEntry.mockReset();
    fetchNextTrainingWordByScenario.mockReset();
    fetchNextTrainingWordByScenario.mockResolvedValue(mockWord);
  }
});

test("a rejected prepared card retries through the scheduler and reaches an available due review", async () => {
  const firstWord = { ...mockWord, id: "word-new", headword: "new-card" };
  const brokenWord = {
    ...mockWord,
    id: "word-broken",
    headword: "broken-card",
  };
  const dueWord = { ...mockWord, id: "word-due", headword: "due-review" };
  let initialSelected = false;

  fetchNextTrainingWordByScenario.mockReset();
  fetchNextTrainingWordByScenario.mockImplementation(
    async (
      _userId: string,
      _scenarioId: string,
      _excludeWordIds: string[],
      _scope: unknown,
      _cardFilter: string,
      _queueTurn: string,
      excludeCardKeys: string[] = [],
    ) => {
      if (!initialSelected) {
        initialSelected = true;
        return firstWord;
      }
      if (excludeCardKeys.includes("word-broken:word-to-definition")) {
        return dueWord;
      }
      return brokenWord;
    },
  );
  prefetchPlatformV2TrainingEntry.mockReset();
  prefetchPlatformV2TrainingEntry.mockImplementation(
    async (input: { entryId: string }) => ({
      state: "ready",
      group: { header: { audio: null, text: input.entryId } },
      entry: { entryId: input.entryId },
    }),
  );

  try {
    render(<TrainingScreen user={user} />);
    await screen.findByRole("heading", { name: "new-card" });
    await waitFor(() =>
      expect(fetchNextTrainingWordByScenario.mock.calls.length).toBeGreaterThan(
        1,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Mock V2 grade" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This training card could not be loaded.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "due-review" }),
    ).toBeInTheDocument();
    expect(
      fetchNextTrainingWordByScenario.mock.calls.some((call) =>
        (call[6] as string[]).includes("word-broken:word-to-definition"),
      ),
    ).toBe(true);
  } finally {
    prefetchPlatformV2TrainingEntry.mockReset();
    fetchNextTrainingWordByScenario.mockReset();
    fetchNextTrainingWordByScenario.mockResolvedValue(mockWord);
  }
});

test("US-094.3: after grading a card, the next prefetch exclude list includes the graded card key", async () => {
  const words = [
    { ...mockWord, id: "word-1", headword: "huis" },
    { ...mockWord, id: "word-2", headword: "boom" },
    { ...mockWord, id: "word-3", headword: "fiets" },
  ];

  fetchNextTrainingWordByScenario.mockReset();
  fetchNextTrainingWordByScenario.mockImplementation(
    async (
      _userId: string,
      _scenarioId: string,
      _excludeWordIds: string[],
      _scope: unknown,
      _cardFilter: unknown,
      _queueTurn: unknown,
      excludeCardKeys: string[] = [],
    ) => {
      return (
        words.find((w) => !excludeCardKeys.includes(`${w.id}:${w.mode}`)) ??
        null
      );
    },
  );

  render(<TrainingScreen user={user} />);

  await screen.findByRole("heading", { name: "huis" });

  // Wait for background prefetch to run at least once.
  await waitFor(() =>
    expect(
      fetchNextTrainingWordByScenario.mock.calls.length,
    ).toBeGreaterThanOrEqual(2),
  );

  // The V2 card owns the answer/review action in one control.
  fireEvent.click(screen.getByRole("button", { name: "Mock V2 grade" }));

  // Should advance to next card (prefetched or on-demand).
  await screen.findByRole("heading", { name: "boom" });

  // While viewing word-2, next prefetch should exclude both word-2's current
  // card and the previously graded word-1 card.
  await waitFor(() => {
    const hasExclude = fetchNextTrainingWordByScenario.mock.calls.some((c) => {
      const exclude = c[6] as string[];
      return (
        exclude.includes("word-1:word-to-definition") &&
        exclude.includes("word-2:word-to-definition")
      );
    });
    expect(hasExclude).toBe(true);
  });
});

test("keeps a newly keyed card disabled until its predecessor acceptance settles", async () => {
  const word1 = { ...mockWord, id: "word-1", headword: "huis" };
  const word2 = { ...mockWord, id: "word-2", headword: "boom" };
  let releaseAcceptance = () => {};
  mockV2AcceptanceGate = new Promise((resolve) => {
    releaseAcceptance = resolve;
  });
  fetchNextTrainingWordByScenario.mockReset();
  fetchNextTrainingWordByScenario
    .mockResolvedValueOnce(word1)
    .mockResolvedValue(word2);

  try {
    await act(async () => {
      render(<TrainingScreen user={user} />);
    });
    await screen.findByRole("heading", { name: "huis" });
    await waitFor(() =>
      expect(fetchNextTrainingWordByScenario.mock.calls.length).toBeGreaterThanOrEqual(2),
    );

    fireEvent.click(screen.getByRole("button", { name: "Mock V2 grade" }));
    await screen.findByRole("heading", { name: "boom" });

    expect(screen.getByRole("button", { name: "Mock V2 grade" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Mock V2 grade" }));
    expect(mockV2ProgressAction).toHaveBeenCalledTimes(1);

    await act(async () => releaseAcceptance());
    await waitFor(() =>
      expect(mockV2ProgressActionCompleted).toHaveBeenCalledWith(
        "accepted-next-presented",
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Mock V2 grade" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Mock V2 grade" }));
    await waitFor(() => expect(mockV2ProgressAction).toHaveBeenCalledTimes(2));
  } finally {
    releaseAcceptance();
    mockV2AcceptanceGate = null;
    fetchNextTrainingWordByScenario.mockReset();
    fetchNextTrainingWordByScenario.mockResolvedValue(mockWord);
  }
});

test("US-094.3: after grading multiple cards, all graded card keys are in the exclude list", async () => {
  const words = [
    { ...mockWord, id: "word-1", headword: "huis" },
    { ...mockWord, id: "word-2", headword: "boom" },
    { ...mockWord, id: "word-3", headword: "fiets" },
    { ...mockWord, id: "word-4", headword: "kat" },
  ];

  fetchNextTrainingWordByScenario.mockReset();
  fetchNextTrainingWordByScenario.mockImplementation(
    async (
      _userId: string,
      _scenarioId: string,
      _excludeWordIds: string[],
      _scope: unknown,
      _cardFilter: unknown,
      _queueTurn: unknown,
      excludeCardKeys: string[] = [],
    ) => {
      return (
        words.find((w) => !excludeCardKeys.includes(`${w.id}:${w.mode}`)) ??
        null
      );
    },
  );

  // Complete mocked startup hydration before exercising sequential grades.
  // First heading paint is not a receipt that all initial scope effects ran.
  await act(async () => {
    render(<TrainingScreen user={user} />);
  });

  await screen.findByRole("heading", { name: "huis" });

  // Grade word-1.
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Mock V2 grade" }));
  });
  await waitFor(() => {
    expect(mockV2ProgressActionCompleted).toHaveBeenNthCalledWith(
      1,
      "accepted-next-presented",
    );
  });
  await screen.findByRole("heading", { name: "boom" });

  // This test exercises two completed transitions, not overlapping actions.
  // A new keyed card can mount before its predecessor's acceptance settles.
  // The real V2 session's duplicate-input boundary is tested separately.
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Mock V2 grade" })).toBeEnabled(),
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Mock V2 grade" }));
  });
  await waitFor(() => {
    expect(mockV2ProgressActionCompleted).toHaveBeenNthCalledWith(
      2,
      "accepted-next-presented",
    );
  });
  await waitFor(() => {
    const observed = {
      heading: screen.queryByTestId("mock-training-sense-card-v2")?.textContent,
      actions: mockV2ProgressAction.mock.calls.length,
      selections: fetchNextTrainingWordByScenario.mock.calls.map((call) => ({
        turn: call[5],
        excluded: call[6],
      })),
    };
    expect(
      Boolean(screen.queryByRole("heading", { name: "fiets" })),
      JSON.stringify(observed),
    ).toBe(true);
  });

  // While viewing word-3, next prefetch should exclude both graded IDs.
  await waitFor(() => {
    const hasExclude = fetchNextTrainingWordByScenario.mock.calls.some((c) => {
      const exclude = c[6] as string[];
      return (
        exclude.includes("word-1:word-to-definition") &&
        exclude.includes("word-2:word-to-definition") &&
        exclude.includes("word-3:word-to-definition")
      );
    });
    expect(hasExclude).toBe(true);
  });
});
