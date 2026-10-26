import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({preview:vi.fn(),execute:vi.fn(),reconcile:vi.fn(),intent:vi.fn()}));
vi.mock('@/lib/collections/sharing/shareCommandClient',()=>({previewCollectionShare:mock.preview,executeShareIntent:mock.execute,reconcileShareIntent:mock.reconcile,createShareIntent:mock.intent}));
import {useShareInvitation} from '@/components/library/sharing/useShareInvitation';
const code='A'.repeat(26),collectionId='75600000-0000-4000-8000-000000000002';
const preview={collectionId,name:'Lesson',entryCount:2,offeredRole:'viewer',role:null,alreadyAdded:false,samples:[]};
function deferred(){let resolve!:(v:unknown)=>void;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}
beforeEach(()=>{vi.resetAllMocks();window.sessionStorage.clear();mock.preview.mockResolvedValue(preview);mock.intent.mockImplementation((userId,command)=>({userId,command}));});
test('preview never automatically subscribes, including already added',async()=>{
 mock.preview.mockResolvedValue({...preview,role:'viewer',alreadyAdded:true});
 const hook=renderHook(()=>useShareInvitation('reader',code));await waitFor(()=>expect(hook.result.current.state.status).toBe('ready'));
 expect(mock.execute).not.toHaveBeenCalled();expect(mock.intent).not.toHaveBeenCalled();
});
test('double click executes once and unknown reconciliation retains exact intent',async()=>{
 const pending=deferred();mock.execute.mockReturnValue(pending.promise);mock.reconcile.mockResolvedValue({state:'uncertain'});
 const hook=renderHook(()=>useShareInvitation('reader',code));await waitFor(()=>expect(hook.result.current.state.status).toBe('ready'));
 let write:Promise<void>;act(()=>{write=hook.result.current.accept();void hook.result.current.accept();});expect(mock.execute).toHaveBeenCalledTimes(1);
 await act(async()=>{pending.resolve({state:'uncertain'});await write;});
 const intent=mock.execute.mock.calls[0][0];await act(async()=>{await hook.result.current.refresh();await hook.result.current.accept();await hook.result.current.reconcile();});
 expect(hook.result.current.state.status).toBe('uncertain');expect(mock.execute).toHaveBeenCalledTimes(1);expect(mock.reconcile.mock.calls[0][0]).toBe(intent);expect(mock.preview).toHaveBeenCalledTimes(1);
});
test('explicit confirmed acceptance returns collection identity',async()=>{
 mock.execute.mockResolvedValue({state:'committed',receipt:{available:true,collectionId}});
 const hook=renderHook(()=>useShareInvitation('reader',code));await waitFor(()=>expect(hook.result.current.state.status).toBe('ready'));
 await act(async()=>{await hook.result.current.accept();});expect(hook.result.current.state).toMatchObject({status:'accepted',collectionId});
});
test('account switch immediately hides old preview and ignores a late committed write',async()=>{
 const pending=deferred(),fresh=deferred();mock.execute.mockReturnValue(pending.promise);
 const hook=renderHook(p=>useShareInvitation(p.userId,code),{initialProps:{userId:'reader'}});await waitFor(()=>expect(hook.result.current.state.status).toBe('ready'));
 let write:Promise<void>;act(()=>{write=hook.result.current.accept();});const signal=mock.execute.mock.calls[0][1];mock.preview.mockReturnValue(fresh.promise);
 hook.rerender({userId:'other'});expect(hook.result.current.state.status).toBe('loading');expect(signal.aborted).toBe(true);
 await act(async()=>{pending.resolve({state:'committed',receipt:{available:true,collectionId}});await write;});expect(hook.result.current.state.status).toBe('loading');
 await act(async()=>fresh.resolve({...preview,name:'Fresh'}));await waitFor(()=>expect(hook.result.current.state.status).toBe('ready'));
});
test('invalid code fails closed before preview',async()=>{
 const hook=renderHook(()=>useShareInvitation('reader','bad'));await waitFor(()=>expect(hook.result.current.state.status).toBe('unavailable'));expect(mock.preview).not.toHaveBeenCalled();
});
test('committed acceptance followed by revoke is confirmed but unavailable, never retried',async()=>{
 mock.execute.mockResolvedValue({state:'committed',receipt:{available:false,collectionId}});
 const hook=renderHook(()=>useShareInvitation('reader',code));await waitFor(()=>expect(hook.result.current.state.status).toBe('ready'));
 await act(async()=>{await hook.result.current.accept();await hook.result.current.accept();});
 expect(hook.result.current.state).toMatchObject({status:'accepted',available:false,collectionId});expect(mock.execute).toHaveBeenCalledTimes(1);
});
test('reconciliation confirms a lost acknowledgement without executing again',async()=>{
 mock.execute.mockRejectedValue(new Error('lost'));mock.reconcile.mockResolvedValue({state:'committed',receipt:{available:true,collectionId}});
 const hook=renderHook(()=>useShareInvitation('reader',code));await waitFor(()=>expect(hook.result.current.state.status).toBe('ready'));
 await act(async()=>{await hook.result.current.accept();});expect(hook.result.current.state.status).toBe('uncertain');
 await act(async()=>{await hook.result.current.reconcile();});expect(hook.result.current.state).toMatchObject({status:'accepted',available:true});expect(mock.execute).toHaveBeenCalledTimes(1);
});
test('late preview cannot overwrite a newer invitation',async()=>{
 const late=deferred();mock.preview.mockReturnValueOnce(late.promise).mockResolvedValueOnce({...preview,name:'New invitation'});
 const hook=renderHook(p=>useShareInvitation('reader',p.code),{initialProps:{code}});
 const oldSignal=mock.preview.mock.calls[0][2];hook.rerender({code:'B'.repeat(26)});expect(oldSignal.aborted).toBe(true);
 await waitFor(()=>expect(hook.result.current.state.status).toBe('ready'));
 await act(async()=>late.resolve(preview));expect(hook.result.current.state).toMatchObject({preview:{name:'New invitation'}});
});
test('explicit retry after uncertainty reuses the exact original intent and operation',async()=>{
 mock.execute.mockResolvedValueOnce({state:'uncertain'}).mockResolvedValueOnce({state:'committed',receipt:{available:true,collectionId}});
 const hook=renderHook(()=>useShareInvitation('reader',code));await waitFor(()=>expect(hook.result.current.state.status).toBe('ready'));
 await act(async()=>{await hook.result.current.accept();});const original=mock.execute.mock.calls[0][0];
 await act(async()=>{await hook.result.current.retry();});expect(mock.execute.mock.calls[1][0]).toBe(original);expect(new Set(mock.intent.mock.calls.map(call=>call[1].operationId)).size).toBe(1);expect(hook.result.current.state.status).toBe('accepted');
});
test('reload restores original acceptance even if the invitation no longer previews, without automatically accepting',async()=>{
 mock.execute.mockResolvedValue({state:'uncertain'});const first=renderHook(()=>useShareInvitation('reader',code));await waitFor(()=>expect(first.result.current.state.status).toBe('ready'));
 await act(async()=>{await first.result.current.accept();});const original=mock.execute.mock.calls[0][0];first.unmount();
 mock.preview.mockRejectedValue(new Error('rotated'));mock.reconcile.mockResolvedValue({state:'committed',receipt:{available:false,collectionId}});
 const restored=renderHook(()=>useShareInvitation('reader',code));expect(restored.result.current.state.status).toBe('uncertain');expect(mock.execute).toHaveBeenCalledTimes(1);expect(mock.preview).toHaveBeenCalledTimes(1);
 await act(async()=>{await restored.result.current.reconcile();});expect(mock.reconcile.mock.calls[0][0]).toEqual(original);expect(restored.result.current.state).toMatchObject({status:'accepted',available:false});expect(window.sessionStorage.length).toBe(0);
});
test('a denied journal blocks new acceptance, but does not block read-only recovery after a sent request',async()=>{
 const hook=renderHook(()=>useShareInvitation('reader',code));await waitFor(()=>expect(hook.result.current.state.status).toBe('ready'));
 const deny=vi.spyOn(Object.getPrototypeOf(window.sessionStorage),'setItem').mockImplementation(()=>{throw new Error('denied');});
 try{await act(async()=>{await hook.result.current.accept();});expect(mock.execute).not.toHaveBeenCalled();expect(hook.result.current.state.status).toBe('storage-error');}finally{deny.mockRestore();}
 mock.execute.mockResolvedValue({state:'uncertain'});await act(async()=>{await hook.result.current.accept();});mock.reconcile.mockResolvedValue({state:'committed',receipt:{available:true,collectionId}});
 const denyAgain=vi.spyOn(Object.getPrototypeOf(window.sessionStorage),'setItem').mockImplementation(()=>{throw new Error('denied');});try{await act(async()=>{await hook.result.current.reconcile();});expect(hook.result.current.state.status).toBe('accepted');}finally{denyAgain.mockRestore();}
});
test.each([['share_preview_not_found','unavailable'],['network','error']])('preview read failure %s stays distinct from invalid access',async(message,status)=>{
 mock.preview.mockRejectedValueOnce(Error(message));const hook=renderHook(()=>useShareInvitation('reader',code));await waitFor(()=>expect(hook.result.current.state.status).toBe(status));expect(mock.execute).not.toHaveBeenCalled();
 await act(async()=>hook.result.current.refresh());expect(hook.result.current.state.status).toBe('ready');
});
