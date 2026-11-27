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
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("keeps the drawer open when interacting with its portalled assistant", () => {
    const onClose = vi.fn();
    render(<WordDetailDrawer selection={null} draft={<span>Draft</span>} open onClose={onClose}
      userId="user-1" contentLanguageCode="nl" translationLang="en" interfaceLanguage="en" userLists={[]} />);
    const drawer = screen.getByRole("region", { name: /word details/i });
    vi.spyOn(drawer, "getClientRects").mockReturnValue([{ } as DOMRect] as unknown as DOMRectList);
    const assistant = document.createElement("aside");
    assistant.setAttribute("data-personal-assistant", "");
    const button = document.createElement("button");
    assistant.append(button);
    document.body.append(assistant);
    fireEvent.pointerDown(button, { isPrimary: true });
    fireEvent.click(button, { detail: 1 });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body, { isPrimary: true });
    fireEvent.click(document.body, { detail: 1 });
    expect(onClose).toHaveBeenCalledOnce();
    assistant.remove();
  });
});
