import React from 'react';
import {beforeAll,beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,within} from '@testing-library/react';
import {PersonalCollections} from '@/components/library/organization/PersonalCollections';
import * as client from '@/lib/collections/sharing/labelSharingClient';
import * as copies from '@/lib/collections/sharing/collectionBorrowedCopyClient';

const labelId='22222222-2222-4222-8222-222222222222';
vi.mock('@/components/library/organization/usePersonalLabels',()=>({usePersonalLabels:()=>({snapshot:{revision:1,labels:[{id:'22222222-2222-4222-8222-222222222222',name:'Easy Dutch',parent_id:null}],assignments:[]},error:null,loading:false,busy:false,refresh:vi.fn(),mutate:vi.fn()})}));
vi.mock('@/components/library/sharing/useLabelSharingCatalog',()=>({useLabelSharingCatalog:()=>({status:'ready',data:{owned:[],received:[]},refresh:vi.fn()})}));
vi.mock('@/lib/collections/sharing/labelSharingClient',async()=>({...await vi.importActual<typeof client>('@/lib/collections/sharing/labelSharingClient'),readLabelShareState:vi.fn(),executeLabelShareIntent:vi.fn(),reconcileLabelShareIntent:vi.fn(),preflightLabelShare:vi.fn()}));
vi.mock('@/lib/collections/sharing/collectionBorrowedCopyClient',async()=>({...await vi.importActual<typeof copies>('@/lib/collections/sharing/collectionBorrowedCopyClient'),previewCollectionBorrowedCopy:vi.fn(),submitCollectionBorrowedCopy:vi.fn()}));
beforeAll(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};});
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();vi.mocked(client.preflightLabelShare).mockResolvedValue({labelId,collections:[]});vi.stubEnv('NEXT_PUBLIC_LABEL_SHARING_ENABLED','true');vi.stubEnv('NEXT_PUBLIC_COLLECTION_SHARING_ENABLED','false');});
afterEach(()=>{vi.unstubAllEnvs();});

it('opens label management from its menu and publishes only after the live-audience confirmation',async()=>{
 const closed={labelId,isOpen:false,revision:0,invitationCode:null,subscriberCount:0};
 vi.mocked(client.readLabelShareState).mockResolvedValue(closed);
 vi.mocked(client.executeLabelShareIntent).mockResolvedValue(null);
 render(<PersonalCollections active userId="owner" language="nl" locale="en" collections={[]} onReload={vi.fn()} onOpen={vi.fn()}/>);
 fireEvent.click(await screen.findByRole('button',{name:'More actions: Easy Dutch'}));
 fireEvent.click(screen.getByRole('menuitem',{name:'Share'}));
 const dialog=await screen.findByRole('dialog',{name:'Share label'});
 fireEvent.click(await within(dialog).findByRole('button',{name:'Create view-only link'}));
 expect(dialog).toHaveTextContent('current and future collections');
 expect(client.executeLabelShareIntent).not.toHaveBeenCalled();
 fireEvent.click(within(dialog).getByRole('button',{name:'Confirm'}));
 await within(dialog).findByRole('button',{name:'Check result'});
 expect(client.executeLabelShareIntent).toHaveBeenCalledWith(expect.objectContaining({userId:'owner',command:expect.objectContaining({action:'open',labelId,expectedRevision:0})}),expect.any(AbortSignal));
});

it('requires an explicit independent copy before publishing a label containing borrowed entries',async()=>{
 const listId='33333333-3333-4333-8333-333333333333';
 vi.mocked(client.readLabelShareState).mockResolvedValue({labelId,isOpen:false,revision:0,invitationCode:null,subscriberCount:0});
 vi.mocked(client.preflightLabelShare).mockResolvedValue({labelId,collections:[{collectionId:listId,name:'Borrowed lesson',borrowedCount:1}]});
 vi.mocked(copies.previewCollectionBorrowedCopy).mockResolvedValue({listId,revision:'a'.repeat(64),borrowedCount:1,canCopy:true});
 vi.mocked(copies.submitCollectionBorrowedCopy).mockImplementation(async(_userId,command)=>({operationId:command.operationId,listId,status:'completed',copiedCount:1}));
 render(<PersonalCollections active userId="owner" language="nl" locale="en" collections={[]} onReload={vi.fn()} onOpen={vi.fn()}/>);
 fireEvent.click(await screen.findByRole('button',{name:'More actions: Easy Dutch'}));fireEvent.click(screen.getByRole('menuitem',{name:'Share'}));
 const sharing=await screen.findByRole('dialog',{name:'Share label'});fireEvent.click(await within(sharing).findByRole('button',{name:'Create view-only link'}));fireEvent.click(within(sharing).getByRole('button',{name:'Confirm'}));
 const dialog=await screen.findByRole('dialog',{name:'Prepare independent copies'});
 expect(client.executeLabelShareIntent).not.toHaveBeenCalled();expect(copies.submitCollectionBorrowedCopy).not.toHaveBeenCalled();
 fireEvent.click(await within(dialog).findByRole('button',{name:'Copy'}));
 await within(dialog).findByText('Copy created');
 expect(copies.submitCollectionBorrowedCopy).toHaveBeenCalledTimes(1);
 expect(client.executeLabelShareIntent).not.toHaveBeenCalled();
});
