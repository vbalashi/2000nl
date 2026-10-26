import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('@/lib/collections/sharing/receivedSourceClient',()=>({readReceivedSource:mock.read}));
vi.mock('@/lib/events/userEventHints',()=>({useUserEventHints:()=>{}}));
import {useReceivedSource} from '@/components/library/sharing/useReceivedSource';
const id='75600000-0000-4000-8000-000000000001';
beforeEach(()=>{vi.resetAllMocks();mock.read.mockResolvedValue({id,name:'Anna lesson',createdAt:'2026-01-01T00:00:00Z'});});
test('focus rereads current name and hides stale data until completion',async()=>{
 const hook=renderHook(()=>useReceivedSource('reader',id,true));await waitFor(()=>expect(hook.result.current.source?.name).toBe('Anna lesson'));
 let settle!:(value:null)=>void;mock.read.mockReturnValueOnce(new Promise(resolve=>settle=resolve));
 act(()=>window.dispatchEvent(new Event('focus')));expect(hook.result.current.source).toBeNull();settle(null);
 await waitFor(()=>expect(hook.result.current.status).toBe('ready'));expect(hook.result.current.source).toBeNull();
});
test('account change hides and cancels an in-flight source',async()=>{
 let settle!:(value:unknown)=>void;mock.read.mockReturnValueOnce(new Promise(resolve=>settle=resolve)).mockResolvedValueOnce(null);
 const hook=renderHook(props=>useReceivedSource(props.user,id,true),{initialProps:{user:'first'}});
 const signal=mock.read.mock.calls[0][2];hook.rerender({user:'second'});
 expect(hook.result.current.source).toBeNull();expect(signal.aborted).toBe(true);settle({id,name:'Old',createdAt:'2026-01-01T00:00:00Z'});
 await waitFor(()=>expect(hook.result.current.status).toBe('ready'));expect(hook.result.current.source).toBeNull();
});
