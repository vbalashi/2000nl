import { afterEach, expect, test, vi } from "vitest";
import { readDictionaryCategory, readMoreDictionaryContext, hydrateDictionaryWordResults, countDictionaryCategory } from "@/lib/platform/dictionaryCategorySearch";

import { fetchPlatformV2LibraryGroups } from "@/lib/platform/platformV2LibraryClient";
import { multiSenseBankGroup } from "./platformV2LibraryFixture";
vi.mock("@/lib/platform/platformV2Http", () => ({ authenticatedJsonHeaders: vi.fn().mockResolvedValue({"content-type":"application/json"}) }));
vi.mock("@/lib/platform/platformFetchWithTimeout", () => ({ platformFetchWithTimeout: (...args: unknown[]) => fetch(...args as Parameters<typeof fetch>) }));
vi.mock("@/lib/platform/platformV2LibraryClient", () => ({ fetchPlatformV2LibraryGroups: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
const scope = () => ({ query: "bank", languageCode: "nl", dictionaryId: null, userId: "reader", signal: new AbortController().signal });
const hit = (id: string, path = "example[0]") => ({ resultKey: `${id}:${path}`, headwordGroupId:multiSenseBankGroup.headwordGroupId, entry: {id,headword:"bank"},field:{sourcePath:path,text:"de bank"} });
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
  vi.mocked(fetchPlatformV2LibraryGroups).mockResolvedValue([multiSenseBankGroup]);
  const ids=multiSenseBankGroup.entries.map(entry=>entry.kind==='sense-card'?entry.entryId:entry.crossReferenceId);
  const results=await hydrateDictionaryWordResults(scope(),ids.map(id=>hit(id)));
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({headwordGroupId:multiSenseBankGroup.headwordGroupId,meaningCount:2,headword:'bank'});
  expect(results[0].group).toBe(multiSenseBankGroup);
  expect(fetchPlatformV2LibraryGroups).toHaveBeenCalledWith(expect.objectContaining({expectedUserId:'reader',entryIds:[ids[0]]}));
});

test.each(["headwords","alphabetical"] as const)("%s count uses one server count without draining or hydrating articles",async(category)=>{
 const read=vi.fn().mockResolvedValue(new Response(JSON.stringify({groups:[{id:category,items:[hit('one')],total:1000,wordGroupCount:250,page:{hasMore:true,nextCursor:'next'}}]})));vi.stubGlobal('fetch',read);
 expect(await countDictionaryCategory(scope(),category)).toBe(250);expect(read).toHaveBeenCalledOnce();expect(fetchPlatformV2LibraryGroups).not.toHaveBeenCalled();
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
 expect(read).toHaveBeenCalledTimes(1);expect(fetchPlatformV2LibraryGroups).not.toHaveBeenCalled();
});

test('Words first page is independent of total matches and never drains the cursor',async()=>{
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({groups:[{id:'headwords',total:100000,wordGroupCount:50000,
  items:[hit('one')],page:{hasMore:true,nextCursor:'next'}}]})));vi.stubGlobal('fetch',fetch);
 const result=await readDictionaryCategory(scope(),'headwords',vi.fn());
 expect(fetch).toHaveBeenCalledOnce();expect(result.page.hasMore).toBe(true);
 expect(JSON.parse(fetch.mock.calls[0][1].body).limit).toBe(25);
});
test('sibling meanings split across pages reuse canonical article and retain a matching representative',async()=>{
 vi.mocked(fetchPlatformV2LibraryGroups).mockResolvedValue([multiSenseBankGroup]);
 const first=await hydrateDictionaryWordResults(scope(),[hit('entry-bank-furniture')]);
 const continued=await hydrateDictionaryWordResults(scope(),[hit('entry-bank-furniture'),hit('entry-bank-finance')],first);
 expect(fetchPlatformV2LibraryGroups).toHaveBeenCalledOnce();
 expect(continued).toHaveLength(1);expect(continued[0].selectedEntryId).toBe('entry-bank-furniture');
 expect(continued[0].group.entries).toHaveLength(2);
});
test('canonical IDs, not homograph spellings, deduplicate bounded network batches',async()=>{
 const groups=Array.from({length:51},(_,i)=>({...multiSenseBankGroup,headwordGroupId:`group-${i}`,
  entries:[{...multiSenseBankGroup.entries[0],entryId:`entry-${i}`}]}));
 vi.mocked(fetchPlatformV2LibraryGroups).mockImplementation(async input=>groups.filter(g=>input.entryIds.includes(g.entries[0].entryId)));
 const hits=groups.flatMap(g=>[0,1].map(()=>({...hit(g.entries[0].entryId),headwordGroupId:g.headwordGroupId})));
 const result=await hydrateDictionaryWordResults(scope(),hits);
 expect(result).toHaveLength(51);
 const batches=vi.mocked(fetchPlatformV2LibraryGroups).mock.calls.map(c=>c[0].entryIds);
 expect(batches.map(b=>b.length)).toEqual([25,25,1]);expect(new Set(batches.flat()).size).toBe(51);
});
test('a changed canonical identity cannot be joined to stale search hits',async()=>{
 vi.mocked(fetchPlatformV2LibraryGroups).mockResolvedValue([{...multiSenseBankGroup,headwordGroupId:'changed'}]);
 await expect(hydrateDictionaryWordResults(scope(),[hit('entry-bank-furniture')])).rejects.toThrow('invalid_cursor');
});
test('a newly matched meaning absent from the cached article invalidates continuation',async()=>{
 vi.mocked(fetchPlatformV2LibraryGroups).mockResolvedValue([multiSenseBankGroup]);
 const first=await hydrateDictionaryWordResults(scope(),[hit('entry-bank-furniture')]);
 await expect(hydrateDictionaryWordResults(scope(),[hit('entry-bank-furniture'),hit('new-meaning')],first)).rejects.toThrow('invalid_cursor');
 expect(fetchPlatformV2LibraryGroups).toHaveBeenCalledOnce();
});
test('an access-denied category response clears authority even without a JSON body',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('Unavailable',{status:403})));
 await expect(readDictionaryCategory(scope(),'headwords',vi.fn())).rejects.toThrow('dictionary_search_access_changed');
});
