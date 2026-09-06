import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { WordDetailDrawer } from "@/components/training/wordlist/WordDetailDrawer";

describe("WordDetailDrawer", () => {
  test("offers a localized pointer close target on mobile", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
