import {act,renderHook,waitFor} from '@testing-library/react';
import {expect,test,vi} from 'vitest';
const read=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/collections/sharing/ownedCatalogClient',()=>({readOwnedSharedCatalog:read}));
vi.mock('@/lib/events/userEventHints',()=>({useUserEventHints:()=>{}}));
import {useOwnedSharedCatalog} from '@/components/library/sharing/useOwnedSharedCatalog';
test('focus reconciliation retains rows until its replacement arrives',async()=>{
 const row={id:'75600000-0000-4000-8000-000000000001',name:'Lesson',createdAt:'2026-01-01T00:00:00Z',itemCount:1,subscriberCount:1,directPublication:true,groups:[]};
 let finish!:(page:unknown)=>void;
 read.mockResolvedValueOnce({collections:[row],nextCursor:null}).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
 const hook=renderHook(()=>useOwnedSharedCatalog({userId:'owner',active:true,query:{query:'',sort:'recent',limit:50}}));
 await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 act(()=>window.dispatchEvent(new Event('focus')));
 expect(hook.result.current.status).toBe('ready');expect(hook.result.current.collections).toEqual([row]);
 await act(async()=>finish({collections:[{...row,name:'Updated'}],nextCursor:null}));
 await waitFor(()=>expect(hook.result.current.collections[0].name).toBe('Updated'));
});
