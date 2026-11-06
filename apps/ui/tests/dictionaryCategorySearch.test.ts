import { afterEach, expect, test, vi } from "vitest";
import { readDictionaryCategory, readMoreDictionaryContext, hydrateDictionaryWordResults, countDictionaryCategory } from "@/lib/platform/dictionaryCategorySearch";

import { fetchPlatformV2LibraryGroup } from "@/lib/platform/platformV2LibraryClient";
import { multiSenseBankGroup } from "./platformV2LibraryFixture";
vi.mock("@/lib/platform/platformV2Http", () => ({ authenticatedJsonHeaders: vi.fn().mockResolvedValue({"content-type":"application/json"}) }));
vi.mock("@/lib/platform/platformFetchWithTimeout", () => ({ platformFetchWithTimeout: (...args: unknown[]) => fetch(...args as Parameters<typeof fetch>) }));
vi.mock("@/lib/platform/platformV2LibraryClient", () => ({ fetchPlatformV2LibraryGroup: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
const scope = () => ({ query: "bank", languageCode: "nl", dictionaryId: null, userId: "reader", signal: new AbortController().signal });
const hit = (id: string, path = "example[0]") => ({ resultKey: `${id}:${path}`, entry: {id,headword:"bank"},field:{sourcePath:path,text:"de bank"} });
const page = (items: ReturnType<typeof hit>[], cursor: string | null, id="examples") => new Response(JSON.stringify({groups:[{id,items,total:null,page:{hasMore:Boolean(cursor),nextCursor:cursor}}]}));
test("reads one context page, then appends one explicitly requested page without overlap", async () => {
  const read = vi.fn().mockResolvedValueOnce(page([hit("one")],"next"))
    .mockResolvedValueOnce(page([hit("one"),hit("one","example[1]"),hit("two")],null));
  vi.stubGlobal("fetch",read);
  const progress=vi.fn();
  const first=await readDictionaryCategory(scope(),"examples",progress);
  expect(read).toHaveBeenCalledTimes(1);
  const result=await readMoreDictionaryContext(scope(),first);
  expect(result.items).toHaveLength(3);
  expect(progress.mock.calls.map(call=>call[1])).toEqual([true]);
  expect(JSON.parse(read.mock.calls[1][1].body)).toMatchObject({group:"examples",cursor:"next",limit:50});
});
test("does not traverse the rest of the dictionary from its centered alphabetical window", async () => {
  const read=vi.fn().mockResolvedValue(page([hit("one")],"later","alphabetical"));vi.stubGlobal("fetch",read);
  await readDictionaryCategory(scope(),"alphabetical",vi.fn());
  expect(read).toHaveBeenCalledOnce();
  expect(JSON.parse(read.mock.calls[0][1].body).limit).toBe(31);
});
test("rejects a repeating cursor rather than looping or claiming a complete result", async () => {
  vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>page([hit("one")],"same")));
  const first=await readDictionaryCategory(scope(),"examples",vi.fn());
  await expect(readMoreDictionaryContext(scope(),first)).rejects.toThrow("cursor_did_not_advance");
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
  const first=await readDictionaryCategory(scope(),"examples",progress);
  await expect(readMoreDictionaryContext(scope(),first)).rejects.toThrow("search_failed");
  expect(first.items).toHaveLength(1);
  expect(progress).toHaveBeenCalledOnce();expect(progress.mock.calls[0][1]).toBe(true);
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

test.each(["headwords","alphabetical"] as const)("%s count uses one server count without draining or hydrating articles",async(category)=>{
 const read=vi.fn().mockResolvedValue(new Response(JSON.stringify({groups:[{id:category,items:[hit('one')],total:1000,wordGroupCount:250,page:{hasMore:true,nextCursor:'next'}}]})));vi.stubGlobal('fetch',read);
 expect(await countDictionaryCategory(scope(),category)).toBe(250);expect(read).toHaveBeenCalledOnce();expect(fetchPlatformV2LibraryGroup).not.toHaveBeenCalled();
});
test("opening context search returns the first page without fetching unseen matches", async () => {
 const read=vi.fn().mockResolvedValueOnce(page([hit("one")],"next")).mockResolvedValueOnce(page([hit("two")],null));
 vi.stubGlobal("fetch",read);
 const result=await readDictionaryCategory({...scope(),query:"fiets"},"examples",vi.fn());
 expect(read).toHaveBeenCalledTimes(1);
 expect(result.page.hasMore).toBe(true);

});

test.each(['headwords','alphabetical'] as const)('exact %s draft counts reuse one metadata read without hydration',async category=>{
 const read=vi.fn().mockResolvedValue(new Response(JSON.stringify({groups:[{id:category,items:[hit('one')],total:115,wordGroupCount:73,page:{hasMore:true,nextCursor:'unused'}}]})));vi.stubGlobal('fetch',read);
 const {readDictionaryCategoryCounts}=await import('@/lib/platform/dictionaryCategorySearch');
 expect(await readDictionaryCategoryCounts(scope(),category)).toEqual({totalGroups:73,totalMeanings:115});
 expect(read).toHaveBeenCalledTimes(1);expect(fetchPlatformV2LibraryGroup).not.toHaveBeenCalled();
});
