import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LibraryCollectionsPicker } from "@/components/training/library-v2/LibraryCollectionsPicker";

describe("LibraryCollectionsPicker", () => {
  it("edits list membership for the selected meaning", () => {
    const onToggleList = vi.fn();
    const onCreateList = vi.fn();

    render(
      <LibraryCollectionsPicker
        open
        headword="bank"
        definition="een meubelstuk waarop je met meer personen kunt zitten"
        interfaceLanguage="nl"
        userLists={[
          {
            id: "daily-review",
            name: "Dagelijkse herhaling",
            type: "user",
            item_count: 24,
          },
          {
            id: "youtube-week",
            name: "YouTube · deze week",
            type: "user",
            item_count: 17,
          },
        ]}
        memberships={[
          {
            listId: "daily-review",
            listType: "user",
            name: "Dagelijkse herhaling",
            editable: true,
            isActiveTrainingList: false,
          },
        ]}
        busyListId={null}
        status={null}
        onClose={vi.fn()}
        onToggleList={onToggleList}
        onCreateList={onCreateList}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /YouTube/ }));
    expect(onToggleList).toHaveBeenCalledWith(
      expect.objectContaining({ id: "youtube-week" }),
      false,
    );

    fireEvent.change(screen.getByPlaceholderText("Naam van nieuwe collectie"), {
      target: { value: "Werkwoorden" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Maken" }));
    expect(onCreateList).toHaveBeenCalledWith("Werkwoorden");
  });
});
