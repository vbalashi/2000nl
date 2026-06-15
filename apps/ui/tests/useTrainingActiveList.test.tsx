import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTrainingActiveList } from "@/lib/training/useTrainingActiveList";

const {
  fetchActiveTrainingScope,
  fetchAvailableLists,
  fetchListSummaryById,
  updateActiveTrainingScope,
} = vi.hoisted(() => ({
  fetchActiveTrainingScope: vi.fn(),
  fetchAvailableLists: vi.fn(),
  fetchListSummaryById: vi.fn(),
  updateActiveTrainingScope: vi.fn(),
}));

vi.mock("@/lib/trainingService", () => ({
  fetchActiveTrainingScope,
  fetchAvailableLists,
  fetchListSummaryById,
  updateActiveTrainingScope,
}));

const curatedList = {
  id: "curated-1",
  name: "Primary",
  type: "curated" as const,
  item_count: 10,
};

const userList = {
  id: "user-1",
  name: "Saved",
  type: "user" as const,
  item_count: 5,
};

const englishList = {
  id: "en-1",
  name: "English saved",
  type: "curated" as const,
  item_count: 10,
  language_code: "en",
};

const dictionarySourceList = {
  id: "source-1",
  name: "VanDale",
  type: "curated" as const,
  item_count: 2000,
};

describe("useTrainingActiveList", () => {
  beforeEach(() => {
    fetchActiveTrainingScope.mockReset();
    fetchAvailableLists.mockReset();
    fetchListSummaryById.mockReset();
    updateActiveTrainingScope.mockReset();
    fetchAvailableLists.mockResolvedValue([curatedList]);
    fetchActiveTrainingScope.mockResolvedValue({
      languageCode: "nl",
      activeListId: null,
      activeListType: null,
      activeScenario: "understanding",
      cardFilter: "both",
      modesEnabled: ["word-to-definition"],
      newReviewRatio: 2,
      hasSavedScope: false,
      isValid: false,
    });
    fetchListSummaryById.mockResolvedValue(null);
    updateActiveTrainingScope.mockResolvedValue({ scope: null, error: null });
  });

  test("hydrates a saved active list", async () => {
    fetchActiveTrainingScope.mockResolvedValue({
      languageCode: "nl",
      activeListId: "user-1",
      activeListType: "user",
      activeScenario: "understanding",
      cardFilter: "both",
      modesEnabled: ["word-to-definition"],
      newReviewRatio: 2,
      hasSavedScope: true,
      isValid: true,
    });
    fetchListSummaryById.mockResolvedValue(userList);

    const { result } = renderHook(() =>
      useTrainingActiveList({
        userId: "user-1",
        language: "nl",
        showSettings: false,
      }),
    );

    await waitFor(() => expect(result.current.listHydrated).toBe(true));

    expect(fetchListSummaryById).toHaveBeenCalledWith({
      userId: "user-1",
      listId: "user-1",
      listType: "user",
    });
    expect(result.current.wordListId).toBe("user-1");
    expect(result.current.wordListType).toBe("user");
    expect(result.current.wordListLabel).toBe("Saved");
    expect(result.current.activeList).toBe(userList);
  });

  test("restores the saved active list when switching nl -> en -> nl", async () => {
    fetchAvailableLists.mockImplementation(async (_userId, language) =>
      language === "en" ? [englishList] : [curatedList, userList],
    );
    fetchActiveTrainingScope.mockImplementation(async ({ languageCode }) =>
      languageCode === "en"
        ? {
            languageCode: "en",
            activeListId: "en-1",
            activeListType: "curated",
            activeScenario: "understanding",
            cardFilter: "both",
            modesEnabled: ["word-to-definition"],
            newReviewRatio: 2,
            hasSavedScope: true,
            isValid: true,
          }
        : {
            languageCode: "nl",
            activeListId: "user-1",
            activeListType: "user",
            activeScenario: "understanding",
            cardFilter: "both",
            modesEnabled: ["word-to-definition"],
            newReviewRatio: 2,
            hasSavedScope: true,
            isValid: true,
          },
    );
    fetchListSummaryById.mockImplementation(async ({ listId }) =>
      listId === "en-1" ? englishList : userList,
    );

    const { result, rerender } = renderHook(
      ({ language }) =>
        useTrainingActiveList({
          userId: "user-1",
          language,
          showSettings: false,
        }),
      { initialProps: { language: "nl" } },
    );

    await waitFor(() => expect(result.current.wordListId).toBe("user-1"));

    rerender({ language: "en" });
    await waitFor(() => expect(result.current.wordListId).toBe("en-1"));
    expect(result.current.wordListLabel).toBe("English saved");

    rerender({ language: "nl" });
    await waitFor(() => expect(result.current.wordListId).toBe("user-1"));
    expect(result.current.wordListLabel).toBe("Saved");
  });

  test("clears a deleted saved list and then auto-selects primary", async () => {
    fetchActiveTrainingScope.mockResolvedValue({
      languageCode: "nl",
      activeListId: "missing",
      activeListType: "user",
      activeScenario: "understanding",
      cardFilter: "both",
      modesEnabled: ["word-to-definition"],
      newReviewRatio: 2,
      hasSavedScope: true,
      isValid: false,
    });
    fetchListSummaryById.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useTrainingActiveList({
        userId: "user-1",
        language: "nl",
        showSettings: false,
      }),
    );

    await waitFor(() => expect(result.current.listHydrated).toBe(true));
    await waitFor(() => expect(result.current.wordListId).toBe("curated-1"));

    expect(updateActiveTrainingScope).toHaveBeenCalledWith({
      userId: "user-1",
      languageCode: "nl",
      listId: null,
      listType: null,
    });
    expect(result.current.wordListType).toBe("curated");
    expect(result.current.wordListLabel).toBe("Primary");
  });

  test("persists explicit list selection and exposes footer options", async () => {
    fetchAvailableLists.mockResolvedValue([
      dictionarySourceList,
      curatedList,
      userList,
    ]);

    const { result } = renderHook(() =>
      useTrainingActiveList({
        userId: "user-1",
        language: "nl",
        showSettings: false,
      }),
    );

    await waitFor(() => expect(result.current.listOptions).toHaveLength(2));

    await result.current.handleListSelectValue("user:user-1");

    expect(updateActiveTrainingScope).toHaveBeenCalledWith({
      userId: "user-1",
      languageCode: "nl",
      listId: "user-1",
      listType: "user",
    });
    await waitFor(() => expect(result.current.activeListValue).toBe("user:user-1"));
    expect(result.current.activeList).toBe(userList);
    expect(result.current.listOptions).toEqual([
      { value: "curated:curated-1", label: "Primary" },
      { value: "user:user-1", label: "Saved" },
    ]);
  });

  test("does not expose dictionary source lists as training targets", async () => {
    fetchAvailableLists.mockResolvedValue([dictionarySourceList, curatedList]);

    const { result } = renderHook(() =>
      useTrainingActiveList({
        userId: "user-1",
        language: "nl",
        showSettings: false,
      }),
    );

    await waitFor(() =>
      expect(result.current.listOptions).toEqual([
        { value: "curated:curated-1", label: "Primary" },
      ]),
    );

    const scope = await result.current.handleListSelectValue("curated:source-1");

    expect(scope).toBeNull();
    expect(updateActiveTrainingScope).not.toHaveBeenCalledWith({
      userId: "user-1",
      languageCode: "nl",
      listId: "source-1",
      listType: "curated",
    });
    expect(result.current.activeListValue).toBe("curated:curated-1");
  });

  test("list updates keep resolved active list or fall back to primary", async () => {
    fetchAvailableLists.mockResolvedValue([curatedList, userList]);
    fetchActiveTrainingScope
      .mockResolvedValueOnce({
        languageCode: "nl",
        activeListId: null,
        activeListType: null,
        activeScenario: "understanding",
        cardFilter: "both",
        modesEnabled: ["word-to-definition"],
        newReviewRatio: 2,
        hasSavedScope: false,
        isValid: false,
      })
      .mockResolvedValueOnce({
        languageCode: "nl",
        activeListId: "user-1",
        activeListType: "user",
        activeScenario: "understanding",
        cardFilter: "both",
        modesEnabled: ["word-to-definition"],
        newReviewRatio: 2,
        hasSavedScope: true,
        isValid: true,
      })
      .mockResolvedValueOnce({
        languageCode: "nl",
        activeListId: "missing",
        activeListType: "user",
        activeScenario: "understanding",
        cardFilter: "both",
        modesEnabled: ["word-to-definition"],
        newReviewRatio: 2,
        hasSavedScope: true,
        isValid: false,
      });
    fetchListSummaryById
      .mockResolvedValueOnce(userList)
      .mockResolvedValueOnce(null);
    const onResolvedActiveList = vi.fn();
    const onPrimaryFallback = vi.fn();

    const { result } = renderHook(() =>
      useTrainingActiveList({
        userId: "user-1",
        language: "nl",
        showSettings: false,
      }),
    );

    await waitFor(() => expect(result.current.listHydrated).toBe(true));

    await result.current.handleListsUpdated({ onResolvedActiveList });
    expect(onResolvedActiveList).toHaveBeenCalledWith(userList);
    await waitFor(() => expect(result.current.wordListId).toBe("user-1"));

    await result.current.handleListsUpdated({ onPrimaryFallback });
    expect(onPrimaryFallback).toHaveBeenCalledWith(curatedList);
    expect(updateActiveTrainingScope).not.toHaveBeenCalledWith(
      expect.objectContaining({
        listId: "curated-1",
        listType: "curated",
      }),
    );
  });
});
