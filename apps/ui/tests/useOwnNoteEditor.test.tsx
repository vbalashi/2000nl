import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({read:vi.fn(),write:vi.fn()}));
vi.mock('@/lib/collections/sharing/ownNoteClient',()=>({readOwnNote:mock.read,writeOwnNote:mock.write}));
import {useOwnNoteEditor} from '@/components/library/notes/useOwnNoteEditor';
const id='75600000-0000-4000-8000-000000000001';
const note=(revision='0',notes:string|null=null)=>({state:'ready',note:{entryId:id,revision,notes}});
beforeEach(()=>{vi.resetAllMocks();window.sessionStorage.clear();mock.read.mockResolvedValue(note());});
async function editor(){const hook=renderHook(()=>useOwnNoteEditor('reader',id));await waitFor(()=>expect(hook.result.current.state.status).toBe('editing'));return hook;}
test('editing is local until save and clearing text explicitly writes null using original decimal clock',async()=>{
 mock.read.mockResolvedValue(note('9007199254740993','Old'));mock.write.mockResolvedValue(note('9007199254740994'));
 const hook=await editor();act(()=>hook.result.current.setDraft(''));expect(mock.write).not.toHaveBeenCalled();await act(async()=>{await hook.result.current.save();});expect(mock.write.mock.calls[0][2]).toEqual({expectedRevision:'9007199254740993',notes:null});expect(hook.result.current.state.status).toBe('saved');
});
test('conflict preserves draft and only an explicit overwrite rebases to the current server revision',async()=>{
 mock.write.mockResolvedValueOnce({state:'changed'}).mockResolvedValueOnce(note('3','Mine'));const hook=await editor();act(()=>hook.result.current.setDraft('Mine'));mock.read.mockResolvedValue(note('2','Elsewhere'));
 await act(async()=>{await hook.result.current.save();});expect(hook.result.current.state).toMatchObject({status:'conflict',draft:'Mine',server:{notes:'Elsewhere'}});
 await act(async()=>{await hook.result.current.save();});expect(mock.write).toHaveBeenCalledTimes(1);
 await act(async()=>{await hook.result.current.save(true);});expect(mock.write.mock.calls[1][2]).toEqual({expectedRevision:'2',notes:'Mine'});expect(hook.result.current.state.status).toBe('saved');
});
test('lost response is checked read-only and matching current text confirms the desired result',async()=>{
 mock.write.mockResolvedValue({state:'uncertain'});const hook=await editor();act(()=>hook.result.current.setDraft('Mine'));await act(async()=>{await hook.result.current.save();});
 mock.read.mockResolvedValue(note('1','Mine'));await act(async()=>{await hook.result.current.check();});expect(hook.result.current.state.status).toBe('saved');expect(mock.write).toHaveBeenCalledTimes(1);
});
test('unchanged clock after lost response is still uncertain, never proof of rollback',async()=>{
 mock.write.mockResolvedValue({state:'uncertain'});const hook=await editor();act(()=>hook.result.current.setDraft('Mine'));await act(async()=>{await hook.result.current.save();await hook.result.current.check();});expect(hook.result.current.state).toMatchObject({status:'uncertain',draft:'Mine'});expect(mock.write).toHaveBeenCalledTimes(1);
});
test('a newer conflicting clock after uncertainty requires explicit review',async()=>{
 mock.write.mockResolvedValue({state:'uncertain'});const hook=await editor();act(()=>hook.result.current.setDraft('Mine'));await act(async()=>{await hook.result.current.save();});mock.read.mockResolvedValue(note('2','Other'));await act(async()=>{await hook.result.current.check();});expect(hook.result.current.state).toMatchObject({status:'conflict',draft:'Mine',server:{notes:'Other'}});
});
test('principal change cancels pending work and never shows prior draft in the new scope',async()=>{
 let resolve!:(v:unknown)=>void;mock.write.mockReturnValue(new Promise(r=>resolve=r));const hook=renderHook(p=>useOwnNoteEditor(p.user,id),{initialProps:{user:'first'}});await waitFor(()=>expect(hook.result.current.state.status).toBe('editing'));act(()=>hook.result.current.setDraft('Private draft'));let pending:Promise<void>;act(()=>{pending=hook.result.current.save();});const signal=mock.write.mock.calls[0][3];hook.rerender({user:'second'});expect(signal.aborted).toBe(true);expect(hook.result.current.state.draft).not.toBe('Private draft');await act(async()=>{resolve(note('1','Private draft'));await pending;});expect(hook.result.current.state.status).not.toBe('saved');
});
test('invalid Unicode/oversized note cannot be sent',async()=>{
 const hook=await editor();act(()=>hook.result.current.setDraft('x'.repeat(65537)));expect(hook.result.current.valid).toBe(false);await act(async()=>{await hook.result.current.save();});expect(mock.write).not.toHaveBeenCalled();
});
test('unsaved text survives remount and newer server text is compared without overwriting the draft',async()=>{
 const first=await editor();act(()=>first.result.current.setDraft('Private draft'));first.unmount();mock.read.mockResolvedValue(note('1','Other window'));
 const restored=await (async()=>{const hook=renderHook(()=>useOwnNoteEditor('reader',id));await waitFor(()=>expect(hook.result.current.state.status).toBe('conflict'));return hook;})();
 expect(restored.result.current.state).toMatchObject({draft:'Private draft',server:{notes:'Other window'}});expect(mock.write).not.toHaveBeenCalled();
});
test('lost save survives remount and is checked by reading, without resending',async()=>{
 mock.write.mockResolvedValue({state:'uncertain'});const first=await editor();act(()=>first.result.current.setDraft('Mine'));await act(async()=>{await first.result.current.save();});first.unmount();
 mock.read.mockResolvedValue(note('1','Mine'));const restored=renderHook(()=>useOwnNoteEditor('reader',id));await waitFor(()=>expect(restored.result.current.state.status).toBe('saved'));expect(mock.write).toHaveBeenCalledTimes(1);expect(window.sessionStorage.length).toBe(0);
});
test('storage denial prevents a save from being sent and keeps the in-memory draft editable',async()=>{
 const hook=await editor();act(()=>hook.result.current.setDraft('Mine'));const deny=vi.spyOn(Object.getPrototypeOf(window.sessionStorage),'setItem').mockImplementation(()=>{throw new Error('denied');});
 try{await act(async()=>{await hook.result.current.save();});expect(mock.write).not.toHaveBeenCalled();expect(hook.result.current.state).toMatchObject({status:'editing',draft:'Mine',storageError:true});}finally{deny.mockRestore();}
});
