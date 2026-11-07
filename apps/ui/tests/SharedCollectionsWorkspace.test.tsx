import React from 'react';
import {fireEvent,render,screen} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({overview:vi.fn(),owned:vi.fn(),received:vi.fn(),groups:vi.fn()}));
vi.mock('@/components/library/sharing/useSharingOverview',()=>({useSharingOverview:mock.overview}));
vi.mock('@/components/library/sharing/OwnedSharedCollections',()=>({OwnedSharedCollections:(props:unknown)=>{mock.owned(props);return <div>Owned list</div>;}}));
vi.mock('@/components/library/sharing/ReceivedCollections',()=>({ReceivedCollections:(props:unknown)=>{mock.received(props);return <div>Received list</div>;}}));
vi.mock('@/components/library/sharing/useLabelSharingCatalog',()=>({useLabelSharingCatalog:mock.groups}));
vi.mock('@/components/library/sharing/SharedLabelGroups',()=>({SharedLabelGroups:({groups}:{groups:Array<{labelId:string;name:string}>})=><div data-testid="groups">{groups.map(group=><div key={group.labelId}>{group.name}</div>)}</div>}));
vi.mock('@/components/practice/ui/ActionMenu',()=>({ActionMenu:({items}:{items:Array<{id:string;label:string;onSelect:()=>void}>})=><div role="menu">{items.map(item=><button role="menuitem" key={item.id} onClick={item.onSelect}>{item.label}</button>)}</div>}));
import {SharedCollectionsWorkspace} from '@/components/library/sharing/SharedCollectionsWorkspace';
const base={userId:'owner',active:true,locale:'en' as const,onViewChange:vi.fn(),onOpenOwned:vi.fn(),onOpenReceived:vi.fn(),onAdd:vi.fn()};
beforeEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();mock.groups.mockReturnValue({status:'ready',data:{owned:[],received:[]},refresh:vi.fn()});mock.overview.mockReturnValue({status:'ready',data:{sharedByMe:12,addedByMe:4},refresh:vi.fn()});});
test('accepted Shared layout shows both counts, one Add action and selected collection list',()=>{
 const view=render(<SharedCollectionsWorkspace {...base} view="owned"/>);
 expect(screen.getByRole('button',{name:'Shared by me · 12'})).toHaveAttribute('aria-pressed','true');expect(screen.getByRole('button',{name:'Added by me · 4'})).toHaveAttribute('aria-pressed','false');
 expect(screen.getByText('Owned list')).toBeInTheDocument();expect(screen.getAllByRole('button',{name:'Add by link / code'})).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Added by me · 4'}));expect(base.onViewChange).toHaveBeenCalledWith('received');
 view.rerender(<SharedCollectionsWorkspace {...base} view="received"/>);expect(screen.getByText('Received list')).toBeInTheDocument();expect(mock.received).toHaveBeenCalledWith(expect.objectContaining({embedded:true}));
});

test.each(['owned','received'] as const)('one toolbar precedes %s groups and sends the same query to collections',view=>{
 vi.stubEnv('NEXT_PUBLIC_LABEL_SHARING_ENABLED','true');
 mock.groups.mockReturnValue({status:'ready',data:{owned:[{labelId:'1',name:'YouTube',isOpen:true},{labelId:'2',name:'Books',isOpen:true}],received:[{labelId:'3',name:'YouTube lessons'},{labelId:'4',name:'Books'}]},refresh:vi.fn()});
 const rendered=render(<SharedCollectionsWorkspace {...base} view={view}/>);
 const search=screen.getByRole('textbox',{name:'Search groups and collections'});
 expect(screen.getAllByRole('textbox')).toHaveLength(1);
 expect(search.compareDocumentPosition(screen.getByTestId('groups'))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 fireEvent.change(search,{target:{value:'  YOUTUBE  '}});
 expect(screen.queryByText('Books')).toBeNull();
 expect(screen.getByText(view==='owned'?'YouTube':'YouTube lessons')).toBeInTheDocument();
 expect((view==='owned'?mock.owned:mock.received)).toHaveBeenLastCalledWith(expect.objectContaining({selection:expect.objectContaining({query:'  YOUTUBE  ',sort:'recent'}),hasGroups:true}));
 expect(screen.getByRole('button',{name:'Shared by me · 14'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Added by me · 6'})).toBeInTheDocument();
 rendered.rerender(<SharedCollectionsWorkspace {...base} userId="other" view={view}/>);
 expect(screen.getByRole('textbox')).toHaveValue('');
 expect((view==='owned'?mock.owned:mock.received)).toHaveBeenLastCalledWith(expect.objectContaining({userId:'other',selection:expect.objectContaining({query:''})}));
});
test('name sorting orders groups and controls collection sort without fabricating recent dates',()=>{
 vi.stubEnv('NEXT_PUBLIC_LABEL_SHARING_ENABLED','true');
 mock.groups.mockReturnValue({status:'ready',data:{owned:[{labelId:'1',name:'YouTube',isOpen:true},{labelId:'2',name:'Books',isOpen:true}],received:[]},refresh:vi.fn()});
 render(<SharedCollectionsWorkspace {...base} view="owned"/>);
 expect(screen.getByTestId('groups')).toHaveTextContent('YouTubeBooks');
 fireEvent.click(screen.getByRole('button',{name:'Sort: Recent'}));fireEvent.click(screen.getByRole('menuitem',{name:'Name'}));
 expect(screen.getByTestId('groups')).toHaveTextContent('BooksYouTube');
 expect(mock.owned).toHaveBeenLastCalledWith(expect.objectContaining({selection:expect.objectContaining({sort:'name'})}));
 fireEvent.click(screen.getByRole('button',{name:'Sort: Name'}));fireEvent.click(screen.getByRole('menuitem',{name:'Recent'}));
 expect(screen.getByTestId('groups')).toHaveTextContent('YouTubeBooks');
});
