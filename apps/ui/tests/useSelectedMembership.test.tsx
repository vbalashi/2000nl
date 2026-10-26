import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/lib/collections/sharing/selectedMembership',()=>({readSelectedMembership:mock.read}));
vi.mock('@/lib/events/userEventHints',()=>({useUserEventHints:()=>{}}));
import {useSelectedMembership} from '@/components/library/sharing/useSelectedMembership';
const id='75600000-0000-4000-8000-000000000001',entry='75600000-0000-4000-8000-000000000002';
beforeEach(()=>{vi.resetAllMocks();mock.read.mockResolvedValue([entry]);});
test('account and collection switches discard late membership, including same headword',async()=>{
 let settle!:(value:string[])=>void;mock.read.mockReturnValueOnce(new Promise(resolve=>settle=resolve)).mockResolvedValueOnce([]);
 const hook=renderHook(props=>useSelectedMembership(props.user,props.id,[entry],'detail',true),{initialProps:{user:'first',id}});
 const signal=mock.read.mock.calls[0][3];hook.rerender({user:'second',id:entry});expect(hook.result.current.source).toBeNull();expect(signal.aborted).toBe(true);
 await act(async()=>settle([entry]));await waitFor(()=>expect(hook.result.current.status).toBe('ready'));expect(hook.result.current.source).toEqual([]);
});
test('failed refresh removes previous inclusion and never becomes a known empty set',async()=>{
 const hook=renderHook(()=>useSelectedMembership('reader',id,[entry],'detail',true));await waitFor(()=>expect(hook.result.current.source).toEqual([entry]));mock.read.mockRejectedValueOnce(Error('unavailable'));
 await act(async()=>hook.result.current.refresh());expect(hook.result.current.status).toBe('error');expect(hook.result.current.source).toBeNull();
});
