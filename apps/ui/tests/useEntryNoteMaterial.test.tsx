import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
const transport=vi.hoisted(()=>({read:vi.fn(),refresh:undefined as undefined|(()=>void|Promise<unknown>)}));
vi.mock('@/lib/platform/entryNoteMaterialClient',()=>({readEntryNoteMaterial:transport.read}));
vi.mock('@/lib/events/userEventHints',()=>({useUserEventHints:(_user:unknown,_kinds:unknown,refresh:()=>void|Promise<unknown>)=>{transport.refresh=refresh;return ()=>{};}}));
import {useEntryNoteMaterial} from '@/components/training/useEntryNoteMaterial';
const note={noteId:'teacher-note',ownerUserId:'teacher',text:'Provided note',revision:'1',isOwn:false};
const input={userId:'reader',entryId:'entry',scope:'target',active:true};
beforeEach(()=>{transport.read.mockReset();transport.refresh=undefined;});
test('starts empty, refreshes only note material and clears revoked/failed overlays before reading',async()=>{
 transport.read.mockResolvedValueOnce([note]);const hook=renderHook(()=>useEntryNoteMaterial(input));
 await waitFor(()=>expect(hook.result.current).toEqual([note]));let complete!:(notes:unknown)=>void;
 transport.read.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));let pending:Promise<unknown>;
 act(()=>{pending=Promise.resolve(transport.refresh!());});expect(hook.result.current).toEqual([]);
 await act(async()=>{complete([]);await pending;});expect(hook.result.current).toEqual([]);
 transport.read.mockResolvedValueOnce([note]);await act(async()=>{await transport.refresh!();});expect(hook.result.current).toEqual([note]);
 transport.read.mockRejectedValueOnce(new Error('unavailable'));await act(async()=>{await transport.refresh!();});expect(hook.result.current).toEqual([]);
});
test('late old-owner/target results cannot restore notes after a scope switch',async()=>{
 let release!:(notes:unknown)=>void;transport.read.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockResolvedValueOnce([]);
 const hook=renderHook(p=>useEntryNoteMaterial(p),{initialProps:input});
 const signal=transport.read.mock.calls[0][2] as AbortSignal;
 hook.rerender({...input,userId:'other-reader',scope:'new-target'});expect(signal.aborted).toBe(true);
 await waitFor(()=>expect(transport.read).toHaveBeenCalledTimes(2));
 await act(async()=>release([note]));expect(hook.result.current).toEqual([]);
});
test('paused presentations never consume cached material and revalidate on activation',async()=>{
 transport.read.mockResolvedValue([note]);const hook=renderHook(p=>useEntryNoteMaterial(p),{initialProps:{...input,active:false}});
 expect(hook.result.current).toEqual([]);expect(transport.read).not.toHaveBeenCalled();
 hook.rerender(input);await waitFor(()=>expect(hook.result.current).toEqual([note]));
 hook.rerender({...input,active:false});expect(hook.result.current).toEqual([]);
});
