import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { LibrarySenseCardGroup } from "@/components/training/library-v2/LibrarySenseCardGroup";
import { buildLibrarySenseCardGroupModel } from "@/components/training/library-v2/librarySenseCardModel";
import { multiSenseBankGroup } from "./platformV2LibraryFixture";
import {
  gateLongHeadwordGroup,
  gateSingleSenseGroup,
} from "@/lib/platform/fixtures/senseCardV1GateFixture";

describe("LibrarySenseCardGroup", () => {
  test("keeps a localized long headword usable in the single-sense fixture", () => {
    render(
      <LibrarySenseCardGroup
        model={buildLibrarySenseCardGroupModel(gateLongHeadwordGroup, "ru")}
        interfaceLanguage="ru"
        translationEnabled
        onAction={vi.fn()}
      />,
    );

    const headword = screen.getByRole("heading", {
      name: "ar·beids·on·ge·schikt·heids·ver·ze·ke·ring",
    });
    expect(headword).toBeInTheDocument();
    expect(headword.querySelectorAll("wbr")).toHaveLength(9);
    expect(headword.querySelectorAll(".whitespace-nowrap")).toHaveLength(10);
    const metadata = screen.getByTestId("sense-card-metadata");
    expect(within(metadata).getByText("существительное")).toBeInTheDocument();
    expect(
      metadata.compareDocumentPosition(headword) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(headword).toHaveAttribute("data-long-headword", "true");
    expect(headword.className).toContain("text-[1.75rem]");
    expect(headword.className).not.toContain("cqw");
    expect(screen.queryByText("Значения")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Перевести" }),
    ).toBeInTheDocument();
  });

  test("does not create a meaning ordinal badge for a one-sense group", () => {
    const { container } = render(
      <LibrarySenseCardGroup
        model={buildLibrarySenseCardGroupModel(gateSingleSenseGroup, "nl")}
        interfaceLanguage="nl"
        onAction={vi.fn()}
      />,
    );

    expect(
      container.querySelector(
        "[data-testid='library-sense-card-entry-bank-furniture'] > span",
      ),
    ).not.toBeInTheDocument();
  });

  test("expands and acts on each meaning independently", () => {
    const onAction = vi.fn();
    render(
      <LibrarySenseCardGroup
        model={buildLibrarySenseCardGroupModel(multiSenseBankGroup, "en")}
        interfaceLanguage="en"
        translationEnabled
        onAction={onAction}
      />,
    );

    expect(screen.queryByText("Meanings")).not.toBeInTheDocument();
    expect(screen.getByText(/3×/)).toBeInTheDocument();
    expect(
      screen.queryByText("Bij welke bank hebt u een rekening?"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByTestId("library-sense-card-entry-bank-finance"),
    );
    expect(
      screen.getByText("Bij welke bank hebt u een rekening?"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Learn" }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: "start-learning",
        target: expect.objectContaining({
          entryId: "entry-bank-finance",
        }),
      }),
    );

    expect(screen.getAllByRole("button", { name: "Translate" })).toHaveLength(
      1,
    );
    fireEvent.click(screen.getByRole("button", { name: "Translate" }));
    expect(
      screen.getByText("bank · financial institution"),
    ).toBeInTheDocument();
    expect(screen.getByText("bench · sofa")).toBeInTheDocument();
  });

  test("does not render the aggregate group count as card chrome", () => {
    const model = buildLibrarySenseCardGroupModel(multiSenseBankGroup, "en");
    render(
      <LibrarySenseCardGroup
        model={{ ...model, senseCount: 7 }}
        interfaceLanguage="en"
        onAction={vi.fn()}
      />,
    );

    expect(screen.queryByText("7")).not.toBeInTheDocument();
  });

  test("keeps Library actions and never renders Training grading controls", () => {
    const model = buildLibrarySenseCardGroupModel(multiSenseBankGroup, "en");
    const markKnown = model.meanings[1].markKnown;
    const onOpenCollections = vi.fn();
    const onReport = vi.fn();
    render(
      <LibrarySenseCardGroup
        model={{
          ...model,
          meanings: [{ ...model.meanings[0], markKnown }, model.meanings[1]],
        }}
        interfaceLanguage="en"
        collectionCounts={{ "entry-bank-furniture": 2 }}
        onOpenCollections={onOpenCollections}
        onReport={onReport}
        onAction={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Again" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Hard" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Good" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Easy" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Mark as known/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collections · 2" }));
    expect(onOpenCollections).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: "entry-bank-furniture" }),
    );
    const firstCard = screen.getByTestId(
      "library-sense-card-entry-bank-furniture",
    );
    expect(
      within(firstCard).getByTestId("library-primary-actions"),
    ).toContainElement(
      within(firstCard).getByRole("button", { name: "Collections · 2" }),
    );
    expect(
      within(firstCard).getByTestId("sense-card-top-actions"),
    ).toContainElement(
      within(firstCard).getByRole("button", { name: "Collapse meaning" }),
    );
    expect(
      within(firstCard).getByTestId("library-service-actions"),
    ).toContainElement(
      within(firstCard).getByRole("button", { name: "Report" }),
    );
    fireEvent.click(within(firstCard).getByRole("button", { name: "Report" }));
    expect(onReport).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: "report-content",
        target: expect.objectContaining({ entryId: "entry-bank-furniture" }),
      }),
    );
  });

  test("resets local translation state when card type changes", async () => {
    const { rerender } = render(
      <LibrarySenseCardGroup
        model={buildLibrarySenseCardGroupModel(multiSenseBankGroup, "en")}
        interfaceLanguage="en"
        translationEnabled
        onAction={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Translate" }));
    expect(screen.getByText("bench · sofa")).toBeInTheDocument();

    rerender(
      <LibrarySenseCardGroup
        model={buildLibrarySenseCardGroupModel(
          {
            ...multiSenseBankGroup,
            entries: multiSenseBankGroup.entries.map((entry) =>
              entry.kind === "sense-card" ? { ...entry, card: null } : entry,
            ),
          },
          "en",
          "definition-to-word",
        )}
        interfaceLanguage="en"
        translationEnabled
        onAction={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.queryByText("bench · sofa")).not.toBeInTheDocument(),
    );
  });

  test("preserves typed hierarchy for optional content", () => {
    const group = {
      ...multiSenseBankGroup,
      entries: multiSenseBankGroup.entries.map((entry, index) =>
        entry.kind === "sense-card" && index === 0
          ? {
              ...entry,
              contentNodes: [
                ...entry.contentNodes,
                {
                  contentNodeId: "pattern-bank",
                  parentContentNodeId: null,
                  kind: "usage-pattern" as const,
                  order: 2,
                  text: "op de bank zitten",
                  sourceTextFingerprint: "pattern-bank-fingerprint",
                  translations: [],
                },
                {
                  contentNodeId: "idiom-bank",
                  parentContentNodeId: null,
                  kind: "idiom" as const,
                  order: 3,
                  text: "door de bank genomen",
                  sourceTextFingerprint: "idiom-bank-fingerprint",
                  translations: [],
                },
              ],
            }
          : entry,
      ),
    };
    const { container } = render(
      <LibrarySenseCardGroup
        model={buildLibrarySenseCardGroupModel(group, "en")}
        interfaceLanguage="en"
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Usage pattern")).toBeInTheDocument();
    expect(screen.getByText("Idioms")).toBeInTheDocument();
    expect(
      container.querySelector('[data-content-kind="usage-pattern"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-content-kind="idiom"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section-icon="usage"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section-icon="examples"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-section-icon="idioms"]'),
    ).toBeInTheDocument();
    const usagePattern = container.querySelector(
      '[data-content-kind="usage-pattern"]',
    );
    const example = container.querySelector('[data-content-kind="example"]');
    expect(usagePattern).toBeInTheDocument();
    expect(example).toBeInTheDocument();
    expect(
      (usagePattern as Element).compareDocumentPosition(example as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("shows completed known state instead of new", () => {
    const model = buildLibrarySenseCardGroupModel(multiSenseBankGroup, "en");
    const knownMeaning = {
      ...model.meanings[0],
      markKnown: null,
      undoKnown: {
        actionId: "undo-known" as const,
        elementId: "sense-card.known.undo",
        messageKey: "senseCard.known.undo",
        target: {
          kind: "sense-card" as const,
          entryId: model.meanings[0].entryId,
          cardTypeId: model.meanings[0].cardTypeId,
          stateRevision: "known-state",
          activeKnownMarkId: "known-mark",
          knownMarkRevision: "known-revision",
        },
      },
    };
    render(
      <LibrarySenseCardGroup
        model={{ ...model, meanings: [knownMeaning, model.meanings[1]] }}
        interfaceLanguage="en"
        onAction={vi.fn()}
      />,
    );

    const firstCard = screen.getByTestId(
      `library-sense-card-${knownMeaning.entryId}`,
    );
    expect(within(firstCard).getAllByText(/Marked as known/)).not.toHaveLength(
      0,
    );
    expect(within(firstCard).queryByText("New")).not.toBeInTheDocument();
  });

  test("renders the new state with the same bordered exposure chrome", () => {
    render(
      <LibrarySenseCardGroup
        model={buildLibrarySenseCardGroupModel(multiSenseBankGroup, "en")}
        interfaceLanguage="en"
        onAction={vi.fn()}
      />,
    );

    const financeCard = screen.getByTestId(
      "library-sense-card-entry-bank-finance",
    );
    const badge = within(financeCard).getByText("New").closest("span");
    expect(badge).toHaveClass("border");
    expect(badge?.querySelector("svg")).toBeInTheDocument();
  });
});
