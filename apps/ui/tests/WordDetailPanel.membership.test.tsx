import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { WordDetailPanel } from "@/components/training/WordDetailPanel";
import type { EntryLearningListMembership, WordListSummary } from "@/lib/types";

const serviceMocks = vi.hoisted(() => ({
  addWordsToUserList: vi.fn(),
  createUserList: vi.fn(),
  fetchEntryListMemberships: vi.fn(),
  recordReview: vi.fn(),
}));

vi.mock("@/lib/trainingService", () => ({
  addWordsToUserList: serviceMocks.addWordsToUserList,
  createUserList: serviceMocks.createUserList,
  fetchEntryListMemberships: serviceMocks.fetchEntryListMemberships,
  recordReview: serviceMocks.recordReview,
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

const userList: WordListSummary = {
  id: "user-list-1",
  name: "Mijn oefenlijst",
  type: "user",
};

const renderPanel = (props?: {
  memberships?: EntryLearningListMembership[];
  userLists?: WordListSummary[];
  onListsUpdated?: () => Promise<void> | void;
}) => {
  serviceMocks.fetchEntryListMemberships.mockResolvedValue(
    new Map([[entry.id, props?.memberships ?? []]]),
  );

  return render(
    <WordDetailPanel
      entry={entry as any}
      userId="test-user"
      translationLang={null}
      userLists={props?.userLists ?? []}
      onListsUpdated={props?.onListsUpdated}
      autoFetchTranslation={false}
    />,
  );
};

describe("WordDetailPanel membership behavior", () => {
  beforeEach(() => {
    serviceMocks.addWordsToUserList.mockReset();
    serviceMocks.createUserList.mockReset();
    serviceMocks.fetchEntryListMemberships.mockReset();
    serviceMocks.recordReview.mockReset();
  });

  test("shows dictionary source separately and an empty learning-list state", async () => {
    renderPanel();

    expect(screen.getByText("Bron:")).toBeInTheDocument();
    expect(screen.getByText("VanDale woordenboek")).toBeInTheDocument();
    expect(await screen.findByText("Nog niet opgeslagen in een leerlijst."))
      .toBeInTheDocument();

    const membershipSection = screen.getByLabelText("Leerlijstlidmaatschap");
    expect(within(membershipSection).queryByText(/VanDale/)).not.toBeInTheDocument();
    expect(screen.queryByText(/In lijsten/i)).not.toBeInTheDocument();
  });

  test("renders an editable user-list membership", async () => {
    renderPanel({
      memberships: [
        {
          listId: "user-list-1",
          listType: "user",
          name: "Mijn oefenlijst",
          editable: true,
          itemCount: 12,
          primaryLanguageCode: "nl",
          isActiveTrainingList: false,
        },
      ],
      userLists: [userList],
    });

    const membershipSection = screen.getByLabelText("Leerlijstlidmaatschap");
    await waitFor(() =>
      expect(within(membershipSection).getByText("Mijn oefenlijst"))
        .toBeInTheDocument(),
    );
    expect(screen.getByText("Mijn lijst")).toBeInTheDocument();
    expect(screen.getByText("Bewerkbaar")).toBeInTheDocument();
    expect(screen.getByText("12 woorden")).toBeInTheDocument();
  });

  test("renders a curated learning-list membership as read-only", async () => {
    renderPanel({
      memberships: [
        {
          listId: "curated-list-1",
          listType: "curated",
          name: "VanDale 2k",
          editable: false,
          readOnlyReason: "curated",
          itemCount: 2000,
          primaryLanguageCode: "nl",
          isActiveTrainingList: false,
        },
      ],
      userLists: [userList],
    });

    const membershipSection = screen.getByLabelText("Leerlijstlidmaatschap");
    await waitFor(() =>
      expect(within(membershipSection).getByText("VanDale 2k"))
        .toBeInTheDocument(),
    );
    expect(screen.getByText("Curated leerlijst")).toBeInTheDocument();
    expect(screen.getByText("Alleen-lezen")).toBeInTheDocument();
  });

  test("shows curated and user memberships together", async () => {
    renderPanel({
      memberships: [
        {
          listId: "curated-list-1",
          listType: "curated",
          name: "VanDale 2k",
          editable: false,
          readOnlyReason: "curated",
          isActiveTrainingList: true,
        },
        {
          listId: "user-list-1",
          listType: "user",
          name: "Mijn oefenlijst",
          editable: true,
          isActiveTrainingList: false,
        },
      ],
      userLists: [userList],
    });

    const membershipSection = screen.getByLabelText("Leerlijstlidmaatschap");
    await waitFor(() =>
      expect(within(membershipSection).getByText("VanDale 2k"))
        .toBeInTheDocument(),
    );
    expect(within(membershipSection).getByText("Mijn oefenlijst"))
      .toBeInTheDocument();
    expect(screen.getByText("Actieve training")).toBeInTheDocument();
    expect(screen.getByText("Bewerkbaar")).toBeInTheDocument();
    expect(screen.getByText("Alleen-lezen")).toBeInTheDocument();
  });

  test("blocks duplicate add when the selected target already contains the entry", async () => {
    renderPanel({
      memberships: [
        {
          listId: "user-list-1",
          listType: "user",
          name: "Mijn oefenlijst",
          editable: true,
          isActiveTrainingList: false,
        },
      ],
      userLists: [userList],
    });

    const addButton = await screen.findByRole("button", {
      name: "Staat al in lijst",
    });
    expect(addButton).toBeDisabled();
    expect(screen.getByText("Dit woord staat al in de gekozen lijst."))
      .toBeInTheDocument();
    expect(serviceMocks.addWordsToUserList).not.toHaveBeenCalled();
  });

  test("shows a recoverable membership error without selected-list fallback", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    serviceMocks.fetchEntryListMemberships
      .mockRejectedValueOnce(new Error("membership failed"))
      .mockResolvedValueOnce(new Map([[entry.id, []]]));
    const user = userEvent.setup();

    render(
      <WordDetailPanel
        entry={entry as any}
        userId="test-user"
        translationLang={null}
        userLists={[]}
        autoFetchTranslation={false}
      />,
    );

    expect(await screen.findByText("Kon lijsten niet laden."))
      .toBeInTheDocument();
    expect(screen.queryByText(/In lijsten/i)).not.toBeInTheDocument();

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Opnieuw" }));
    });

    expect(await screen.findByText("Nog niet opgeslagen in een leerlijst."))
      .toBeInTheDocument();
    consoleError.mockRestore();
  });

  test("refreshes visible membership after adding to a user list", async () => {
    const onListsUpdated = vi.fn();
    serviceMocks.fetchEntryListMemberships
      .mockResolvedValueOnce(new Map([[entry.id, []]]))
      .mockResolvedValueOnce(
        new Map([
          [
            entry.id,
            [
              {
                listId: "user-list-1",
                listType: "user",
                name: "Mijn oefenlijst",
                editable: true,
                itemCount: 1,
                isActiveTrainingList: false,
              },
            ],
          ],
        ]),
      );
    serviceMocks.addWordsToUserList.mockResolvedValue({ error: null });

    render(
      <WordDetailPanel
        entry={entry as any}
        userId="test-user"
        translationLang={null}
        userLists={[userList]}
        onListsUpdated={onListsUpdated}
        autoFetchTranslation={false}
      />,
    );

    expect(await screen.findByText("Nog niet opgeslagen in een leerlijst."))
      .toBeInTheDocument();

    const user = userEvent.setup();
    await act(async () => {
      await user.click(
        screen.getByRole("button", { name: "Toevoegen aan lijst" }),
      );
    });

    await waitFor(() =>
      expect(serviceMocks.addWordsToUserList).toHaveBeenCalledWith(
        "user-list-1",
        [entry.id],
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Staat al in lijst" }))
        .toBeDisabled(),
    );
    expect(screen.getByText("Bewerkbaar")).toBeInTheDocument();
    expect(screen.getByText("Woord toegevoegd aan lijst.")).toBeInTheDocument();
    expect(onListsUpdated).toHaveBeenCalledTimes(1);
    expect(serviceMocks.recordReview).not.toHaveBeenCalled();
  });
});
