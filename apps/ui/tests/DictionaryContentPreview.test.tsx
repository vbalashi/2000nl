import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DictionaryContentPreview } from "@/components/admin/DictionaryContentPreview";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DictionaryContentPreview", () => {
  it("loads dictionary entries only after the explicit action and paginates through audited reads", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        items: [{ id: "entry-1", headword: "huis", languageCode: "nl", partOfSpeech: "noun", meaningId: 1, definition: "gebouw" }],
        page: 1,
        pageSize: 25,
        total: 26,
        hasNext: true,
      }))
      .mockResolvedValueOnce(Response.json({
        items: [{ id: "entry-2", headword: "huisje", languageCode: "nl", partOfSpeech: "noun", meaningId: 1, definition: "klein huis" }],
        page: 2,
        pageSize: 25,
        total: 26,
        hasNext: false,
      }));
    vi.stubGlobal("fetch", fetchMock);

    render(<DictionaryContentPreview dictionaryId="dictionary-1" />);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Просмотреть содержимое" }));
    expect(await screen.findByText("gebouw")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/dictionaries/dictionary-1/content?page=1&pageSize=25",
      { cache: "no-store" },
    );

    fireEvent.click(screen.getByRole("button", { name: "Дальше" }));
    await waitFor(() => expect(screen.getByText("klein huis")).toBeTruthy());
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/admin/dictionaries/dictionary-1/content?page=2&pageSize=25",
      { cache: "no-store" },
    );
  });
});
