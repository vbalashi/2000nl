import {beforeEach, expect, test, vi} from 'vitest';
const mock=vi.hoisted(()=>({headers:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/platform/platformV2Http',()=>({platformV2AuthenticatedJsonHeaders:mock.headers}));
vi.mock('@/lib/platform/platformFetchWithTimeout',()=>({platformFetchWithTimeout:mock.fetch}));
import {createShareIntent,executeShareIntent,reconcileShareIntent,previewCollectionShare} from '@/lib/collections/sharing/shareCommandClient';
const operationId='75600000-0000-4000-8000-000000000001';
const collectionId='75600000-0000-4000-8000-000000000002';
const command={operationId,action:'open' as const,collectionId,expectedRevision:0};
const receipt={operationId,status:'committed',action:'open',collectionId,available:true,role:'owner',isOpen:true,revision:1,invitationCode:'A'.repeat(26)};
const signal=()=>new AbortController().signal;
beforeEach(()=>{vi.resetAllMocks();mock.headers.mockResolvedValue({});});
test('captures an immutable intent before authentication yields and reuses exact payload',async()=>{
 const mutable={...command};const intent=createShareIntent('owner',mutable);
 mock.fetch.mockRejectedValueOnce(new Error('lost acknowledgement')).mockResolvedValueOnce(Response.json(receipt));
 const pending=executeShareIntent(intent,signal());mutable.expectedRevision=50;
 expect(await pending).toEqual({state:'uncertain'});
 expect(await executeShareIntent(intent,signal())).toEqual({state:'committed',receipt});
 expect(mock.fetch.mock.calls.map(c=>JSON.parse(c[1].body))).toEqual([command,command]);
 expect(Object.isFrozen(intent.command)).toBe(true);
});
test('unknown receipt stays uncertain and never issues a write',async()=>{
 mock.fetch.mockResolvedValue(Response.json({operationId,status:'unknown'}));
 expect(await reconcileShareIntent(createShareIntent('owner',command),signal())).toEqual({state:'uncertain'});
 expect(mock.fetch).toHaveBeenCalledTimes(1);
 expect(mock.fetch.mock.calls[0][0]).toBe('/api/library/collection-sharing/reconcile');
 expect(JSON.parse(mock.fetch.mock.calls[0][1].body)).toEqual(command);
});
test.each(['operationId','action','collectionId'])('rejects mismatched %s in a completed receipt',async field=>{
 mock.fetch.mockResolvedValue(Response.json({...receipt,[field]:field==='action'?'close':'75600000-0000-4000-8000-000000000099'}));
 expect(await reconcileShareIntent(createShareIntent('owner',command),signal())).toEqual({state:'uncertain'});
});
test.each([409,503,502])('HTTP %s cannot prove an earlier attempt did not commit',async status=>{
 mock.fetch.mockResolvedValue(new Response('secret error',{status}));
 expect(await executeShareIntent(createShareIntent('owner',command),signal())).toEqual({state:'uncertain'});
 expect(mock.fetch).toHaveBeenCalledTimes(1);
});
test('account switch discards a late owner code',async()=>{
 mock.fetch.mockResolvedValue(Response.json(receipt));mock.headers.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('auth_account_changed'));
 await expect(executeShareIntent(createShareIntent('owner',command),signal())).rejects.toThrow('auth_account_changed');
});
test('abort while parsing discards a committed response',async()=>{
 const controller=new AbortController();mock.fetch.mockResolvedValue({ok:true,json:async()=>{controller.abort();return receipt;}});
 await expect(executeShareIntent(createShareIntent('owner',command),controller.signal)).rejects.toThrow('Aborted');
});
test('preview uses body-only code and never accepts access',async()=>{
 const code='A'.repeat(26),preview={collectionId,name:'Lesson',entryCount:2,offeredRole:'viewer',role:null,alreadyAdded:false,samples:[]};
 mock.fetch.mockResolvedValue(Response.json(preview));
 expect(await previewCollectionShare('reader',code,signal())).toEqual(preview);
 expect(mock.fetch.mock.calls[0][0]).not.toContain(code);
 expect(JSON.parse(mock.fetch.mock.calls[0][1].body)).toEqual({code});
 expect(mock.fetch).toHaveBeenCalledTimes(1);
});
test('only a closed durable rejected receipt settles an owner intent; raw HTTP conflict stays uncertain',async()=>{
 const intent=createShareIntent('owner',command),rejected={operationId,status:'rejected',action:'open',collectionId,reason:'share_revision_conflict'};
 mock.fetch.mockResolvedValueOnce(Response.json({error:'share_revision_conflict'},{status:409})).mockResolvedValueOnce(Response.json(rejected));expect(await executeShareIntent(intent,signal())).toEqual({state:'uncertain'});expect(await reconcileShareIntent(intent,signal())).toEqual({state:'rejected',receipt:rejected});
});
test.each([{reason:['share_revision_conflict']},{reason:{error:'share_revision_conflict'}},{extra:'secret'},{action:'accept'}])('malformed terminal receipt does not abandon recovery %#',async invalid=>{
 mock.fetch.mockResolvedValue(Response.json({operationId,status:'rejected',action:'open',collectionId,reason:'share_revision_conflict',...invalid}));expect(await executeShareIntent(createShareIntent('owner',command),signal())).toEqual({state:'uncertain'});
});
