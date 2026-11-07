import React from 'react';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,it,expect,vi} from 'vitest';
import * as client from '@/lib/collections/sharing/labelSharingClient';
import {SharedResourceInvitation} from '@/components/library/sharing/SharedResourceInvitation';
import type {SharedResourcePreview} from '@/lib/collections/sharing/labelSharingContract';

vi.mock('@/lib/collections/sharing/labelSharingClient',async()=>({...await vi.importActual<typeof client>('@/lib/collections/sharing/labelSharingClient'),previewSharedResource:vi.fn(),executeLabelShareIntent:vi.fn(),reconcileLabelShareIntent:vi.fn()}));
vi.mock('@/components/library/sharing/InvitationPreview',()=>({InvitationPreview:()=> <div data-testid="collection-invitation"/>}));
const code='0123456789ABCDEFGHJKMNPQRS',labelId='22222222-2222-4222-8222-222222222222';
const preview:SharedResourcePreview={kind:'label',preview:{labelId,name:'Easy Dutch',collectionCount:2,alreadyAdded:false,role:null}};
const props=()=>({userId:'owner',code,locale:'en',onClose:vi.fn(),onOpen:vi.fn(),onOpenLabel:vi.fn(),onConfirmed:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();});

it('preview does not subscribe; an explicit Add is verified before opening the group',async()=>{
 const callbacks=props();
 vi.mocked(client.previewSharedResource).mockResolvedValueOnce(preview).mockResolvedValue({...preview,preview:{...preview.preview,alreadyAdded:true,role:'viewer'}});
 vi.mocked(client.executeLabelShareIntent).mockImplementation(async intent=>({operationId:intent.command.operationId,status:'committed',action:'accept',result:{...preview.preview,alreadyAdded:true,role:'viewer'}}));
 render(<SharedResourceInvitation {...callbacks}/>);
 await screen.findByRole('button',{name:'Add to library'});
 expect(client.executeLabelShareIntent).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Add to library'}));
 await screen.findByRole('button',{name:'Open group'});
 expect(callbacks.onConfirmed).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'Open group'}));
 expect(callbacks.onOpenLabel).toHaveBeenCalledWith(labelId,'Easy Dutch');
});

it('keeps collection invitations on their existing acceptance flow',async()=>{
 vi.mocked(client.previewSharedResource).mockResolvedValue({kind:'collection',preview:{}} as SharedResourcePreview);
 render(<SharedResourceInvitation {...props()}/>);
 await screen.findByTestId('collection-invitation');
 expect(client.executeLabelShareIntent).not.toHaveBeenCalled();
});

it('does not display a delayed invitation from the previous account',async()=>{
 let resolve!:(value:SharedResourcePreview)=>void;
 vi.mocked(client.previewSharedResource).mockImplementationOnce(()=>new Promise(done=>{resolve=done;})).mockResolvedValue({...preview,preview:{...preview.preview,name:'Current group'}});
 const callbacks=props(),view=render(<SharedResourceInvitation {...callbacks}/>);
 view.rerender(<SharedResourceInvitation {...callbacks} userId="viewer"/>);
 await screen.findByRole('heading',{name:'Current group'});
 await act(async()=>{resolve(preview);});
 await waitFor(()=>expect(screen.queryByRole('heading',{name:'Easy Dutch'})).toBeNull());
 expect(client.executeLabelShareIntent).not.toHaveBeenCalled();
});
