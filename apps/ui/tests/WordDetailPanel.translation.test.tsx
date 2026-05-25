import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { WordDetailPanel } from "@/components/training/WordDetailPanel";

vi.mock("@/lib/trainingService", () => ({
  addWordsToUserList: vi.fn(),
  createUserList: vi.fn(),
  fetchEntryListMemberships: vi.fn(async () => new Map()),
  recordReview: vi.fn(),
}));

const entry = {
  id: "20c4f438-7cc4-4ccb-9fac-d4320ff78258",
  headword: "lopen",
  part_of_speech: "ww",
  gender: null,
  is_nt2_2000: true,
  raw: {
    meanings: [
      {
        definition: "gaan te voet, zich voortbewegen",
        examples: ["Ik loop elke ochtend naar het station."],
      },
    ],
  },
};

function jsonResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Server Error",
    json: async () => data,
    text: async () => (typeof data === "string" ? data : JSON.stringify(data)),
  } as Response;
}

describe("WordDetailPanel translation behavior", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: "Server is not configured" }, false, 500),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("does not refetch in a loop after an automatic translation failure", async () => {
    render(
      <WordDetailPanel
        entry={entry as any}
        userId="test-user"
        translationLang="ru"
        userLists={[]}
      />,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    await new Promise((resolve) => window.setTimeout(resolve, 50));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("can leave lookup details idle until translation is explicitly requested", async () => {
    render(
      <WordDetailPanel
        entry={entry as any}
        userId="test-user"
        translationLang="ru"
        userLists={[]}
        autoFetchTranslation={false}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Nog niet opgeslagen in een leerlijst."))
        .toBeInTheDocument(),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
