import { beforeEach, expect, test, vi } from "vitest";
import { submitEntryCopy } from "@/lib/platform/independentEntryCopyClient";
const mocks = vi.hoisted(() => ({ headers: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/platform/platformV2Http", () => ({
  authenticatedJsonHeaders: mocks.headers,
}));
vi.mock("@/lib/platform/platformFetchWithTimeout", () => ({
  platformFetchWithTimeout: mocks.fetch,
}));
const command = {
  operationId: "75500000-0000-4000-8000-000000000001",
  sourceEntryId: "75500000-0000-4000-8000-000000000002",
  expectedRevision: "a".repeat(64),
};
const result = {
  operationId: command.operationId,
  status: "completed",
  entryId: "75500000-0000-4000-8000-000000000003",
  dictionaryId: "75500000-0000-4000-8000-000000000004",
  headword: "woord",
  languageCode: "nl",
};
const response = (value: unknown, status = 200) =>
  Response.json(value, { status });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.mockResolvedValue({ authorization: "test" });
});
test("a lost response reconciles once without issuing a second write", async () => {
  mocks.fetch
    .mockRejectedValueOnce(new TypeError("network"))
    .mockResolvedValueOnce(response(result));
  expect(await submitEntryCopy(command, "owner")).toEqual({
    status: "completed",
    entryId: result.entryId,
    dictionaryId: result.dictionaryId,
    headword: "woord",
    languageCode: "nl",
  });
  expect(mocks.fetch.mock.calls.map((call) => call[1].method ?? "GET")).toEqual(
    ["POST", "GET"],
  );
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual(command);
  expect(mocks.headers).toHaveBeenCalledWith("owner");
});
test("unknown, wrong-operation and failed receipts never claim success", async () => {
  for (const value of [
    { operationId: command.operationId, status: "unknown" },
    { ...result, operationId: command.sourceEntryId },
    null,
  ]) {
    mocks.fetch
      .mockResolvedValueOnce(response({}, 500))
      .mockResolvedValueOnce(response(value));
    expect(await submitEntryCopy(command, "owner")).toEqual({
      status: "uncertain",
    });
  }
});
test("source conflicts require review and never retry or copy automatically", async () => {
  mocks.fetch.mockResolvedValueOnce(
    response({ error: "copy_source_changed" }, 409),
  );
  expect(await submitEntryCopy(command, "owner")).toEqual({
    status: "changed",
  });
  expect(mocks.fetch).toHaveBeenCalledOnce();
});
