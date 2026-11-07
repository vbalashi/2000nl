import {beforeEach,test,expect,vi} from 'vitest';
const {headers,fetcher}=vi.hoisted(()=>({headers:vi.fn(),fetcher:vi.fn()}));
vi.mock('@/lib/platform/platformV2Http',()=>({platformV2AuthenticatedJsonHeaders:headers}));
vi.mock('@/lib/platform/platformFetchWithTimeout',()=>({platformFetchWithTimeout:fetcher}));
import {createLabelShareIntent,executeLabelShareIntent} from '@/lib/collections/sharing/labelSharingClient';
const id='11111111-1111-4111-8111-111111111111';
const intent=()=>createLabelShareIntent(id,{operationId:id,action:'close',labelId:id,expectedRevision:1});
beforeEach(()=>{vi.clearAllMocks();headers.mockResolvedValue({});});
test('lost responses remain uncertain and retries preserve operation identity',async()=>{
 const stable=intent();fetcher.mockRejectedValue(Error('offline'));
 expect(await executeLabelShareIntent(stable,new AbortController().signal)).toBeNull();
 expect(Object.isFrozen(stable.command)).toBe(true);
 expect(JSON.parse(fetcher.mock.calls[0][1].body).operationId).toBe(id);
 expect(headers).toHaveBeenCalledTimes(2);
});
test('account changes after the request reject the result',async()=>{
 headers.mockResolvedValueOnce({}).mockRejectedValueOnce(Error('account changed'));
 fetcher.mockResolvedValue(Response.json({operationId:id,status:'committed',action:'close',result:{labelId:id,isOpen:false,revision:2,invitationCode:null,subscriberCount:0}}));
 await expect(executeLabelShareIntent(intent(),new AbortController().signal)).rejects.toThrow('account changed');
});

test('preserves terminal revision rejections for UI conflict handling',async()=>{
 const rejected={operationId:id,status:'rejected',action:'close',reason:'share_revision_conflict'};
 fetcher.mockResolvedValue(Response.json(rejected));
 expect(await executeLabelShareIntent(intent(),new AbortController().signal)).toEqual(rejected);
});

test('state reads reject a response for another label',async()=>{
 const {readLabelShareState}=await import('@/lib/collections/sharing/labelSharingClient');
 fetcher.mockResolvedValue(Response.json({labelId:'22222222-2222-4222-8222-222222222222',isOpen:false,revision:0,invitationCode:null,subscriberCount:0}));
 await expect(readLabelShareState(id,id,new AbortController().signal)).rejects.toThrow('label_sharing_state_unavailable');
});
