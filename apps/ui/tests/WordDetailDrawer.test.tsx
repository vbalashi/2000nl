import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { WordDetailDrawer } from "@/components/training/wordlist/WordDetailDrawer";

describe("WordDetailDrawer", () => {
  test("renders the resizable mobile sheet without owning nested dialog Escape", () => {
    const onClose = vi.fn();
    render(
      <WordDetailDrawer
        selection={{ entryId: "entry-1", headword: "bank" }}
        open
        onClose={onClose}
        userId="user-1"
        contentLanguageCode="nl"
        translationLang="en"
        interfaceLanguage="ru"
        userLists={[]}
      />,
    );

    expect(screen.getByRole("region", { name: "Сведения о слове" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
