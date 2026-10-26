import {act,renderHook} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({intent:vi.fn(),execute:vi.fn(),check:vi.fn()}));
vi.mock('@/lib/collections/sharing/shareCommandClient',()=>({createShareIntent:mock.intent,executeShareIntent:mock.execute,reconcileShareIntent:mock.check}));
import {useUnsubscribeCollection} from '@/components/library/sharing/useShareMutation';
beforeEach(()=>{vi.resetAllMocks();window.sessionStorage.clear();mock.intent.mockImplementation((userId,command)=>({userId,command}));});
function deferred(){let resolve!:(value:unknown)=>void;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
test('confirmation alone starts one unsubscribe and double clicks cannot duplicate it',async()=>{
 const pending=deferred();mock.execute.mockReturnValue(pending.promise);const hook=renderHook(()=>useUnsubscribeCollection('reader','75600000-0000-4000-8000-000000000001'));
 expect(mock.execute).not.toHaveBeenCalled();let write:Promise<void>;act(()=>{write=hook.result.current.start();void hook.result.current.start();});expect(mock.execute).toHaveBeenCalledTimes(1);expect(mock.intent.mock.calls[0][1]).toMatchObject({action:'unsubscribe',collectionId:'75600000-0000-4000-8000-000000000001'});
 await act(async()=>{pending.resolve({state:'committed',receipt:{available:true}});await write;});expect(hook.result.current.state.status).toBe('committed');
});
test('lost response retains original intent for check and explicit retry, without automatic writes',async()=>{
 mock.execute.mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce({state:'committed',receipt:{available:false}});mock.check.mockResolvedValue({state:'uncertain'});
 const hook=renderHook(()=>useUnsubscribeCollection('reader','75600000-0000-4000-8000-000000000001'));await act(async()=>{await hook.result.current.start();});expect(hook.result.current.state.status).toBe('uncertain');const original=mock.execute.mock.calls[0][0];
 await act(async()=>{await hook.result.current.check();});expect(mock.check.mock.calls[0][0]).toBe(original);expect(mock.execute).toHaveBeenCalledTimes(1);
 await act(async()=>{await hook.result.current.retry();});expect(mock.execute.mock.calls[1][0]).toBe(original);expect(new Set(mock.intent.mock.calls.map(call=>call[1].operationId)).size).toBe(1);
});
test('account/resource change hides old operation and rejects late completion',async()=>{
 const pending=deferred();mock.execute.mockReturnValue(pending.promise);const hook=renderHook(p=>useUnsubscribeCollection(p.user,p.collection),{initialProps:{user:'first',collection:'75600000-0000-4000-8000-000000000001'}});
 let write:Promise<void>;act(()=>{write=hook.result.current.start();});const signal=mock.execute.mock.calls[0][1];hook.rerender({user:'second',collection:'75600000-0000-4000-8000-000000000002'});expect(signal.aborted).toBe(true);expect(hook.result.current.state.status).toBe('ready');
 await act(async()=>{pending.resolve({state:'committed',receipt:{available:false}});await write;});expect(hook.result.current.state.status).toBe('ready');
});
test('reload restores uncertainty and checks the original operation without executing again',async()=>{
 mock.execute.mockResolvedValue({state:'uncertain'});mock.check.mockResolvedValue({state:'committed',receipt:{available:false}});
 const first=renderHook(()=>useUnsubscribeCollection('reader','75600000-0000-4000-8000-000000000001'));await act(async()=>{await first.result.current.start();});const original=mock.execute.mock.calls[0][0];first.unmount();
 const restored=renderHook(()=>useUnsubscribeCollection('reader','75600000-0000-4000-8000-000000000001'));expect(restored.result.current.state.status).toBe('uncertain');expect(mock.execute).toHaveBeenCalledTimes(1);
 await act(async()=>{await restored.result.current.check();});expect(mock.check.mock.calls[0][0]).toEqual(original);expect(window.sessionStorage.length).toBe(0);
});
test('storage failure blocks the request before it can be sent',async()=>{
 const deny=vi.spyOn(Object.getPrototypeOf(window.sessionStorage),'setItem').mockImplementation(()=>{throw new Error('denied');});mock.execute.mockResolvedValue({state:'uncertain'});
 try{const hook=renderHook(()=>useUnsubscribeCollection('reader','75600000-0000-4000-8000-000000000001'));await act(async()=>{await hook.result.current.start();});expect(hook.result.current.state.status).toBe('storage-error');expect(mock.execute).not.toHaveBeenCalled();}finally{deny.mockRestore();}
});
test('storage becomes unwritable after sending but read-only reconciliation still confirms the original intent',async()=>{
 mock.execute.mockResolvedValue({state:'uncertain'});mock.check.mockResolvedValue({state:'committed',receipt:{available:false}});
 const hook=renderHook(()=>useUnsubscribeCollection('reader','75600000-0000-4000-8000-000000000001'));await act(async()=>{await hook.result.current.start();});
 const original=mock.execute.mock.calls[0][0];const deny=vi.spyOn(Object.getPrototypeOf(window.sessionStorage),'setItem').mockImplementation(()=>{throw new Error('denied');});
 try{await act(async()=>{await hook.result.current.check();});expect(hook.result.current.state.status).toBe('committed');expect(mock.check.mock.calls[0][0]).toBe(original);}finally{deny.mockRestore();}
});
