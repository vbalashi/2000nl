import {renderHook,waitFor} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/lib/collections/sharing/publicationBadgesClient',()=>({readOwnedPublicationBadges:mock.read}));
vi.mock('@/lib/events/userEventHints',()=>({useUserEventHints:()=>{}}));
import {useOwnedPublicationBadges} from '@/components/library/organization/useOwnedPublicationBadges';
const id=(number:number)=>`75600000-0000-4000-8000-${String(number).padStart(12,'0')}`;
beforeEach(()=>{vi.resetAllMocks();mock.read.mockImplementation(async(_user,ids:string[])=>ids.slice(0,1));});
test('201 visible rows use three bounded reads, with no per-row requests',async()=>{
 const ids=Array.from({length:201},(_,index)=>id(index+1));
 const hook=renderHook(()=>useOwnedPublicationBadges('owner',true,ids));
 await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 expect(mock.read.mock.calls.map(call=>call[1].length)).toEqual([100,100,1]);expect(hook.result.current.openIds?.size).toBe(3);
});
test('account switch hides the prior account status synchronously and aborts its request',async()=>{
 let resolve!:(ids:string[])=>void;mock.read.mockReturnValueOnce(new Promise(r=>resolve=r)).mockResolvedValueOnce([]);
 const hook=renderHook(props=>useOwnedPublicationBadges(props.user,true,[id(1)]),{initialProps:{user:'first'}});
 const priorSignal=mock.read.mock.calls[0][2];hook.rerender({user:'second'});
 expect(hook.result.current.openIds).toBeNull();expect(priorSignal.aborted).toBe(true);resolve([id(1)]);
 await waitFor(()=>expect(hook.result.current.status).toBe('ready'));expect(hook.result.current.openIds?.size).toBe(0);
});
