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
