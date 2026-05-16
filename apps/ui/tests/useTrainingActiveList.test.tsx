import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTrainingActiveList } from "@/lib/training/useTrainingActiveList";

const {
  fetchActiveList,
  fetchAvailableLists,
  fetchListSummaryById,
  updateActiveList,
} = vi.hoisted(() => ({
  fetchActiveList: vi.fn(),
  fetchAvailableLists: vi.fn(),
  fetchListSummaryById: vi.fn(),
  updateActiveList: vi.fn(),
}));

vi.mock("@/lib/trainingService", () => ({
  fetchActiveList,
  fetchAvailableLists,
  fetchListSummaryById,
  updateActiveList,
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

describe("useTrainingActiveList", () => {
  beforeEach(() => {
    fetchActiveList.mockReset();
    fetchAvailableLists.mockReset();
    fetchListSummaryById.mockReset();
    updateActiveList.mockReset();
    fetchAvailableLists.mockResolvedValue([curatedList]);
    fetchActiveList.mockResolvedValue({ listId: null, listType: null });
    fetchListSummaryById.mockResolvedValue(null);
    updateActiveList.mockResolvedValue({ error: null });
  });

  test("hydrates a saved active list", async () => {
    fetchActiveList.mockResolvedValue({ listId: "user-1", listType: "user" });
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
  });

  test("clears a deleted saved list and then auto-selects primary", async () => {
    fetchActiveList.mockResolvedValue({ listId: "missing", listType: "user" });
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

    expect(updateActiveList).toHaveBeenCalledWith({
      userId: "user-1",
      listId: null,
      listType: null,
    });
    expect(result.current.wordListType).toBe("curated");
    expect(result.current.wordListLabel).toBe("Primary");
  });

  test("persists explicit list selection and exposes footer options", async () => {
    fetchAvailableLists.mockResolvedValue([curatedList, userList]);

    const { result } = renderHook(() =>
      useTrainingActiveList({
        userId: "user-1",
        language: "nl",
        showSettings: false,
      }),
    );

    await waitFor(() => expect(result.current.availableLists).toHaveLength(2));

    await result.current.handleListSelectValue("user:user-1");

    expect(updateActiveList).toHaveBeenCalledWith({
      userId: "user-1",
      listId: "user-1",
      listType: "user",
    });
    await waitFor(() => expect(result.current.activeListValue).toBe("user:user-1"));
    expect(result.current.listOptions).toEqual([
      { value: "curated:curated-1", label: "Primary" },
      { value: "user:user-1", label: "Saved" },
    ]);
  });

  test("list updates keep resolved active list or fall back to primary", async () => {
    fetchAvailableLists.mockResolvedValue([curatedList, userList]);
    fetchActiveList
      .mockResolvedValueOnce({ listId: null, listType: null })
      .mockResolvedValueOnce({ listId: "user-1", listType: "user" })
      .mockResolvedValueOnce({ listId: "missing", listType: "user" });
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
    expect(updateActiveList).toHaveBeenCalledWith({
      userId: "user-1",
      listId: "curated-1",
      listType: "curated",
    });
  });
});
