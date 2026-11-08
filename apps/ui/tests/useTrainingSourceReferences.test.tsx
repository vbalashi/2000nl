import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({read:vi.fn(),hint:undefined as undefined|(()=>Promise<void>),scope:{userId:'owner',languageCode:'nl',onTrainingResolved:vi.fn()}}));
vi.mock('@/lib/collections/sharing/readableTrainingCatalog',()=>({readTrainingCollectionReferences:mock.read}));
vi.mock('@/lib/events/userEventHints',()=>({useUserEventHints:(_owner:unknown,_kinds:unknown,refresh:()=>Promise<void>)=>{mock.hint=refresh;}}));
vi.mock('@/components/library/sharing/CollectionSelectionContext',()=>({useCollectionSelectionScope:()=>mock.scope}));
import {useTrainingSourceReferences} from '@/components/library/sharing/useTrainingSourceReferences';
const id='10900000-0000-4000-8000-000000000001';
const row={id,name:'Shared lesson',ownership:'received' as const,availableItemCount:3};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('NEXT_PUBLIC_COLLECTION_SHARING_ENABLED','true');mock.scope.userId='owner';mock.scope.languageCode='nl';mock.read.mockResolvedValue([row]);});
test('idle same-scope safety hint retains accepted references while it authoritatively refreshes',async()=>{
 const hook=renderHook(()=>useTrainingSourceReferences(['user:'+id]));
 await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 mock.scope.onTrainingResolved.mockClear();
 let finish!:(rows:typeof row[])=>void;mock.read.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 let pending!:Promise<void>;act(()=>{pending=mock.hint!();});
 expect(hook.result.current.status).toBe('ready');
 expect(mock.scope.onTrainingResolved).not.toHaveBeenCalled();
 await act(async()=>{finish([row]);await pending;});
 expect(mock.scope.onTrainingResolved).toHaveBeenCalledWith([id],[row]);
 expect(mock.read).toHaveBeenCalledTimes(2);
});
test('a failed refresh clears accepted authority and requires recovery',async()=>{
 const hook=renderHook(()=>useTrainingSourceReferences(['user:'+id]));await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 mock.scope.onTrainingResolved.mockClear();mock.read.mockRejectedValueOnce(new Error('unavailable'));
 await act(async()=>{await mock.hint!();});
 expect(hook.result.current.status).toBe('error');expect(mock.scope.onTrainingResolved).toHaveBeenLastCalledWith([id],[]);
});
test('new account or language scope clears references before loading and ignores its predecessor',async()=>{
 const hook=renderHook(()=>useTrainingSourceReferences(['user:'+id]));await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 let finish!:(rows:typeof row[])=>void;mock.read.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 let pending!:Promise<void>;act(()=>{pending=mock.hint!();});mock.scope.userId='other';
 mock.read.mockImplementationOnce(()=>new Promise(()=>{}));hook.rerender();
 expect(hook.result.current.status).toBe('loading');expect(mock.scope.onTrainingResolved).toHaveBeenLastCalledWith([id],[]);
 await act(async()=>{finish([row]);await pending;});expect(hook.result.current.status).toBe('loading');
});
test('an authoritative empty refresh removes a revoked source atomically',async()=>{
 const hook=renderHook(()=>useTrainingSourceReferences(['user:'+id]));await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 mock.scope.onTrainingResolved.mockClear();mock.read.mockResolvedValueOnce([]);
 await act(async()=>{await mock.hint!();});
 expect(hook.result.current.status).toBe('ready');expect(mock.scope.onTrainingResolved).toHaveBeenCalledTimes(1);expect(mock.scope.onTrainingResolved).toHaveBeenLastCalledWith([id],[]);
});
