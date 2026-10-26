import { beforeEach, expect, test, vi } from "vitest";
import { archiveAuthorEntry } from "@/lib/platform/authorEntryArchiveClient";
const mocks = vi.hoisted(() => ({ headers: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/platform/platformV2Http", () => ({ authenticatedJsonHeaders: mocks.headers }));
vi.mock("@/lib/platform/platformFetchWithTimeout", () => ({ platformFetchWithTimeout: mocks.fetch }));
beforeEach(() => { vi.clearAllMocks(); mocks.headers.mockResolvedValue({authorization:"Bearer test"}); });
const response = (body: object, status = 200) => new Response(JSON.stringify(body), {status});
test("archives the exact entry with an account fence", async () => {
  mocks.fetch.mockResolvedValueOnce(response({ok:true,action:"delete-user-entry",entryId:"entry"}));
  expect(await archiveAuthorEntry("entry","user")).toBe("archived");
  expect(mocks.headers).toHaveBeenCalledWith("user");
  expect(mocks.fetch).toHaveBeenCalledOnce();
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({action:"delete-user-entry",entryId:"entry"});
});
test.each([true,false])("lost write response reconciles archived=%s with one read, never a replay", async archived => {
  mocks.fetch.mockRejectedValueOnce(new TypeError("network"));
  mocks.fetch.mockResolvedValueOnce(response({entryId:"entry",archived,archivedAt:archived ? "2026-10-25T00:00:00Z" : null,sourceVersion:2}));
  expect(await archiveAuthorEntry("entry","user")).toBe(archived ? "archived" : "rejected");
  expect(mocks.fetch.mock.calls.map(call => call[1].method)).toEqual(["POST","GET"]);
});
test("a failed or mismatched reconciliation stays uncertain",async()=>{
  mocks.fetch.mockRejectedValueOnce(new TypeError("network"));
  mocks.fetch.mockResolvedValueOnce(response({entryId:"other",archived:true,sourceVersion:2}));
  expect(await archiveAuthorEntry("entry","user")).toBe("uncertain");
});
test("a rejected mutation does not claim success or retry",async()=>{
  mocks.fetch.mockResolvedValueOnce(response({error:"not_owner"},403));
  expect(await archiveAuthorEntry("entry","user")).toBe("rejected");
  expect(mocks.fetch).toHaveBeenCalledOnce();
});
