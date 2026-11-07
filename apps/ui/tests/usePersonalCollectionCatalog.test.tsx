import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({read:vi.fn(),hint:undefined as undefined|(()=>Promise<void>)}));
vi.mock('@/lib/collections/sharing/personalCatalogClient',()=>({readPersonalCatalog:mock.read}));
vi.mock('@/lib/events/userEventHints',()=>({useUserEventHints:(_userId:unknown,_kinds:unknown,refresh:()=>Promise<void>)=>{mock.hint=refresh;}}));
import {usePersonalCollectionCatalog} from '@/components/library/organization/usePersonalCollectionCatalog';
const id=(n:number)=>`75600000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const row=(n:number)=>({id:id(n),name:`Lesson ${n}`,createdAt:'2026-01-01T00:00:00Z',ownership:n===1?'owned':'received',isShared:n!==1,itemCount:1,labelIds:[]});
const page=(n:number,revision=1,next=false)=>({revision,collections:[row(n)],nextCursor:next?{id:id(n),key:`lesson ${n}`,scope:'a'.repeat(64)}:null});
const input={userId:'reader',active:true,query:{query:'',sort:'name' as const,scope:'all' as const,labelId:null,languageCode:'nl',limit:1}};
beforeEach(()=>{vi.resetAllMocks();});
test('pages own and received resources together and restarts if label revision changes',async()=>{
 mock.read.mockResolvedValueOnce(page(1,1,true)).mockResolvedValueOnce(page(2,2)).mockResolvedValueOnce(page(3,2));
 const hook=renderHook(()=>usePersonalCollectionCatalog(input));await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 await act(async()=>hook.result.current.loadMore());expect(hook.result.current.collections.map(row=>row.id)).toEqual([id(3)]);expect(mock.read.mock.calls[2][1].cursor).toBeNull();
});
test('account and language changes hide old rows before new reads settle',async()=>{
 let resolve!:(value:unknown)=>void;mock.read.mockResolvedValueOnce(page(1)).mockReturnValueOnce(new Promise(r=>resolve=r));
 const hook=renderHook(props=>usePersonalCollectionCatalog(props),{initialProps:input});await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 hook.rerender({...input,userId:'other',query:{...input.query,languageCode:'en'}});expect(hook.result.current.collections).toEqual([]);
 await act(async()=>resolve(page(2)));await waitFor(()=>expect(hook.result.current.collections[0].id).toBe(id(2)));
});
test.each(['focus','hint'])('%s refresh retains ready rows until the authoritative replacement arrives',async(trigger)=>{
 let resolve!:(value:unknown)=>void;
 mock.read.mockResolvedValueOnce(page(1)).mockReturnValueOnce(new Promise(r=>resolve=r));
 const hook=renderHook(()=>usePersonalCollectionCatalog(input));
 await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 act(()=>{if(trigger==='focus')window.dispatchEvent(new Event('focus'));else void mock.hint!();});
 expect(mock.read).toHaveBeenCalledTimes(2);
 expect(hook.result.current.status).toBe('ready');
 expect(hook.result.current.collections.map(row=>row.id)).toEqual([id(1)]);
 await act(async()=>resolve(page(2)));
 expect(hook.result.current.collections.map(row=>row.id)).toEqual([id(2)]);
});
test('failed background read clears rows rather than retaining potentially revoked content',async()=>{
 let reject!:(error:Error)=>void;
 mock.read.mockResolvedValueOnce(page(1)).mockReturnValueOnce(new Promise((_resolve,r)=>reject=r));
 const hook=renderHook(()=>usePersonalCollectionCatalog(input));
 await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 act(()=>window.dispatchEvent(new Event('focus')));
 await act(async()=>reject(new Error('catalog_unavailable')));
 expect(hook.result.current.status).toBe('error');
 expect(hook.result.current.collections).toEqual([]);
});
test('query change hides ready rows even while a same-scope refresh is pending',async()=>{
 mock.read.mockResolvedValueOnce(page(1)).mockImplementation(()=>new Promise(()=>{}));
 const hook=renderHook(props=>usePersonalCollectionCatalog(props),{initialProps:input});
 await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 act(()=>window.dispatchEvent(new Event('focus')));
 hook.rerender({...input,query:{...input.query,query:'other'}});
 expect(hook.result.current.status).toBe('loading');
 expect(hook.result.current.collections).toEqual([]);
});
