import { beforeEach,expect,test,vi } from 'vitest';
const mock=vi.hoisted(()=>({headers:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/platform/platformV2Http',()=>({platformV2AuthenticatedJsonHeaders:mock.headers}));
vi.mock('@/lib/platform/platformFetchWithTimeout',()=>({platformFetchWithTimeout:mock.fetch}));
import { readReceivedCatalog } from '@/lib/collections/sharing/receivedCatalogClient';
import { parseReceivedCatalogQuery,parseReceivedCatalogPage } from '@/lib/collections/sharing/receivedCatalogContract';
const viewer='75600000-0000-4000-8000-000000000002',id='75600000-0000-4000-8000-000000000003';
const row={id,name:'Lesson',createdAt:'2026-01-01T00:00:00Z',addedAt:'2026-01-02T00:00:00Z',ownerUserId:'75600000-0000-4000-8000-000000000001',role:'viewer',itemCount:1,labelIds:[]};
const page={revision:0,collections:[row],nextCursor:null},query=parseReceivedCatalogQuery({})!;
beforeEach(()=>{vi.resetAllMocks();mock.headers.mockResolvedValue({authorization:'Bearer test'});mock.fetch.mockResolvedValue(Response.json(page));});
test('queries exact scope without caching and verifies the account before returning',async()=>{
 expect(await readReceivedCatalog(viewer,query,new AbortController().signal)).toEqual(page);
 expect(mock.headers).toHaveBeenCalledTimes(2);expect(mock.fetch).toHaveBeenCalledWith(expect.stringContaining('/received?'),expect.objectContaining({cache:'no-store',credentials:'same-origin'}));
});
test('account switch discards a successful old-account page',async()=>{
 mock.headers.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('auth_account_changed'));
 await expect(readReceivedCatalog(viewer,query,new AbortController().signal)).rejects.toThrow('auth_account_changed');
});
test('abort during response parsing discards a late result',async()=>{
 const controller=new AbortController();mock.fetch.mockResolvedValueOnce({ok:true,json:async()=>{controller.abort();return page;}});
 await expect(readReceivedCatalog(viewer,query,controller.signal)).rejects.toThrow('Aborted');
});
test('failed read is not an empty catalog and does not expose backend diagnostics',async()=>{
 mock.fetch.mockResolvedValueOnce(new Response('sensitive server detail',{status:503}));await expect(readReceivedCatalog(viewer,query,new AbortController().signal)).rejects.toThrow('received_catalog_unavailable');
});
test.each([{sort:null},{query:null},{limit:null},{sort:['name']},{scope:['all']},{query:'x'.repeat(101)},{limit:0},{cursor:{id,key:'x',scope:'secret'}},{userId:viewer}])('invalid query %# is rejected before network',async value=>{
 expect(parseReceivedCatalogQuery(value)).toBeNull();
 await expect(readReceivedCatalog(viewer,value as never,new AbortController().signal)).rejects.toThrow('invalid_catalog_request');expect(mock.fetch).not.toHaveBeenCalled();
});
test('response guard rejects duplicates, unknown owner material and incomplete-page cursors',()=>{
 expect(parseReceivedCatalogPage({...page,collections:[row,row]},50,viewer)).toBeNull();
 expect(parseReceivedCatalogPage({...page,collections:[{...row,labelIds:[id,id]}]},50,viewer)).toBeNull();
 expect(parseReceivedCatalogPage({...page,nextCursor:{id,key:'lesson',scope:'a'.repeat(64)}},50,viewer)).toBeNull();
});
