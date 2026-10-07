import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, test, vi } from "vitest";
import { LibraryCollectionsPicker } from "@/components/training/library-v2/LibraryCollectionsPicker";

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
});

describe("LibraryCollectionsPicker", () => {
  it("edits list membership for the selected meaning", () => {
    const onToggleList = vi.fn();
    const onCreateList = vi.fn();
    const onOpenListMembership = vi.fn();

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
        onOpenListMembership={onOpenListMembership}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /YouTube/ }));
    expect(onToggleList).toHaveBeenCalledWith(
      expect.objectContaining({ id: "youtube-week" }),
      false,
    );

    fireEvent.click(screen.getByRole("button", { name: /Nieuwe collectie/i }));
    fireEvent.change(screen.getByPlaceholderText("Naam van nieuwe collectie"), {
      target: { value: "Werkwoorden" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Maken" }));
    expect(onCreateList).toHaveBeenCalledWith("Werkwoorden");

    fireEvent.click(screen.getByRole("button", { name: "Open lijst" }));
    expect(onOpenListMembership).toHaveBeenCalledWith(
      expect.objectContaining({ listId: "daily-review" }),
    );
  });
});


describe("membership read recovery", () => {
  test.each(["loading", "failed"] as const)("%s blocks editing without presenting unknown membership as empty", state => {
    const retry=vi.fn(), toggle=vi.fn(), create=vi.fn();
    render(<LibraryCollectionsPicker open headword="huis" definition="a house" interfaceLanguage="en"
      userLists={[]} memberships={[]} busyListId={null} status={null} membershipState={state}
      onRetryMemberships={retry} onClose={vi.fn()} onToggleList={toggle} onCreateList={create} />);
    expect(screen.queryByText("No collections found")).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:/New collection/i})).toBeDisabled();
    if(state==="failed") {
      expect(screen.getByRole("alert")).toHaveTextContent("Collection membership could not be loaded");
      fireEvent.click(screen.getByRole("button",{name:"Reload membership"}));expect(retry).toHaveBeenCalledOnce();
    } else expect(screen.getByText("Loading collection membership…")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();expect(toggle).not.toHaveBeenCalled();
  });
});

test("approved picker opens creation on demand and keeps its existing callback", () => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.open = false; } });
  const create = vi.fn();
  render(<LibraryCollectionsPicker open headword="huis" definition="a house" interfaceLanguage="en"
    userLists={[]} memberships={[]} busyListId={null} status={null}
    onClose={vi.fn()} onToggleList={vi.fn()} onCreateList={create} />);
  expect(screen.queryByPlaceholderText("New collection name")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /New collection/i }));
  fireEvent.change(screen.getByPlaceholderText("New collection name"), { target: { value: "  Verbs  " } });
  fireEvent.submit(screen.getByPlaceholderText("New collection name").closest("form")!);
  expect(create).toHaveBeenCalledWith("Verbs");
  vi.unstubAllEnvs();
});
