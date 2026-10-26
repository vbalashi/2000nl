import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({headers:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/platform/platformV2Http',()=>({platformV2AuthenticatedJsonHeaders:mock.headers}));
vi.mock('@/lib/platform/platformFetchWithTimeout',()=>({platformFetchWithTimeout:mock.fetch}));
import {readOwnedSharedCatalog,readSharingOverview} from '@/lib/collections/sharing/ownedCatalogClient';
import {parseOwnedCatalogPage,parseOwnedCatalogQuery,parseSharingOverview} from '@/lib/collections/sharing/ownedCatalogContract';
const user='75600000-0000-4000-8000-000000000001',id='75600000-0000-4000-8000-000000000002';
const row={id,name:'Lesson',createdAt:'2026-01-01T00:00:00Z',itemCount:1,subscriberCount:2},page={collections:[row],nextCursor:null},query=parseOwnedCatalogQuery({})!;
beforeEach(()=>{vi.resetAllMocks();mock.headers.mockResolvedValue({authorization:'Bearer test'});mock.fetch.mockResolvedValue(Response.json(page));});
test('owner page and overview check account after response, without caching',async()=>{
 expect(await readOwnedSharedCatalog(user,query,new AbortController().signal)).toEqual(page);
 expect(mock.headers).toHaveBeenCalledTimes(2);expect(mock.fetch).toHaveBeenCalledWith(expect.stringContaining('/owned?'),expect.objectContaining({cache:'no-store',credentials:'same-origin'}));
 mock.fetch.mockResolvedValueOnce(Response.json({sharedByMe:1,addedByMe:2}));expect(await readSharingOverview(user,new AbortController().signal)).toEqual({sharedByMe:1,addedByMe:2});
});
test('account switch and abort discard old owner results',async()=>{
 mock.headers.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('auth_account_changed'));
 await expect(readOwnedSharedCatalog(user,query,new AbortController().signal)).rejects.toThrow('auth_account_changed');
 const controller=new AbortController();mock.fetch.mockResolvedValueOnce({ok:true,json:async()=>{controller.abort();return page;}});
 await expect(readOwnedSharedCatalog(user,query,controller.signal)).rejects.toThrow('Aborted');
});
test('closed response guards reject injected codes, duplicate rows and malformed counts',()=>{
 expect(parseOwnedCatalogPage({...page,collections:[{...row,invitationCode:'secret'}]},50)).toBeNull();
 expect(parseOwnedCatalogPage({...page,collections:[row,row]},50)).toBeNull();
 expect(parseOwnedCatalogPage({...page,collections:[{...row,subscriberCount:-1}]},50)).toBeNull();
 expect(parseOwnedCatalogPage({...page,nextCursor:{id,key:'Lesson',scope:'a'.repeat(64)}},50)).toBeNull();
 expect(parseSharingOverview({sharedByMe:1,addedByMe:2,code:'secret'})).toBeNull();
});
test.each([{sort:null},{query:null},{sort:['recent']},{query:'x'.repeat(101)},{limit:0},{cursor:{id,key:'x',scope:'secret'}},{userId:user}])('invalid owner query %# never reaches the network',async value=>{
 expect(parseOwnedCatalogQuery(value)).toBeNull();
 await expect(readOwnedSharedCatalog(user,value as never,new AbortController().signal)).rejects.toThrow('invalid_catalog_request');expect(mock.fetch).not.toHaveBeenCalled();
});
