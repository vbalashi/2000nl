import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { LibraryDestination } from "@/components/navigation/LibraryDestination";

vi.mock("@/components/training/wordlist/DictionarySearchTab", async () => {
  const ReactModule = await import("react");
  return {
    createDictionarySearchTabState: () => ({ query: "" }),
    DictionarySearchTab: ({
      open,
      preload,
      searchState,
      onSearchStateChange,
    }: {
      open: boolean;
      preload: boolean;
      searchState: { query: string };
      onSearchStateChange: (update: (current: { query: string }) => { query: string }) => void;
    }) => ReactModule.createElement(
      "div",
      {
        "data-testid": "library-search",
        "data-open": String(open),
        "data-preload": String(preload),
        "data-active": String(open || preload),
        "data-query": searchState.query,
      },
      ReactModule.createElement("button", {
        type: "button",
        "aria-label": "Set search query",
        onClick: () => onSearchStateChange((current) => ({ ...current, query: "huis" })),
      }),
    ),
  };
});

afterEach(() => {
  vi.useRealTimers();
});

const props = {
  userId: "library-lifecycle-user",
  language: "nl",
  translationLang: "en",
  interfaceLanguage: "en" as const,
  lists: [],
  activeList: null,
  onReloadLists: vi.fn(async () => undefined),
};

test("hidden Library stays inactive until opened and retains search state across navigation", () => {
  vi.useFakeTimers();
  const { rerender } = render(<LibraryDestination {...props} open={false} />);

  act(() => {
    vi.advanceTimersByTime(750);
  });

  expect(screen.queryByTestId("library-search")).not.toBeInTheDocument();

  rerender(<LibraryDestination {...props} open />);
  expect(screen.getByTestId("library-search")).toHaveAttribute("data-preload", "false");
  expect(screen.getByTestId("library-search")).toHaveAttribute("data-active", "true");
  fireEvent.click(screen.getByRole("button", { name: "Set search query" }));
  expect(screen.getByTestId("library-search")).toHaveAttribute("data-query", "huis");

  rerender(<LibraryDestination {...props} open={false} />);
  expect(screen.getByTestId("library-search")).toHaveAttribute("data-query", "huis");
  rerender(<LibraryDestination {...props} open />);
  expect(screen.getByTestId("library-search")).toHaveAttribute("data-query", "huis");
});
