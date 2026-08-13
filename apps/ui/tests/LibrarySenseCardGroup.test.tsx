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
import { goedGroup, nodigGroup } from "./platformV2IdiomHierarchyFixture";
import {
  gateLongHeadwordGroup,
  gateSingleSenseGroup,
} from "@/lib/platform/fixtures/senseCardV1GateFixture";

describe("LibrarySenseCardGroup", () => {
  test("renders the goed expression, explanation, and example as one owned hierarchy", () => {
    const onReport = vi.fn();
    const { container } = render(
      <LibrarySenseCardGroup
        model={buildLibrarySenseCardGroupModel(goedGroup, "en")}
        interfaceLanguage="en"
        onReport={onReport}
        onAction={vi.fn()}
      />,
    );

    const expression = container.querySelector('[data-content-node-id="idiom-goed"]');
    const explanation = container.querySelector(
      '[data-content-node-id="idiom-explanation-goed"]',
    );
    const example = container.querySelector(
      '[data-content-node-id="idiom-example-goed"]',
    );
    expect(expression).toContainElement(explanation as HTMLElement);
    expect(expression).toContainElement(example as HTMLElement);
    expect(expression?.querySelector("p")).toHaveClass("italic");
    expect(explanation?.querySelector("p")).not.toHaveClass("italic");
    expect(example?.querySelector("p")).toHaveClass("italic");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Report: iets is bestemd voor iemand of iets; iets is gunstig voor iemand of iets",
      }),
    );
    expect(onReport).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          kind: "content-node",
          contentNodeId: "idiom-explanation-goed",
        }),
      }),
    );
  });
  test("renders two nodig idiom roots with separate explanations", () => {
    const { container } = render(
      <LibrarySenseCardGroup
        model={buildLibrarySenseCardGroupModel(nodigGroup, "en")}
        interfaceLanguage="en"
        onAction={vi.fn()}
      />,
    );

    const idioms = container.querySelectorAll('[data-content-kind="idiom"]');
    expect(idioms).toHaveLength(2);
    expect(idioms[0].querySelectorAll('[data-content-kind="idiom-explanation"]')).toHaveLength(1);
    expect(idioms[1].querySelectorAll('[data-content-kind="idiom-explanation"]')).toHaveLength(1);
  });
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
    const scrollRegion = screen.getByTestId(
      "library-sense-card-scroll-region",
    );
    expect(within(metadata).getByText("существительное")).toBeInTheDocument();
    expect(
      metadata.compareDocumentPosition(headword) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(headword).toHaveAttribute("data-long-headword", "true");
    expect(scrollRegion).not.toContainElement(headword);
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
    const exposureBadge = screen.getByLabelText("3×");
    expect(exposureBadge).toBeInTheDocument();
    expect(exposureBadge).toHaveClass("h-6");
    expect(
      screen
        .getByText("Bij welke bank hebt u een rekening?")
        .closest('[aria-hidden="true"]'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Expand meaning" }),
    ).toBeInTheDocument();
    const financeCard = screen.getByTestId(
      "library-sense-card-entry-bank-finance",
    );
    expect(financeCard).toHaveClass("py-2.5");
    expect(
      within(financeCard).getByTestId("library-sense-card-lead"),
    ).toHaveClass("grid", "items-start");
    expect(
      within(financeCard).getByTestId("sense-card-top-actions"),
    ).not.toHaveClass("float-right");
    const furnitureDetails = screen
      .getByText("Margriet en Ellie zaten op de bank televisie te kijken.")
      .closest('[aria-hidden="false"]');
    expect(furnitureDetails).toHaveClass("mt-3");

    fireEvent.click(
      financeCard,
    );
    expect(
      screen.getByText("Bij welke bank hebt u een rekening?"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Collapse meaning" }),
    ).toHaveLength(2);

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
    expect(furnitureDetails).toHaveClass("mt-4");
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
      expect(
        screen.getByText("bench · sofa").closest('[aria-hidden="true"]'),
      ).toBeInTheDocument(),
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
    expect(usagePattern?.querySelector("div[class*='border-l']")).toHaveClass(
      "border-slate-400",
    );
    expect(
      container
        .querySelector('[data-content-kind="idiom"]')
        ?.querySelector("div[class*='border-l']"),
    ).toHaveClass("border-amber-400");
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
