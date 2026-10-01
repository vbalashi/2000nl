import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { AccountLibraryFilters } from "@/components/practice/library/AccountLibraryFilters";
import type { LibraryFilterDraft } from "@/components/practice/library/LibraryFilters";

const mocked = vi.hoisted(() => ({
  fetchPage: vi.fn(),
  material: {
    status: "ready", currentLanguageAllowed: true,
    languages: [{ code: "nl", label: "Dutch" }],
    dictionaries: [{ id: "source", name: "Van Dale" }],
    reload: vi.fn(),
  },
}));
vi.mock("@/components/practice/material/AccountMaterialProvider", () => ({
  useAccountMaterial: () => ({ userId: "user", snapshot: { revision: 1 } }),
}));
vi.mock("@/components/practice/material/useLibraryMaterialSelection", () => ({
  useLibraryMaterialSelection: () => mocked.material,
}));
vi.mock("@/lib/platform/platformV2LibraryClient", () => ({
  fetchPlatformV2LibraryGroupPage: mocked.fetchPage,
}));
const value: LibraryFilterDraft = { languageCode: "nl", dictionaryId: null, parts: [], article: null };
const props = { value, query: "goed", locale: "en" as const, onClose: vi.fn(), onApply: vi.fn() };

beforeEach(() => {
  mocked.fetchPage.mockReset();
  mocked.material.status = "ready";
  mocked.material.currentLanguageAllowed = true;
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute("open", ""); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute("open"); },
  });
});

test("preview uses real group totals and aborted drafts cannot replace the current count", async () => {
  let resolveOld!: (page: unknown) => void;
  mocked.fetchPage.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  mocked.fetchPage.mockResolvedValueOnce({ librarySearch: { totalGroups: 1 } });
  render(<AccountLibraryFilters {...props} />);
  await waitFor(() => expect(mocked.fetchPage).toHaveBeenCalledTimes(1));
  const oldSignal = mocked.fetchPage.mock.calls[0][0].signal;
  fireEvent.click(screen.getByRole("button", { name: "Nouns" }));
  await screen.findByText("1 matching article");
  expect(oldSignal.aborted).toBe(true);
  expect(mocked.fetchPage.mock.calls[1][0]).toMatchObject({
    query: "goed", translationTargetLanguageCode: null,
    libraryScope: { dictionaryIds: null, filters: { parts: ["noun"], article: null } },
  });
  await act(async () => { resolveOld({ librarySearch: { totalGroups: 99 } }); });
  expect(screen.getByText("1 matching article")).toBeInTheDocument();
  expect(screen.queryByText("99 matching articles")).not.toBeInTheDocument();
});

test("count errors remain explicit and retry performs a read without applying the draft", async () => {
  mocked.fetchPage.mockRejectedValueOnce(new Error("offline"));
  mocked.fetchPage.mockResolvedValueOnce({ librarySearch: { totalGroups: 3 } });
  const apply = vi.fn();
  render(<AccountLibraryFilters {...props} onApply={apply} />);
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  await screen.findByText("3 matching articles");
  expect(mocked.fetchPage).toHaveBeenCalledTimes(2);
  expect(apply).not.toHaveBeenCalled();
});

test("paused or unavailable material cannot trigger a preview or apply", async () => {
  mocked.material.currentLanguageAllowed = false;
  const { rerender } = render(<AccountLibraryFilters {...props} />);
  expect(screen.getByRole("button", { name: "Show results" })).toBeDisabled();
  expect(mocked.fetchPage).not.toHaveBeenCalled();
  mocked.material.currentLanguageAllowed = true;
  mocked.fetchPage.mockResolvedValue({ librarySearch: { totalGroups: 0 } });
  rerender(<AccountLibraryFilters {...props} />);
  await screen.findByText("0 matching articles");
  expect(screen.getByRole("button", { name: "Show results" })).toBeEnabled();
});

test("empty query previews the current filter and exposes loading, failure and retry", async () => {
  let reject!: (cause: Error) => void;
  mocked.fetchPage.mockImplementationOnce(()=>new Promise((_resolve,fail)=>{reject=fail;}));
  mocked.fetchPage.mockResolvedValueOnce({librarySearch:{totalGroups:14449}});
  render(<AccountLibraryFilters {...props} query="" />);
  expect(screen.queryByText("Enter a word to search")).not.toBeInTheDocument();
  await waitFor(()=>expect(mocked.fetchPage).toHaveBeenCalledTimes(1));
  expect(mocked.fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({query:"",libraryScope:{dictionaryIds:null,filters:{parts:[],article:null}}}));
  expect(screen.queryByText(/matching articles/)).not.toBeInTheDocument();
  await act(async()=>{reject(new Error("offline"));});
  fireEvent.click(await screen.findByRole("button",{name:"Try again"}));
  await screen.findByText("14,449 matching articles");
});
