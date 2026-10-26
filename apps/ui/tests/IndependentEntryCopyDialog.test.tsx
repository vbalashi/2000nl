import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  submit: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("@/lib/platform/independentEntryCopyClient", () => ({
  previewEntryCopy: mocks.preview,
  submitEntryCopy: mocks.submit,
  reconcileEntryCopy: mocks.reconcile,
}));
import { IndependentEntryCopyDialog } from "@/components/training/library-v2/IndependentEntryCopyDialog";
const entryId = "75500000-0000-4000-8000-000000000001";
const preview = {
  sourceEntryId: entryId,
  headword: "woord",
  languageCode: "nl",
  revision: "a".repeat(64),
  sourceDictionaryName: "Dutch Old Dictionary",
  meaningCount: 2,
};
const completed = {
  status: "completed",
  entryId: "75500000-0000-4000-8000-000000000002",
  dictionaryId: "75500000-0000-4000-8000-000000000003",
  headword: "woord",
  languageCode: "nl",
};
const props = {
  entryId,
  headword: "woord",
  dictionaryName: "Dutch Old Dictionary",
  contentLanguageCode: "nl",
  userId: "owner",
  language: "en" as const,
  onClose: vi.fn(),
  onOpen: vi.fn(),
  onReviewSource: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.preview.mockResolvedValue(preview);
});
test("cancel is read-only; the source dictionary is visible before confirmation", async () => {
  render(<IndependentEntryCopyDialog {...props} />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Copy" })).toBeEnabled(),
  );
  expect(
    screen.getByText(/Dutch Old Dictionary → My dictionary/),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(props.onClose).toHaveBeenCalledOnce();
  expect(mocks.submit).not.toHaveBeenCalled();
});
test("success stays on original until explicit Open copy", async () => {
  mocks.submit.mockResolvedValue(completed);
  render(<IndependentEntryCopyDialog {...props} />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Copy" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await screen.findByText("Copy created");
  expect(props.onOpen).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Open copy" }));
  expect(props.onOpen).toHaveBeenCalledWith({
    entryId: completed.entryId,
    dictionaryId: completed.dictionaryId,
    headword: "woord",
    contentLanguageCode: "nl",
  });
});
test("uncertain intent survives reopening and only reads the owner receipt", async () => {
  mocks.submit.mockResolvedValue({ status: "uncertain" });
  const view = render(<IndependentEntryCopyDialog {...props} />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Copy" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await screen.findByRole("button", { name: "Check result" });
  const operation = mocks.submit.mock.calls[0][0].operationId;
  view.unmount();
  mocks.reconcile.mockResolvedValue({ ...completed, operationId: operation });
  render(<IndependentEntryCopyDialog {...props} />);
  await screen.findByText("Copy created");
  expect(mocks.reconcile).toHaveBeenCalledWith(operation, "owner");
  expect(mocks.submit).toHaveBeenCalledOnce();
});

test("recovered copy opens with committed metadata even after the source was renamed", async () => {
  sessionStorage.setItem(
    `2000nl:entry-copy:owner:${entryId}`,
    JSON.stringify({
      operationId: completed.entryId,
      sourceEntryId: entryId,
      expectedRevision: preview.revision,
    }),
  );
  mocks.reconcile.mockResolvedValue({
    ...completed,
    operationId: completed.entryId,
  });
  render(
    <IndependentEntryCopyDialog
      {...props}
      headword="ˈrenamed·source"
      contentLanguageCode="en"
    />,
  );
  await screen.findByText("Copy created");
  fireEvent.click(screen.getByRole("button", { name: "Open copy" }));
  expect(props.onOpen).toHaveBeenCalledWith({
    entryId: completed.entryId,
    dictionaryId: completed.dictionaryId,
    headword: "woord",
    contentLanguageCode: "nl",
  });
});
test("a changed source returns to the article for an authoritative refresh", async () => {
  mocks.submit.mockResolvedValue({ status: "changed" });
  render(<IndependentEntryCopyDialog {...props} />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Copy" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Review current version" }),
  );
  expect(props.onReviewSource).toHaveBeenCalledOnce();
  expect(mocks.preview).toHaveBeenCalledOnce();
});

test("a rejected retry retains the original uncertain intent for receipt recovery",async()=>{
 mocks.submit.mockResolvedValueOnce({status:"uncertain"}).mockResolvedValueOnce({status:"rejected"});
 mocks.reconcile.mockResolvedValueOnce({status:"unknown"});
 const view=render(<IndependentEntryCopyDialog {...props}/>);
 await waitFor(()=>expect(screen.getByRole("button",{name:"Copy"})).toBeEnabled());
 fireEvent.click(screen.getByRole("button",{name:"Copy"}));
 fireEvent.click(await screen.findByRole("button",{name:"Check result"}));
 await waitFor(()=>expect(screen.getByRole("button",{name:"Copy"})).toBeEnabled());
 fireEvent.click(screen.getByRole("button",{name:"Copy"}));
 await waitFor(()=>expect(mocks.submit).toHaveBeenCalledTimes(2));
 await screen.findByRole("alert");
 const operationId=mocks.submit.mock.calls[0][0].operationId;
 expect(mocks.submit.mock.calls[1][0].operationId).toBe(operationId);
 expect(JSON.parse(sessionStorage.getItem(`2000nl:entry-copy:owner:${entryId}`)!)).toMatchObject({operationId});
 view.unmount();mocks.reconcile.mockResolvedValueOnce({...completed,operationId});
 render(<IndependentEntryCopyDialog {...props}/>);await screen.findByText("Copy created");
 expect(mocks.submit).toHaveBeenCalledTimes(2);
});
