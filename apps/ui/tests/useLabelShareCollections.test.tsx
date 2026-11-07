import {act,renderHook,waitFor} from '@testing-library/react';
import {beforeEach,it,expect,vi} from 'vitest';
import {useLabelShareCollections} from '@/components/library/sharing/useLabelShareCollections';
import * as client from '@/lib/collections/sharing/labelSharingClient';
import type {LabelShareCollectionsPage} from '@/lib/collections/sharing/labelSharingContract';
vi.mock('@/lib/collections/sharing/labelSharingClient',()=>({readLabelShareCollections:vi.fn(),readLabelShareReferences:vi.fn()}));
vi.mock('@/lib/events/userEventHints',()=>({useUserEventHints:vi.fn()}));
const labelId='11111111-1111-4111-8111-111111111111',collectionId='22222222-2222-4222-8222-222222222222';
const page:LabelShareCollectionsPage={labelId,collections:[{collectionId,name:'Lesson'}],nextCursor:null};
beforeEach(()=>{vi.clearAllMocks();vi.mocked(client.readLabelShareCollections).mockResolvedValue(page);vi.mocked(client.readLabelShareReferences).mockResolvedValue({labelId,references:[{collectionId:'33333333-3333-4333-8333-333333333333',name:'Original',invitationCode:'A'.repeat(26)}]});});
it('keeps own collections and original invitations separate, without accepting any invitation',async()=>{
 const hook=renderHook(()=>useLabelShareCollections('owner',labelId));await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 expect(hook.result.current.page?.collections).toEqual(page.collections);expect(hook.result.current.references[0].name).toBe('Original');
});
it('retains ready rows during a same-scope refresh, then clears them on authoritative failure',async()=>{
 const hook=renderHook(()=>useLabelShareCollections('owner',labelId));await waitFor(()=>expect(hook.result.current.status).toBe('ready'));
 let reject!:(error:Error)=>void;vi.mocked(client.readLabelShareCollections).mockReturnValue(new Promise((_,fail)=>{reject=fail;}));
 act(()=>hook.result.current.refresh());expect(hook.result.current.status).toBe('ready');expect(hook.result.current.page?.collections).toHaveLength(1);
 await act(async()=>reject(Error('revoked')));expect(hook.result.current.status).toBe('error');expect(hook.result.current.page).toBeNull();expect(hook.result.current.references).toEqual([]);
});
it('does not expose a delayed group result after an account change',async()=>{
 let resolve!:(value:LabelShareCollectionsPage)=>void;vi.mocked(client.readLabelShareCollections).mockReturnValueOnce(new Promise(done=>{resolve=done;}));
 const hook=renderHook(({user})=>useLabelShareCollections(user,labelId),{initialProps:{user:'owner'}});
 vi.mocked(client.readLabelShareCollections).mockResolvedValue({...page,collections:[]});vi.mocked(client.readLabelShareReferences).mockResolvedValue({labelId,references:[]});hook.rerender({user:'other'});
 await waitFor(()=>expect(hook.result.current.status).toBe('ready'));await act(async()=>resolve(page));
 expect(hook.result.current.page?.collections).toEqual([]);expect(hook.result.current.references).toEqual([]);
});
