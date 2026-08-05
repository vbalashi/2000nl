import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { LibrarySenseCardGroup } from "@/components/training/library-v2/LibrarySenseCardGroup";
import { buildLibrarySenseCardGroupModel } from "@/components/training/library-v2/librarySenseCardModel";
import { multiSenseBankGroup } from "./platformV2LibraryFixture";

describe("LibrarySenseCardGroup", () => {
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

    expect(screen.getByText("Meanings")).toBeInTheDocument();
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

    fireEvent.click(
      screen.getByRole("button", {
        name: "Show translation for meaning 2",
      }),
    );
    expect(
      screen.getByText("bank · financial institution"),
    ).toBeInTheDocument();
    expect(screen.queryByText("bench · sofa")).not.toBeInTheDocument();
  });

  test("renders the authoritative group count", () => {
    const model = buildLibrarySenseCardGroupModel(multiSenseBankGroup, "en");
    render(
      <LibrarySenseCardGroup
        model={{ ...model, senseCount: 7 }}
        interfaceLanguage="en"
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByText("7")).toBeInTheDocument();
  });

  test("keeps the quiet known action beside review controls", () => {
    const model = buildLibrarySenseCardGroupModel(multiSenseBankGroup, "en");
    const markKnown = model.meanings[1].markKnown;
    render(
      <LibrarySenseCardGroup
        model={{
          ...model,
          meanings: [{ ...model.meanings[0], markKnown }, model.meanings[1]],
        }}
        interfaceLanguage="en"
        onAction={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Mark as known/ }),
    ).toBeInTheDocument();
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
    fireEvent.click(
      screen.getByRole("button", {
        name: "Show translation for meaning 1",
      }),
    );
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
  });
});
