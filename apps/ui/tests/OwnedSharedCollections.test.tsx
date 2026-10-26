import React from 'react';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({catalog:vi.fn(),management:vi.fn(),dialog:vi.fn(),clipboard:vi.fn()}));
vi.mock('@/components/library/sharing/useOwnedSharedCatalog',()=>({useOwnedSharedCatalog:mock.catalog}));
vi.mock('@/lib/collections/sharing/shareManagementClient',()=>({readCollectionShareManagement:mock.management}));
vi.mock('@/lib/collections/sharing/ownerShareJournal',()=>({ownerShareStore:()=>null,readOwnerShareJournal:()=>null}));
vi.mock('@/components/practice/ui/ActionMenu',()=>({ActionMenu:({items}:{items:Array<{label:string;onSelect:()=>void}>})=><div>{items.map(item=><button key={item.label} onClick={item.onSelect}>{item.label}</button>)}</div>}));
vi.mock('@/components/library/sharing/OwnedCollectionSharing',()=>({OwnedCollectionSharing:(props:{onClose:()=>void})=>{mock.dialog(props);return <div data-testid="owner-dialog"><button onClick={props.onClose}>Close management</button></div>;}}));
import {OwnedSharedCollections} from '@/components/library/sharing/OwnedSharedCollections';
const id='75600000-0000-4000-8000-000000000001',code='A'.repeat(26);
const row={id,name:'At the market',createdAt:'2026-01-01T00:00:00Z',itemCount:3,subscriberCount:12};
const props={userId:'owner',active:true,locale:'en' as const,onOpen:vi.fn(),onChanged:vi.fn()};
beforeEach(()=>{
 vi.clearAllMocks();mock.catalog.mockReturnValue({status:'ready',collections:[row],nextCursor:null,loadingMore:false,refresh:vi.fn(),loadMore:vi.fn()});
 mock.management.mockResolvedValue({collectionId:id,isOpen:true,revision:1,invitationCode:code,subscriberCount:12});
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:mock.clipboard}});mock.clipboard.mockResolvedValue(undefined);
});
test('catalog is code-free until the owner explicitly copies a fresh link',async()=>{
 render(<OwnedSharedCollections {...props}/>);
 expect(screen.getByText('At the market')).toBeInTheDocument();expect(screen.getByText('12')).toBeInTheDocument();
 expect(mock.management).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Copy link'}));
 await waitFor(()=>expect(mock.clipboard).toHaveBeenCalledWith(`${window.location.origin}/share#${code}`));
 expect(mock.management).toHaveBeenCalledWith('owner',id,expect.any(AbortSignal));
});
test('switching accounts before management returns cannot copy a prior owner invitation',async()=>{
 let resolve!:(value:unknown)=>void;mock.management.mockReturnValueOnce(new Promise(r=>resolve=r));
 const view=render(<OwnedSharedCollections {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Copy link'}));
 view.rerender(<OwnedSharedCollections {...props} userId="other"/>);resolve({collectionId:id,isOpen:true,revision:1,invitationCode:code,subscriberCount:12});
 await waitFor(()=>expect(mock.management).toHaveBeenCalledOnce());expect(mock.clipboard).not.toHaveBeenCalled();expect(screen.queryByTestId('owner-dialog')).not.toBeInTheDocument();
});
test('stop sharing opens the accepted owner confirmation path',()=>{
 render(<OwnedSharedCollections {...props}/>);fireEvent.click(screen.getByRole('button',{name:'More actions · At the market'}));fireEvent.click(screen.getByRole('button',{name:'Stop sharing'}));
 expect(mock.dialog).toHaveBeenCalledWith(expect.objectContaining({userId:'owner',collectionId:id,initialAction:'close'}));
});
test('closing management restores focus to search when the refreshed row disappears',async()=>{
 mock.catalog.mockImplementation(()=>{const [rows,setRows]=React.useState([row]);return {status:'ready',collections:rows,nextCursor:null,loadingMore:false,loadMore:vi.fn(),refresh:async()=>setRows([])};});
 render(<OwnedSharedCollections {...props}/>);fireEvent.click(screen.getByRole('button',{name:'More actions · At the market'}));fireEvent.click(screen.getByRole('button',{name:'Stop sharing'}));
 fireEvent.click(screen.getByRole('button',{name:'Close management'}));
 await waitFor(()=>expect(screen.queryByText('At the market')).not.toBeInTheDocument());
 expect(screen.getByRole('textbox')).toHaveFocus();
});
