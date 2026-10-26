import { act,renderHook,waitFor } from '@testing-library/react';
import { beforeEach,expect,test,vi } from 'vitest';
const mock=vi.hoisted(()=>({read:vi.fn(),hint:undefined as undefined|(()=>Promise<unknown>)}));
vi.mock('@/lib/collections/sharing/receivedCatalogClient',()=>({readReceivedCatalog:mock.read}));
vi.mock('@/lib/events/userEventHints',()=>({useUserEventHints:(_user:unknown,_kinds:unknown,refresh:()=>Promise<unknown>)=>{mock.hint=refresh;return()=>{};}}));
import { useReceivedCatalog } from '@/components/library/organization/useReceivedCatalog';
import type { ReceivedCatalogPage,ReceivedCollection } from '@/lib/collections/sharing/receivedCatalogContract';
const id=(n:number)=>'75600000-0000-4000-8000-'+String(n).padStart(12,'0');
const row=(n:number,name='Lesson '+n):ReceivedCollection=>({id:id(n),name,createdAt:'2026-01-01T00:00:00Z',addedAt:'2026-01-02T00:00:00Z',ownerUserId:id(99),role:'viewer',itemCount:1,labelIds:[]});
const cursor=(n:number)=>({id:id(n),key:'lesson '+n,scope:'a'.repeat(64)});
const page=(rows:ReceivedCollection[],next:number|null=null,revision=0):ReceivedCatalogPage=>({collections:rows,nextCursor:next===null?null:cursor(next),revision});
const input={userId:id(90),active:true,query:{query:'',sort:'name' as const,scope:'all' as const,labelId:null,limit:2}};
function deferred(){let resolve!:(page:ReceivedCatalogPage)=>void;const promise=new Promise<ReceivedCatalogPage>(r=>{resolve=r;});return {promise,resolve};}
beforeEach(()=>{vi.resetAllMocks();mock.hint=undefined;});
test('starts empty and distinguishes ready-empty from failed load',async()=>{
 mock.read.mockResolvedValueOnce(page([])).mockRejectedValueOnce(new Error('offline'));
 const hook=renderHook(()=>useReceivedCatalog(input));await waitFor(()=>expect(hook.result.current.status).toBe('ready'));expect(hook.result.current.collections).toEqual([]);
 await act(async()=>{await hook.result.current.refresh();});expect(hook.result.current.status).toBe('error');expect(hook.result.current.collections).toEqual([]);
});
test('deduplicates overlapping pages by resource ID while using the newest row',async()=>{
 mock.read.mockResolvedValueOnce(page([row(1),row(2)],2)).mockResolvedValueOnce(page([row(2,'Updated lesson'),row(3)]));
 const hook=renderHook(()=>useReceivedCatalog(input));await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 await act(async()=>{await hook.result.current.loadMore();});expect(hook.result.current.collections.map(r=>r.id)).toEqual([id(1),id(2),id(3)]);expect(hook.result.current.collections[1].name).toBe('Updated lesson');
 expect(mock.read.mock.calls[1][1].cursor).toEqual(cursor(2));
});
test('rapid double pagination cannot start two requests for the same cursor',async()=>{
 const next=deferred();mock.read.mockResolvedValueOnce(page([row(1),row(2)],2)).mockReturnValueOnce(next.promise);
 const hook=renderHook(()=>useReceivedCatalog(input));await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 let pending:Promise<void>;act(()=>{pending=hook.result.current.loadMore();void hook.result.current.loadMore();});expect(mock.read).toHaveBeenCalledTimes(2);expect(hook.result.current.loadingMore).toBe(true);
 await act(async()=>{next.resolve(page([row(3)]));await pending;});expect(hook.result.current.collections).toHaveLength(3);
});
test.each(['account','query','sort','scope'] as const)('%s switch hides old rows immediately and discards late previous pages',async change=>{
 const late=deferred(),fresh=deferred();mock.read.mockResolvedValueOnce(page([row(1),row(2)],2)).mockReturnValueOnce(late.promise).mockReturnValueOnce(fresh.promise);
 const hook=renderHook(p=>useReceivedCatalog(p),{initialProps:input});await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 let pending:Promise<void>;act(()=>{pending=hook.result.current.loadMore();});const oldSignal=mock.read.mock.calls[1][2] as AbortSignal;
 const next={...input,...(change==='account'?{userId:id(91)}:{}),query:{...input.query,...(change==='query'?{query:'new'}:change==='sort'?{sort:'count' as const}:change==='scope'?{scope:'unlabelled' as const}:{})}};
 hook.rerender(next as typeof input);expect(hook.result.current.collections).toEqual([]);expect(oldSignal.aborted).toBe(true);
 await act(async()=>{late.resolve(page([row(3,'Private late result')]));await pending;});expect(hook.result.current.collections).toEqual([]);
 await act(async()=>fresh.resolve(page([row(4)])));await waitFor(()=>expect(hook.result.current.collections.map(r=>r.id)).toEqual([id(4)]));
});
test('access hint cancels pagination and clears old metadata before a failed authoritative refresh',async()=>{
 const late=deferred();mock.read.mockResolvedValueOnce(page([row(1),row(2)],2)).mockReturnValueOnce(late.promise).mockRejectedValueOnce(new Error('revoked'));
 const hook=renderHook(()=>useReceivedCatalog(input));await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 let pending:Promise<void>;act(()=>{pending=hook.result.current.loadMore();});await act(async()=>{await mock.hint!();});expect(hook.result.current.status).toBe('error');expect(hook.result.current.collections).toEqual([]);
 await act(async()=>{late.resolve(page([row(3)]));await pending;});expect(hook.result.current.collections).toEqual([]);
});
test('recipient label revision change restarts from page one instead of merging scopes',async()=>{
 mock.read.mockResolvedValueOnce(page([row(1),row(2)],2,1)).mockResolvedValueOnce(page([row(3)],null,2)).mockResolvedValueOnce(page([row(4)],null,2));
 const hook=renderHook(()=>useReceivedCatalog(input));await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 await act(async()=>{await hook.result.current.loadMore();});expect(hook.result.current.collections.map(r=>r.id)).toEqual([id(4)]);expect(mock.read.mock.calls[2][1].cursor).toBeNull();
});
test('cursor cycles fail visibly instead of requesting forever',async()=>{
 mock.read.mockResolvedValueOnce(page([row(1),row(2)],2)).mockResolvedValueOnce(page([row(3),row(4)],2));
 const hook=renderHook(()=>useReceivedCatalog(input));await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 await act(async()=>{await hook.result.current.loadMore();});expect(hook.result.current.status).toBe('error');expect(hook.result.current.collections).toEqual([]);
 await act(async()=>{await hook.result.current.loadMore();});expect(mock.read).toHaveBeenCalledTimes(2);
});
test('paused catalog makes no request, clears its rows and revalidates on activation',async()=>{
 mock.read.mockResolvedValue(page([row(1)]));const hook=renderHook(p=>useReceivedCatalog(p),{initialProps:{...input,active:false}});expect(mock.read).not.toHaveBeenCalled();expect(hook.result.current.status).toBe('idle');
 hook.rerender(input);await waitFor(()=>expect(hook.result.current.collections).toHaveLength(1));hook.rerender({...input,active:false});expect(hook.result.current.collections).toEqual([]);
});
test('focus refreshes the first page and unmount aborts the owned request',async()=>{
 const fresh=deferred();mock.read.mockResolvedValueOnce(page([row(1),row(2)],2)).mockReturnValueOnce(fresh.promise);
 const hook=renderHook(()=>useReceivedCatalog(input));await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 act(()=>window.dispatchEvent(new Event('focus')));expect(hook.result.current.collections).toEqual([]);expect(mock.read.mock.calls[1][1].cursor).toBeNull();
 const signal=mock.read.mock.calls[1][2] as AbortSignal;hook.unmount();expect(signal.aborted).toBe(true);await act(async()=>fresh.resolve(page([row(3)])));
});
test('the first render of a replacement account never exposes prior rows before effects run',async()=>{
 const fresh=deferred();mock.read.mockResolvedValueOnce(page([row(1)])).mockReturnValueOnce(fresh.promise);
 const renders:Array<{user:string;ids:string[]}>=[];
 const hook=renderHook(p=>{const result=useReceivedCatalog(p);renders.push({user:p.userId,ids:result.collections.map(r=>r.id)});return result;},{initialProps:input});
 await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 hook.rerender({...input,userId:id(91)});
 expect(renders.filter(r=>r.user===id(91)).every(r=>r.ids.length===0)).toBe(true);
 await act(async()=>fresh.resolve(page([row(2)])));
});
