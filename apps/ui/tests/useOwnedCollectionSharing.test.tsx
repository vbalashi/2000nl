import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({read:vi.fn(),execute:vi.fn(),check:vi.fn(),intent:vi.fn()}));
vi.mock('@/lib/collections/sharing/shareManagementClient',()=>({readCollectionShareManagement:mock.read}));
vi.mock('@/lib/collections/sharing/shareCommandClient',()=>({createShareIntent:mock.intent,executeShareIntent:mock.execute,reconcileShareIntent:mock.check}));
vi.mock('@/lib/events/userEventHints',()=>({useUserEventHints:()=>{}}));
import {useOwnedCollectionSharing} from '@/components/library/sharing/useOwnedCollectionSharing';
const id='75600000-0000-4000-8000-000000000001',code='A'.repeat(26);
const data={collectionId:id,isOpen:true,revision:1,invitationCode:code,subscriberCount:2};
beforeEach(()=>{vi.resetAllMocks();window.sessionStorage.clear();mock.read.mockResolvedValue(data);mock.intent.mockImplementation((userId,command)=>({userId,command}));});
async function ready(){const hook=renderHook(()=>useOwnedCollectionSharing('owner',id));await waitFor(()=>expect(hook.result.current.state.status).toBe('ready'));return hook;}
test('no mutation until explicit action, expected revision captured and acknowledgement followed by authoritative projection',async()=>{
 const hook=await ready();expect(mock.execute).not.toHaveBeenCalled();mock.execute.mockResolvedValue({state:'committed',receipt:{}});mock.read.mockResolvedValue({...data,revision:2,invitationCode:'B'.repeat(26),subscriberCount:3});
 await act(async()=>{await hook.result.current.run('rotate');});expect(mock.execute.mock.calls[0][0].command).toMatchObject({collectionId:id,action:'rotate',expectedRevision:1});expect(hook.result.current.state).toMatchObject({status:'ready',data:{revision:2,subscriberCount:3,invitationCode:'B'.repeat(26)}});expect(window.sessionStorage.length).toBe(0);
});
test('lost response clears old owner secret and reload restores only the original intent for checking',async()=>{
 const first=await ready();mock.execute.mockResolvedValue({state:'uncertain'});await act(async()=>{await first.result.current.run('close');});const intent=mock.execute.mock.calls[0][0];expect(first.result.current.state).toMatchObject({status:'uncertain',data:null});first.unmount();
 const restored=renderHook(()=>useOwnedCollectionSharing('owner',id));expect(restored.result.current.state.status).toBe('uncertain');mock.check.mockResolvedValue({state:'committed',receipt:{available:false}});mock.read.mockResolvedValue({...data,isOpen:false,revision:2,invitationCode:null,subscriberCount:0});await act(async()=>{await restored.result.current.run('check');});expect(mock.check.mock.calls[0][0]).toEqual(intent);expect(mock.execute).toHaveBeenCalledTimes(1);expect(restored.result.current.state).toMatchObject({status:'ready',data:{isOpen:false,invitationCode:null}});
});
test('account switch cannot deliver a late owner invitation',async()=>{
 let resolve!:(v:unknown)=>void;mock.read.mockReturnValueOnce(new Promise(r=>resolve=r)).mockResolvedValueOnce({...data,invitationCode:'B'.repeat(26)});
 const hook=renderHook(p=>useOwnedCollectionSharing(p.user,id),{initialProps:{user:'first'}});const signal=mock.read.mock.calls[0][2];hook.rerender({user:'other'});expect(signal.aborted).toBe(true);expect(hook.result.current.state.data).toBeNull();await act(async()=>resolve(data));await waitFor(()=>expect(hook.result.current.state.status).toBe('ready'));expect(hook.result.current.state.data?.invitationCode).toBe('B'.repeat(26));
});
test('storage denial blocks mutation but does not block checking an existing uncertain intent',async()=>{
 const hook=await ready();const deny=vi.spyOn(Object.getPrototypeOf(window.sessionStorage),'setItem').mockImplementation(()=>{throw new Error('denied');});try{await act(async()=>{await hook.result.current.run('rotate');});expect(mock.execute).not.toHaveBeenCalled();expect(hook.result.current.state.status).toBe('storage-error');}finally{deny.mockRestore();}
 mock.execute.mockResolvedValue({state:'uncertain'});await act(async()=>{await hook.result.current.run('close');});mock.check.mockResolvedValue({state:'uncertain'});const denyAgain=vi.spyOn(Object.getPrototypeOf(window.sessionStorage),'setItem').mockImplementation(()=>{throw new Error('denied');});try{await act(async()=>{await hook.result.current.run('check');});expect(mock.check).toHaveBeenCalledOnce();}finally{denyAgain.mockRestore();}
});
test('double confirm rotates once and clears the old code before the request settles',async()=>{
 const hook=await ready();let resolve!:(v:unknown)=>void;mock.execute.mockReturnValue(new Promise(r=>resolve=r));let pending:Promise<void>;
 act(()=>{pending=hook.result.current.run('rotate');void hook.result.current.run('rotate');});expect(mock.execute).toHaveBeenCalledTimes(1);expect(hook.result.current.state).toMatchObject({status:'saving',data:null});await act(async()=>{resolve({state:'uncertain'});await pending;});expect(hook.result.current.state.status).toBe('uncertain');
});
test('an action incompatible with the refreshed open state cannot issue a new command',async()=>{
 const hook=await ready();await act(async()=>{await hook.result.current.run('open');});expect(mock.execute).not.toHaveBeenCalled();expect(hook.result.current.state.status).toBe('ready');
});
test('durable terminal rejection frees the journal, then fresh confirmation uses a new nonce and revision',async()=>{
 const hook=await ready();mock.execute.mockResolvedValueOnce({state:'rejected',receipt:{reason:'share_revision_conflict'}}).mockResolvedValueOnce({state:'committed',receipt:{}});mock.read.mockResolvedValue({...data,revision:2});await act(async()=>{await hook.result.current.run('rotate');});const first=mock.execute.mock.calls[0][0];expect(hook.result.current.state.status).toBe('ready');expect(window.sessionStorage.length).toBe(0);expect(mock.execute).toHaveBeenCalledTimes(1);
 await act(async()=>{await hook.result.current.run('close');});const second=mock.execute.mock.calls[1][0];expect(second.command.expectedRevision).toBe(2);expect(second.command.operationId).not.toBe(first.command.operationId);
});
