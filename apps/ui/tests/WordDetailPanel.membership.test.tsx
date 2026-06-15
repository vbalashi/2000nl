import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { WordDetailPanel } from "@/components/training/WordDetailPanel";
import type { EntryLearningListMembership, WordListSummary } from "@/lib/types";

const serviceMocks = vi.hoisted(() => ({
  addWordsToUserList: vi.fn(),
  copyEntryToUserDictionary: vi.fn(),
  createUserList: vi.fn(),
  fetchDictionaryEntryById: vi.fn(),
  fetchEntryListMemberships: vi.fn(),
  recordReview: vi.fn(),
  removeWordsFromUserList: vi.fn(),
}));

vi.mock("@/lib/trainingService", () => ({
  addWordsToUserList: serviceMocks.addWordsToUserList,
  copyEntryToUserDictionary: serviceMocks.copyEntryToUserDictionary,
  createUserList: serviceMocks.createUserList,
  fetchDictionaryEntryById: serviceMocks.fetchDictionaryEntryById,
  fetchEntryListMemberships: serviceMocks.fetchEntryListMemberships,
  recordReview: serviceMocks.recordReview,
  removeWordsFromUserList: serviceMocks.removeWordsFromUserList,
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
  entry?: typeof entry;
  memberships?: EntryLearningListMembership[];
  userLists?: WordListSummary[];
  onListsUpdated?: () => Promise<void> | void;
  onOpenListMembership?: (membership: EntryLearningListMembership) => void;
}) => {
  const panelEntry = props?.entry ?? entry;
  serviceMocks.fetchEntryListMemberships.mockResolvedValue(
    new Map([[panelEntry.id, props?.memberships ?? []]]),
  );

  return render(
    <WordDetailPanel
      entry={panelEntry as any}
      userId="test-user"
      translationLang={null}
      userLists={props?.userLists ?? []}
      onListsUpdated={props?.onListsUpdated}
      onOpenListMembership={props?.onOpenListMembership}
      autoFetchTranslation={false}
    />,
  );
};

describe("WordDetailPanel membership behavior", () => {
  beforeEach(() => {
    serviceMocks.addWordsToUserList.mockReset();
    serviceMocks.copyEntryToUserDictionary.mockReset();
    serviceMocks.createUserList.mockReset();
    serviceMocks.fetchDictionaryEntryById.mockReset();
    serviceMocks.fetchEntryListMemberships.mockReset();
    serviceMocks.recordReview.mockReset();
    serviceMocks.removeWordsFromUserList.mockReset();
  });

  test("shows dictionary source separately and an empty learning-list state", async () => {
    renderPanel();

    expect(screen.getByText("Bron:")).toBeInTheDocument();
    expect(screen.getByText("VanDale woordenboek")).toBeInTheDocument();
    expect(await screen.findByText("Nog niet opgeslagen in een lijst."))
      .toBeInTheDocument();

    const membershipSection = screen.getByLabelText("Leerlijstlidmaatschap");
    expect(within(membershipSection).queryByText(/VanDale/)).not.toBeInTheDocument();
    expect(screen.getByText(/In lijsten/i)).toBeInTheDocument();
  });

  test("shows top-level dictionary metadata as the detail source", async () => {
    renderPanel({
      entry: {
        ...entry,
        dictionary_name: "My dictionary",
        dictionary_kind: "user",
      } as any,
    });

    expect(screen.getByText("Bron:")).toBeInTheDocument();
    expect(screen.getByText("My dictionary")).toBeInTheDocument();
    expect(await screen.findByText("Nog niet opgeslagen in een lijst."))
      .toBeInTheDocument();
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
    expect(screen.getByText(/In 1 lijst: Mijn oefenlijst/)).toBeInTheDocument();
    expect(screen.getByText(/Mijn lijst\s+·\s+bewerkbaar/i)).toBeInTheDocument();
    expect(screen.getByText("12 woorden")).toBeInTheDocument();
  });

  test("opens a containing list from membership state", async () => {
    const onOpenListMembership = vi.fn();
    const membership: EntryLearningListMembership = {
      listId: "user-list-1",
      listType: "user",
      name: "Mijn oefenlijst",
      editable: true,
      itemCount: 12,
      primaryLanguageCode: "nl",
      isActiveTrainingList: false,
    };
    renderPanel({
      memberships: [membership],
      userLists: [userList],
      onOpenListMembership,
    });

    const user = userEvent.setup();
    expect(await screen.findByText("Mijn oefenlijst")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open lijst" }));

    expect(onOpenListMembership).toHaveBeenCalledWith(membership);
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
    expect(screen.getByText(/Gecureerd\s+·\s+alleen-lezen/i)).toBeInTheDocument();
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
    expect(
      screen.getByText(/Gecureerd\s+·\s+alleen-lezen\s+·\s+actief voor training/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Mijn lijst\s+·\s+bewerkbaar/i)).toBeInTheDocument();
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
      name: "Opgeslagen",
    });
    expect(addButton).toBeDisabled();
    expect(screen.getByText("In deze lijst."))
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
    expect(screen.getByText(/In lijsten/i)).toBeInTheDocument();

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Opnieuw" }));
    });

    expect(await screen.findByText("Nog niet opgeslagen in een lijst."))
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

    expect(await screen.findByText("Nog niet opgeslagen in een lijst."))
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
      expect(screen.getByRole("button", { name: "Opgeslagen" })).toBeDisabled(),
    );
    expect(screen.getByText(/Mijn lijst\s+·\s+bewerkbaar/i)).toBeInTheDocument();
    expect(screen.getByText("Woord toegevoegd aan lijst.")).toBeInTheDocument();
    expect(onListsUpdated).toHaveBeenCalledTimes(1);
    expect(serviceMocks.recordReview).not.toHaveBeenCalled();
  });

  test("removes an editable user-list membership and refreshes state", async () => {
    const onListsUpdated = vi.fn();
    serviceMocks.fetchEntryListMemberships
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
      )
      .mockResolvedValueOnce(new Map([[entry.id, []]]));
    serviceMocks.removeWordsFromUserList.mockResolvedValue({ error: null });

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

    expect(await screen.findByText("Mijn oefenlijst")).toBeInTheDocument();

    const user = userEvent.setup();
    await act(async () => {
      await user.click(
        screen.getByRole("button", { name: "Verwijder uit lijst" }),
      );
    });

    await waitFor(() =>
      expect(serviceMocks.removeWordsFromUserList).toHaveBeenCalledWith(
        "user-list-1",
        [entry.id],
      ),
    );
    expect(await screen.findByText("Nog niet opgeslagen in een lijst."))
      .toBeInTheDocument();
    expect(screen.getByText("Woord uit lijst verwijderd.")).toBeInTheDocument();
    expect(onListsUpdated).toHaveBeenCalledTimes(1);
  });

  test("keeps current-card actions learner-facing and hides train-next for the current card", async () => {
    serviceMocks.fetchEntryListMemberships.mockResolvedValue(
      new Map([[entry.id, []]]),
    );
    const onTrainWord = vi.fn();
    const onTrainingAction = vi.fn();

    render(
      <WordDetailPanel
        entry={entry as any}
        userId="test-user"
        translationLang={null}
        userLists={[]}
        currentTrainingEntryId={entry.id}
        onTrainingAction={onTrainingAction}
        onTrainWord={onTrainWord}
        autoFetchTranslation={false}
      />,
    );

    expect(await screen.findByText("Later oefenen")).toBeInTheDocument();
    expect(screen.queryByText("Bevriezen")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /train dit woord als volgende kaart/i,
      }),
    ).not.toBeInTheDocument();
  });
});
