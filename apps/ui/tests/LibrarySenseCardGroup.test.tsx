import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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
    expect(screen.getByText("bank · financial institution")).toBeInTheDocument();
    expect(screen.queryByText("bench · sofa")).not.toBeInTheDocument();
  });
});
