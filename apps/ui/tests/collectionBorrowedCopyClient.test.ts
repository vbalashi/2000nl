import {beforeEach,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({headers:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/platform/platformV2Http',()=>({platformV2AuthenticatedJsonHeaders:mock.headers}));
vi.mock('@/lib/platform/platformFetchWithTimeout',()=>({platformFetchWithTimeout:mock.fetch}));
import {previewCollectionBorrowedCopy,submitCollectionBorrowedCopy,reconcileCollectionBorrowedCopy} from '@/lib/collections/sharing/collectionBorrowedCopyClient';
const command={operationId:'11111111-1111-4111-8111-111111111111',listId:'22222222-2222-4222-8222-222222222222',expectedRevision:'a'.repeat(64)};
beforeEach(()=>{vi.clearAllMocks();mock.headers.mockResolvedValue({});});
it('rejects completion metadata for a different collection',async()=>{
 mock.fetch.mockResolvedValue(Response.json({operationId:command.operationId,status:'completed',listId:command.operationId,copiedCount:1}));
 expect(await submitCollectionBorrowedCopy('owner',command,new AbortController().signal)).toBeNull();
});
it('keeps a transport failure uncertain and checks it through a read-only receipt request',async()=>{
 mock.fetch.mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce(Response.json({operationId:command.operationId,status:'unknown'}));
 expect(await submitCollectionBorrowedCopy('owner',command,new AbortController().signal)).toBeNull();
 expect(await reconcileCollectionBorrowedCopy('owner',command,new AbortController().signal)).toEqual({operationId:command.operationId,status:'unknown'});
 expect(mock.fetch.mock.calls[0][1]).toMatchObject({method:'POST',body:JSON.stringify(command)});
 expect(mock.fetch.mock.calls[1][1]).toMatchObject({method:'GET'});
 expect(mock.fetch.mock.calls[1][1].body).toBeUndefined();
});
it('refuses a stale account response even when its collection preview is valid',async()=>{
 mock.fetch.mockResolvedValue(Response.json({listId:command.listId,revision:command.expectedRevision,canCopy:true,borrowedCount:1}));
 mock.headers.mockResolvedValueOnce({}).mockRejectedValueOnce(Error('account_changed'));
 await expect(previewCollectionBorrowedCopy('owner',command.listId,new AbortController().signal)).rejects.toThrow('account_changed');
});
it('distinguishes a documented revision rejection from an unverified server failure',async()=>{
 mock.fetch.mockResolvedValueOnce(Response.json({error:'copy_collection_changed'},{status:409})).mockResolvedValueOnce(Response.json({error:'unexpected'},{status:500}));
 expect(await submitCollectionBorrowedCopy('owner',command,new AbortController().signal)).toEqual({status:'rejected',reason:'copy_collection_changed'});
 expect(await submitCollectionBorrowedCopy('owner',command,new AbortController().signal)).toBeNull();
});
