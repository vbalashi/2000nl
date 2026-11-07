import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,it,expect,vi} from 'vitest';
import {useCollectionComposition} from '@/components/library/sharing/useCollectionComposition';
import * as client from '@/lib/collections/sharing/collectionCompositionClient';
import {collectionCompositionJournalKey,retainCollectionCompositionJournal} from '@/lib/collections/sharing/collectionCompositionJournal';
import type {CollectionCompositionPlan} from '@/lib/collections/sharing/collectionCompositionContract';
vi.mock('@/lib/collections/sharing/collectionCompositionClient',()=>({prepareCollectionComposition:vi.fn(),confirmCollectionComposition:vi.fn(),readCollectionCompositionReceipt:vi.fn()}));
const collection='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',planId='33333333-3333-4333-8333-333333333333';
const plan:CollectionCompositionPlan={planId,collectionId:collection,action:'delete',audience:[{userId:'44444444-4444-4444-8444-444444444444',paths:[{rootId:other,kind:'label',lifetime:planId}]}]};
const intent={userId:'owner',collectionId:collection,planId,action:'delete' as const};
beforeEach(()=>{sessionStorage.clear();vi.clearAllMocks();vi.mocked(client.prepareCollectionComposition).mockResolvedValue(plan);vi.mocked(client.confirmCollectionComposition).mockResolvedValue({planId,collectionId:collection,status:'committed'});});
it('previews the exact audience without persisting consent or executing the operation',async()=>{
 const saved=vi.fn(),hook=renderHook(()=>useCollectionComposition('owner',collection,saved));
 await act(()=>hook.result.current.save({action:'delete'}));
 expect(hook.result.current.state.status).toBe('awaiting');expect(client.confirmCollectionComposition).not.toHaveBeenCalled();
 expect(sessionStorage.getItem(collectionCompositionJournalKey('owner',collection))).toBeNull();
 await act(()=>hook.result.current.confirm());expect(saved).toHaveBeenCalledOnce();expect(sessionStorage.getItem(collectionCompositionJournalKey('owner',collection))).toBeNull();
});
it('recovers a lost response by readonly check and retries the same plan only after checking target and action',async()=>{
 vi.mocked(client.confirmCollectionComposition).mockRejectedValue(Error('offline'));
 const first=renderHook(()=>useCollectionComposition('owner',collection,vi.fn()));
 await act(()=>first.result.current.save({action:'delete'}));await act(()=>first.result.current.confirm());first.unmount();
 const saved=vi.fn(),hook=renderHook(()=>useCollectionComposition('owner',collection,saved));
 await waitFor(()=>expect(hook.result.current.state.status).toBe('uncertain'));
 vi.mocked(client.readCollectionCompositionReceipt).mockResolvedValue({planId,collectionId:collection,action:'delete',status:'pending'});
 await act(()=>hook.result.current.check());expect(client.confirmCollectionComposition).toHaveBeenCalledTimes(1);expect(saved).not.toHaveBeenCalled();
 vi.mocked(client.confirmCollectionComposition).mockResolvedValue({planId,collectionId:collection,status:'committed'});
 await act(()=>hook.result.current.confirm());
 expect(client.readCollectionCompositionReceipt).toHaveBeenCalledTimes(2);expect(client.confirmCollectionComposition).toHaveBeenLastCalledWith('owner',planId,expect.any(AbortSignal));expect(saved).toHaveBeenCalledOnce();
});
it.each([{collectionId:other,action:'delete' as const,status:'pending' as const},{collectionId:collection,action:'add' as const,status:'pending' as const},{collectionId:collection,action:'delete' as const,status:'expired' as const}])('never replays a mismatched or expired restored plan: %j',async receipt=>{
 retainCollectionCompositionJournal(sessionStorage,intent);vi.mocked(client.readCollectionCompositionReceipt).mockResolvedValue({planId,...receipt});
 const saved=vi.fn(),hook=renderHook(()=>useCollectionComposition('owner',collection,saved));
 await act(()=>hook.result.current.confirm());expect(client.confirmCollectionComposition).not.toHaveBeenCalled();expect(saved).not.toHaveBeenCalled();
});
it('settles a committed receipt without a write',async()=>{
 retainCollectionCompositionJournal(sessionStorage,intent);vi.mocked(client.readCollectionCompositionReceipt).mockResolvedValue({planId,collectionId:collection,status:'committed'});
 const saved=vi.fn(),hook=renderHook(()=>useCollectionComposition('owner',collection,saved));await act(()=>hook.result.current.check());
 expect(saved).toHaveBeenCalledOnce();expect(client.confirmCollectionComposition).not.toHaveBeenCalled();
});
it('does not deliver a late completion to a different account or collection',async()=>{
 let resolve!:(value:{planId:string;collectionId:string;status:'committed'})=>void;
 vi.mocked(client.confirmCollectionComposition).mockReturnValue(new Promise(done=>{resolve=done;}));
 const saved=vi.fn(),hook=renderHook(({user,id})=>useCollectionComposition(user,id,saved),{initialProps:{user:'owner',id:collection}});
 await act(()=>hook.result.current.save({action:'delete'}));let pending!:Promise<boolean>;act(()=>{pending=hook.result.current.confirm();});
 hook.rerender({user:'viewer',id:other});await act(async()=>{resolve({planId,collectionId:collection,status:'committed'});await pending;});
 expect(saved).not.toHaveBeenCalled();expect(hook.result.current.state.status).toBe('idle');expect(sessionStorage.getItem(collectionCompositionJournalKey('owner',collection))).not.toBeNull();
});
it('blocks writes when consent cannot be retained, including a corrupt previous record',async()=>{
 sessionStorage.setItem(collectionCompositionJournalKey('owner',collection),'corrupt');
 const hook=renderHook(()=>useCollectionComposition('owner',collection,vi.fn()));await act(()=>hook.result.current.save({action:'delete'}));await act(()=>hook.result.current.confirm());
 expect(client.confirmCollectionComposition).not.toHaveBeenCalled();expect(hook.result.current.state.error).toBe('storage');
});
it('commits a private change without a redundant audience confirmation',async()=>{
 vi.mocked(client.prepareCollectionComposition).mockResolvedValue({...plan,audience:[]});const saved=vi.fn(),hook=renderHook(()=>useCollectionComposition('owner',collection,saved));
 await act(()=>hook.result.current.save({action:'delete'}));expect(saved).toHaveBeenCalledOnce();
});
