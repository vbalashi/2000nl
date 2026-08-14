import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createDictionarySearchTabState,
  DictionarySearchTab,
  type DictionarySearchTabState,
} from "@/components/training/wordlist/DictionarySearchTab";
import type { PlatformHeadwordGroupV2 } from "../../../packages/shared/types/platformV2";

const fetchGroupPage = vi.fn();

vi.mock("@/lib/platform/platformV2LibraryClient", () => ({
  fetchPlatformV2LibraryGroupPage: (...args: unknown[]) =>
    fetchGroupPage(...args),
}));

vi.mock("@/components/training/library-v2/LibraryWordDetail", () => ({
  LibraryWordDetail: ({
    initialGroup,
    viewport,
  }: {
    initialGroup?: PlatformHeadwordGroupV2;
    viewport?: string;
  }) =>
    initialGroup ? (
      <div
        data-testid={`library-detail-${viewport ?? "all"}`}
        data-group-id={initialGroup.headwordGroupId}
        data-entry-count={initialGroup.entries.length}
      />
    ) : null,
}));

vi.mock("@/lib/trainingService", () => ({
  createUserDictionaryEntry: vi.fn(),
  fetchAvailableDictionarySources: vi.fn().mockResolvedValue([
    {
      id: "dictionary-vandale",
      languageCode: "nl",
      name: "Van Dale",
      slug: "vandale",
      kind: "curated",
      isEditable: false,
      entryCount: 10,
    },
  ]),
  fetchAvailableLearningLanguages: vi.fn().mockResolvedValue([
    {
      code: "nl",
      label: "Nederlands",
      dictionaryCount: 1,
      curatedListCount: 0,
      userListCount: 0,
      hasTrainingEligibleLists: true,
    },
  ]),
  fetchDictionaryEntryById: vi.fn().mockResolvedValue(null),
  fetchWordsForList: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  searchDictionaryGroups: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  searchWordEntries: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}));

const sense = (entryId: string, partOfSpeech: string) => ({
  kind: "sense-card" as const,
  entryId,
  meaningOrdinal: 1,
  partOfSpeech: {
    termId: `pos:${partOfSpeech}`,
    messageKey: `pos.${partOfSpeech}`,
    sourceValue: partOfSpeech,
  },
  card: null,
  contentRevision: `revision-${entryId}`,
  summaryContentNodeId: `definition-${entryId}`,
  contentNodes: [
    {
      contentNodeId: `definition-${entryId}`,
      parentContentNodeId: null,
      kind: "definition" as const,
      order: 0,
      text: `definition ${entryId}`,
      sourceTextFingerprint: `fingerprint-${entryId}`,
      translations: [],
    },
  ],
  translation: null,
  capabilities: [],
});

const goedGroup = (
  headwordGroupId: string,
  dictionaryId: string,
  displayName: string,
  entries: ReturnType<typeof sense>[],
  homographNumber?: number,
): PlatformHeadwordGroupV2 => ({
  headwordGroupId,
  dictionary: {
    dictionaryId,
    sourceLanguageCode: "nl",
    displayName,
    messageKey: `dictionary.${dictionaryId}`,
  },
  header: { text: "goed", ...(homographNumber ? { homographNumber } : {}) },
  senseCount: entries.length,
  entryCount: entries.length,
  indicators: [],
  entries,
});

const firstGroup = goedGroup(
  "group-goed-main",
  "dictionary-vandale",
  "Van Dale",
  [sense("entry-goed-bn", "bn"), sense("entry-goed-bw", "bw")],
);
const homographGroup = goedGroup(
  "group-goed-homograph",
  "dictionary-vandale",
  "Van Dale",
  [sense("entry-goed-zn", "zn")],
  2,
);
const dictionaryGroup = goedGroup(
  "group-goed-user-dictionary",
  "dictionary-user",
  "Mijn woordenboek",
  [sense("entry-goed-user", "bn")],
);
const nextPageGroup = goedGroup(
  "group-goed-next-page",
  "dictionary-other",
  "Ander woordenboek",
  [sense("entry-goed-next", "bn")],
);

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
};

function Harness() {
  const [state, setState] = React.useState<DictionarySearchTabState>(() => ({
    ...createDictionarySearchTabState(),
    query: "goed",
    languageCode: "nl",
  }));
  return (
    <DictionarySearchTab
      open
      userId="user-1"
      language="nl"
      translationLang="en"
      interfaceLanguage="nl"
      userLists={[]}
      viewedListId={null}
      viewedList={null}
      viewedListName="Van Dale"
      reloadLists={async () => {}}
      notifyListsUpdated={() => {}}
      searchState={state}
      onSearchStateChange={setState}
    />
  );
}

describe("DictionarySearchTab Headword Group results", () => {
  beforeEach(() => {
    fetchGroupPage.mockReset();
    fetchGroupPage
      .mockResolvedValueOnce({
        groups: [firstGroup, { ...firstGroup }, homographGroup, dictionaryGroup],
        selectedTierComplete: true,
        nextGroupCursor: "cursor-page-2",
      })
      .mockResolvedValueOnce({
        groups: [nextPageGroup],
        selectedTierComplete: true,
        nextGroupCursor: null,
      });
  });

  test("desktop shows one goed row per headwordGroupId and paginates by opaque group cursor", async () => {
    render(<Harness />);

    expect(await screen.findAllByTestId("library-headword-group-row")).toHaveLength(3);
    expect(screen.getByTestId("library-headword-group-group-goed-main")).toHaveTextContent(
      "bn · bw · Van Dale · 2 betekenissen",
    );
    expect(screen.getByTestId("library-headword-group-group-goed-homograph")).toHaveTextContent(
      "zn · Van Dale · homoniem 2 · 1 betekenis",
    );
    expect(screen.getByTestId("library-headword-group-group-goed-user-dictionary")).toHaveTextContent(
      "Mijn woordenboek",
    );

    const pagination = screen.getByTestId("library-group-pagination");
    fireEvent.click(within(pagination).getByRole("button", { name: "Volgende" }));

    expect(await screen.findByTestId("library-headword-group-group-goed-next-page")).toBeInTheDocument();
    expect(fetchGroupPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "cursor-page-2", query: "goed" }),
    );
  });

  test("mobile selection opens the complete server group instead of one meaning", async () => {
    render(<Harness />);

    const row = await screen.findByTestId("library-headword-group-group-goed-main");
    fireEvent.click(row);

    const mobileDetail = await screen.findByTestId("library-detail-mobile");
    await waitFor(() => expect(mobileDetail).toHaveAttribute("data-group-id", "group-goed-main"));
    expect(mobileDetail).toHaveAttribute("data-entry-count", "2");
  });

  test.each([
    ["HTTP 403", new Error("lookup_http_403"), "tijdelijk niet beschikbaar"],
    ["HTTP 503", new Error("lookup_http_503"), "tijdelijk niet beschikbaar"],
    ["contract mismatch", new Error("contract-mismatch"), "tijdelijk niet beschikbaar"],
    ["timeout", new Error("platform_request_timeout"), "duurde te lang"],
  ])("shows a retryable Library error for %s", async (_label, error, message) => {
    fetchGroupPage.mockReset();
    fetchGroupPage
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({
        groups: [firstGroup],
        selectedTierComplete: true,
        nextGroupCursor: null,
      });

    render(<Harness />);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    fireEvent.click(screen.getByRole("button", { name: "Opnieuw proberen" }));
    expect(await screen.findByTestId("library-headword-group-group-goed-main")).toBeInTheDocument();
  });

  test("ignores a caller abort without presenting a failure", async () => {
    fetchGroupPage.mockReset();
    fetchGroupPage.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));

    render(<Harness />);

    await waitFor(() => expect(fetchGroupPage).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("does not let a stale rejection replace newer successful results", async () => {
    fetchGroupPage.mockReset();
    const oldSearch = deferred<never>();
    fetchGroupPage
      .mockReturnValueOnce(oldSearch.promise)
      .mockResolvedValueOnce({
        groups: [nextPageGroup],
        selectedTierComplete: true,
        nextGroupCursor: null,
      });

    render(<Harness />);
    fireEvent.change(screen.getByPlaceholderText("Zoek in het woordenboek..."), {
      target: { value: "gracht" },
    });

    expect(await screen.findByTestId("library-headword-group-group-goed-next-page")).toBeInTheDocument();
    oldSearch.reject(new Error("lookup_http_503"));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
