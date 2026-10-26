import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({headers:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/platform/platformV2Http',()=>({platformV2AuthenticatedJsonHeaders:mock.headers}));
vi.mock('@/lib/platform/platformFetchWithTimeout',()=>({platformFetchWithTimeout:mock.fetch}));
import {readTrainingCollectionPage,readTrainingCollectionReferences} from '@/lib/collections/sharing/readableTrainingCatalog';
const id='75600000-0000-4000-8000-000000000001',other='75600000-0000-4000-8000-000000000002',row={id,name:'Lesson',ownership:'received',availableItemCount:2};
beforeEach(()=>{vi.resetAllMocks();mock.headers.mockResolvedValue({});});
test('one page request never enumerates the rest of the catalog',async()=>{
 mock.fetch.mockResolvedValue(Response.json({collections:[row],nextCursor:null}));expect((await readTrainingCollectionPage('viewer','nl','lesson',null,new AbortController().signal)).collections).toEqual([row]);
 expect(mock.fetch).toHaveBeenCalledOnce();expect(mock.fetch.mock.calls[0][0]).toContain('limit=50');expect(mock.headers).toHaveBeenCalledTimes(2);
});
test('exact references reject unsolicited IDs and never follow a catalog cursor',async()=>{
 mock.fetch.mockResolvedValue(Response.json({collections:[{...row,id:other}]}));await expect(readTrainingCollectionReferences('viewer','nl',[id],new AbortController().signal)).rejects.toThrow('contract_invalid');expect(mock.fetch).toHaveBeenCalledOnce();expect(JSON.parse(mock.fetch.mock.calls[0][1].body).collectionIds).toEqual([id]);
});
test('account check after transport suppresses a previous-account result',async()=>{
 mock.headers.mockResolvedValueOnce({}).mockRejectedValueOnce(Error('account_changed'));mock.fetch.mockResolvedValue(Response.json({collections:[row],nextCursor:null}));await expect(readTrainingCollectionPage('viewer','nl','',null,new AbortController().signal)).rejects.toThrow('account_changed');
});
