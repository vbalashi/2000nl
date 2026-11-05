import { afterEach, expect, test, vi } from "vitest";
import { readDictionaryCategory, hydrateDictionaryWordResults } from "@/lib/platform/dictionaryCategorySearch";
import { fetchPlatformV2LibraryGroup } from "@/lib/platform/platformV2LibraryClient";
import { multiSenseBankGroup } from "./platformV2LibraryFixture";
vi.mock("@/lib/platform/platformV2Http", () => ({ authenticatedJsonHeaders: vi.fn().mockResolvedValue({"content-type":"application/json"}) }));
vi.mock("@/lib/platform/platformFetchWithTimeout", () => ({ platformFetchWithTimeout: (...args: unknown[]) => fetch(...args as Parameters<typeof fetch>) }));
vi.mock("@/lib/platform/platformV2LibraryClient", () => ({ fetchPlatformV2LibraryGroup: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
const scope = () => ({ query: "bank", languageCode: "nl", dictionaryId: null, userId: "reader", signal: new AbortController().signal });
const hit = (id: string, path = "example[0]") => ({ resultKey: `${id}:${path}`, entry: {id,headword:"bank"},field:{sourcePath:path,text:"de bank"} });
const page = (items: ReturnType<typeof hit>[], cursor: string | null, id="examples") => new Response(JSON.stringify({groups:[{id,items,total:null,page:{hasMore:Boolean(cursor),nextCursor:cursor}}]}));
test("automatically drains all context pages, retains distinct examples and removes cursor overlap", async () => {
  const read = vi.fn().mockResolvedValueOnce(page([hit("one")],"next"))
    .mockResolvedValueOnce(page([hit("one"),hit("one","example[1]"),hit("two")],null));
  vi.stubGlobal("fetch",read);
  const progress=vi.fn();
  const result=await readDictionaryCategory(scope(),"examples",progress);
  expect(result.items).toHaveLength(3);
  expect(progress.mock.calls.map(call=>call[1])).toEqual([false,true]);
  expect(JSON.parse(read.mock.calls[1][1].body)).toMatchObject({group:"examples",cursor:"next",limit:100});
});
test("does not traverse the rest of the dictionary from its centered alphabetical window", async () => {
  const read=vi.fn().mockResolvedValue(page([hit("one")],"later","alphabetical"));vi.stubGlobal("fetch",read);
  await readDictionaryCategory(scope(),"alphabetical",vi.fn());
  expect(read).toHaveBeenCalledOnce();
  expect(JSON.parse(read.mock.calls[0][1].body).limit).toBe(31);
});
test("rejects a repeating cursor rather than looping or claiming a complete result", async () => {
  vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>page([hit("one")],"same")));
  await expect(readDictionaryCategory(scope(),"examples",vi.fn())).rejects.toThrow("cursor_did_not_advance");
});
test("a cancelled query never publishes its late page", async () => {
  const controller=new AbortController();
  vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>{controller.abort();return page([hit("one")],null);}));
  const progress=vi.fn();
  await expect(readDictionaryCategory({...scope(),signal:controller.signal},"definitions",progress)).rejects.toThrow();
  expect(progress).not.toHaveBeenCalled();
});
test("server failure preserves partial progress and does not pretend to have all matches", async () => {
  vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(page([hit("one")],"next")).mockResolvedValueOnce(new Response('{}',{status:500})));
  const progress=vi.fn();
  await expect(readDictionaryCategory(scope(),"examples",progress)).rejects.toThrow("search_failed");
  expect(progress).toHaveBeenCalledOnce();expect(progress.mock.calls[0][1]).toBe(false);
});
test("builds the existing Library article rows, collapsing sibling senses without inventing metadata", async () => {
  vi.mocked(fetchPlatformV2LibraryGroup).mockResolvedValue(multiSenseBankGroup);
  const ids=multiSenseBankGroup.entries.map(entry=>entry.kind==='sense-card'?entry.entryId:entry.crossReferenceId);
  const results=await hydrateDictionaryWordResults(scope(),ids.map(id=>hit(id)));
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({headwordGroupId:multiSenseBankGroup.headwordGroupId,meaningCount:2,headword:'bank'});
  expect(results[0].group).toBe(multiSenseBankGroup);
  expect(fetchPlatformV2LibraryGroup).toHaveBeenCalledWith(expect.objectContaining({expectedUserId:'reader',translationTargetLanguageCode:null}));
});
