import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({headers:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/platform/platformV2Http',()=>({platformV2AuthenticatedJsonHeaders:mock.headers}));
vi.mock('@/lib/platform/platformFetchWithTimeout',()=>({platformFetchWithTimeout:mock.fetch}));
import {readCollectionShareManagement,readCollectionShareForward} from '@/lib/collections/sharing/shareManagementClient';
const collectionId='75600000-0000-4000-8000-000000000001',code='A'.repeat(26);
const owner={collectionId,isOpen:true,revision:1,invitationCode:code,subscriberCount:2},forward={collectionId,canForward:true,invitationCode:code};
beforeEach(()=>{vi.resetAllMocks();mock.headers.mockResolvedValue({authorization:'Bearer test'});});
test.each([['owner',readCollectionShareManagement,owner,''],['forward',readCollectionShareForward,forward,'/forward']] as const)('%s reads bind account and do not place secrets in the URL',async(_mode,read,data,suffix)=>{
 mock.fetch.mockResolvedValue(Response.json(data));expect(await read('reader',collectionId,new AbortController().signal)).toEqual(data);
 expect(mock.fetch).toHaveBeenCalledWith(`/api/library/collections/${collectionId}/sharing${suffix}`,expect.objectContaining({cache:'no-store',credentials:'same-origin'}));expect(mock.headers).toHaveBeenCalledTimes(2);expect(mock.fetch.mock.calls[0][0]).not.toContain(code);
});
test('account switch cannot deliver owner invitation text',async()=>{
 mock.fetch.mockResolvedValue(Response.json(owner));mock.headers.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('auth_account_changed'));
 await expect(readCollectionShareManagement('reader',collectionId,new AbortController().signal)).rejects.toThrow('auth_account_changed');
});
test('abort during parsing discards a late successful owner response',async()=>{
 const controller=new AbortController();mock.fetch.mockResolvedValue({ok:true,json:async()=>{controller.abort();return owner;}});
 await expect(readCollectionShareManagement('reader',collectionId,controller.signal)).rejects.toThrow('Aborted');
});
test('forward does not accept a fresh owner-shaped invitation projection',async()=>{
 mock.fetch.mockResolvedValue(Response.json(owner));await expect(readCollectionShareForward('reader',collectionId,new AbortController().signal)).rejects.toThrow('share_contract_invalid');
});
test('unavailable and network errors do not invent an inactive share or leak response text',async()=>{
 mock.fetch.mockResolvedValue(new Response('private detail',{status:404}));await expect(readCollectionShareManagement('reader',collectionId,new AbortController().signal)).rejects.toThrow('share_unavailable');
});
test('invalid collection target fails before authentication and network',async()=>{
 await expect(readCollectionShareManagement('reader','invalid',new AbortController().signal)).rejects.toThrow('invalid_share_request');expect(mock.headers).not.toHaveBeenCalled();expect(mock.fetch).not.toHaveBeenCalled();
});
