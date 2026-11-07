import {beforeEach,test,expect,vi} from 'vitest';
const {headers,fetcher}=vi.hoisted(()=>({headers:vi.fn(),fetcher:vi.fn()}));
vi.mock('@/lib/platform/platformV2Http',()=>({platformV2AuthenticatedJsonHeaders:headers}));
vi.mock('@/lib/platform/platformFetchWithTimeout',()=>({platformFetchWithTimeout:fetcher}));
import {confirmCollectionComposition} from '@/lib/collections/sharing/collectionCompositionClient';
const id='11111111-1111-4111-8111-111111111111';
beforeEach(()=>{vi.clearAllMocks();headers.mockResolvedValue({});});
test('retry retains the explicitly confirmed plan identity',async()=>{
 fetcher.mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce(Response.json({planId:id,collectionId:id,status:'committed'}));
 await expect(confirmCollectionComposition(id,id,new AbortController().signal)).rejects.toThrow('offline');
 expect((await confirmCollectionComposition(id,id,new AbortController().signal)).status).toBe('committed');
 expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
});
test('account change rejects a completed response',async()=>{
 headers.mockResolvedValueOnce({}).mockRejectedValueOnce(Error('account changed'));
 fetcher.mockResolvedValue(Response.json({planId:id,collectionId:id,status:'committed'}));
 await expect(confirmCollectionComposition(id,id,new AbortController().signal)).rejects.toThrow('account changed');
});
