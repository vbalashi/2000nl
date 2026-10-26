import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({read:vi.fn(),write:vi.fn()}));
vi.mock('@/lib/collections/sharing/receivedLabelsClient',()=>({readReceivedLabels:mock.read,writeReceivedLabels:mock.write,ReceivedLabelsError:class extends Error{constructor(readonly kind:string){super(kind);}}}));
import {useReceivedLabelEditor} from '@/components/library/organization/useReceivedLabelEditor';
const id='75600000-0000-4000-8000-000000000001',label='75600000-0000-4000-8000-000000000002';
const state=(revision=1,labelIds:string[]=[])=>({collectionId:id,catalog:{revision,labels:[{id:label,name:'YouTube',parent_id:null,description:null,created_at:'2026-01-01',updated_at:'2026-01-01'}],assignments:[]},labelIds});
beforeEach(()=>{vi.resetAllMocks();mock.read.mockResolvedValue(state());mock.write.mockResolvedValue({collectionId:id,revision:2,labelIds:[label]});});
test('lost save response is checked read-only without a second write',async()=>{
 mock.write.mockRejectedValueOnce(new Error('lost response'));mock.read.mockResolvedValueOnce(state()).mockResolvedValueOnce(state(2,[label]));
 const hook=renderHook(()=>useReceivedLabelEditor('reader',id));await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 act(()=>hook.result.current.toggle(label));await act(async()=>hook.result.current.save());expect(hook.result.current.status).toBe('uncertain');expect(mock.write).toHaveBeenCalledOnce();
 await act(async()=>hook.result.current.check());expect(hook.result.current.status).toBe('saved');expect(mock.write).toHaveBeenCalledOnce();
});
test('a failed check preserves an empty desired set through reload and requires review on conflict',async()=>{
 mock.read.mockResolvedValueOnce(state(1,[label])).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(state(3,[label]));mock.write.mockRejectedValueOnce(new Error('unknown'));
 const hook=renderHook(()=>useReceivedLabelEditor('reader',id));await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 act(()=>hook.result.current.toggle(label));await act(async()=>hook.result.current.save());await act(async()=>hook.result.current.check());expect(hook.result.current.status).toBe('error');
 await act(async()=>hook.result.current.reload());expect(hook.result.current.status).toBe('conflict');expect(hook.result.current.selected).toEqual([]);expect(hook.result.current.data?.catalog.revision).toBe(3);expect(mock.write).toHaveBeenCalledOnce();
});
test('account switch aborts read and cannot display late prior labels',async()=>{
 let resolve!:(value:unknown)=>void;mock.read.mockReturnValueOnce(new Promise(r=>resolve=r)).mockResolvedValueOnce(state(4,[]));
 const hook=renderHook(props=>useReceivedLabelEditor(props.user,id),{initialProps:{user:'first'}});const signal=mock.read.mock.calls[0][2];hook.rerender({user:'second'});
 expect(hook.result.current.data).toBeNull();expect(signal.aborted).toBe(true);await act(async()=>resolve(state(1,[label])));
 await waitFor(()=>expect(hook.result.current.status).toBe('ready'));expect(hook.result.current.selected).toEqual([]);
});
