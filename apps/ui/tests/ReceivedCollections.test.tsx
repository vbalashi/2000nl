import React from 'react';
import {fireEvent,render,screen} from '@testing-library/react';
import {beforeEach,afterEach,expect,test,vi} from 'vitest';
vi.mock('@/lib/collections/sharing/shareCommandClient',async original=>({...await original<typeof import('@/lib/collections/sharing/shareCommandClient')>(),executeShareIntent:vi.fn(async()=>({state:'uncertain'}))}));
const mock=vi.hoisted(()=>({hook:vi.fn(),refresh:vi.fn(),more:vi.fn(),paths:vi.fn(),details:vi.fn()}));
vi.mock('@/lib/platform/platformV2Http',()=>({platformV2AuthenticatedJsonHeaders:vi.fn().mockResolvedValue({})}));
vi.mock('@/lib/platform/platformFetchWithTimeout',()=>({platformFetchWithTimeout:mock.details}));
vi.mock('@/components/library/organization/useReceivedCatalog',()=>({useReceivedCatalog:mock.hook}));
vi.mock('@/components/library/sharing/useCollectionAccessPaths',()=>({useCollectionAccessPaths:mock.paths}));
vi.mock('@/components/library/organization/usePersonalLabels',()=>({usePersonalLabels:()=>({snapshot:null,refresh:vi.fn()})}));
vi.mock('@/components/library/organization/ReceivedCollectionLabels',()=>({ReceivedCollectionLabels:({onSaved}:{onSaved:()=>void})=><div><button onClick={onSaved}>Save labels fixture</button></div>}));
import {ReceivedCollections} from '@/components/library/sharing/ReceivedCollections';
const row={id:'75600000-0000-4000-8000-000000000001',name:'Lesson',itemCount:10,ownerUserId:'private-account-id',labelIds:[],directSubscription:true,groups:[]};
const props={active:true,userId:'reader',locale:'en' as const,onOpen:vi.fn(),onAdd:vi.fn()};
beforeEach(()=>{window.sessionStorage.clear();vi.clearAllMocks();mock.details.mockResolvedValue(Response.json({id:row.id,name:row.name,description:null,source:null,revision:'0',isOwner:false}));mock.paths.mockReturnValue({status:'ready',data:{collectionId:row.id,isOwner:false,directSubscription:true,groups:[]},refresh:vi.fn()});mock.hook.mockReturnValue({status:'ready',collections:[row],nextCursor:null,loadingMore:false,refresh:mock.refresh,loadMore:mock.more});});
afterEach(()=>{vi.unstubAllEnvs();});
test('opens exact collection and does not expose internal owner identity',async()=>{
 render(<ReceivedCollections {...props}/>);expect(screen.queryByText(row.ownerUserId)).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Lesson'}));
 fireEvent.click(await screen.findByRole('button',{name:'View words'}));expect(props.onOpen).toHaveBeenCalledWith(row);
});
test('search and sort are sent to the paginated query, rather than filtering one loaded page',()=>{
 render(<ReceivedCollections {...props}/>);fireEvent.change(screen.getByRole('textbox',{name:'Search collections'}),{target:{value:'Dutch'}});fireEvent.click(screen.getByRole('button',{name:'Sort: Recent'}));fireEvent.click(screen.getByRole('menuitem',{name:'Name'}));
 expect(mock.hook.mock.calls.at(-1)?.[0].query).toMatchObject({query:'Dutch',sort:'name',limit:50});
 expect(screen.getByRole('button',{name:'Sort: Name'})).toHaveFocus();
 expect(screen.getByRole('button',{name:'Sort: Name'})).toHaveAttribute('aria-expanded','false');
});
test('pagination is explicit and single-flight state disables the next-page control',()=>{
 mock.hook.mockReturnValue({status:'ready',collections:[row],nextCursor:{},loadingMore:true});render(<ReceivedCollections {...props}/>);expect(screen.getByRole('button',{name:'Loading…'})).toBeDisabled();
});
test('failed load is not presented as an empty library',()=>{
 mock.hook.mockReturnValue({status:'error',collections:[],nextCursor:null,refresh:mock.refresh});render(<ReceivedCollections {...props}/>);expect(screen.getByRole('alert')).toHaveTextContent('Could not load shared collections');expect(screen.queryByText('No shared collections added')).not.toBeInTheDocument();
});
test('reload recovery remains reachable after the unsubscribed collection disappeared from the catalog',async()=>{
 const {createShareIntent}=await import('@/lib/collections/sharing/shareCommandClient');const {retainUnsubscribeJournal}=await import('@/lib/collections/sharing/unsubscribeJournal');
 retainUnsubscribeJournal(window.sessionStorage,createShareIntent('reader',{operationId:'75600000-0000-4000-8000-000000000002',action:'unsubscribe',collectionId:'75600000-0000-4000-8000-000000000001'}));
 mock.hook.mockReturnValue({status:'ready',collections:[],nextCursor:null,refresh:mock.refresh});render(<ReceivedCollections {...props}/>);
 expect(await screen.findByRole('dialog',{name:'Remove from my library'})).toBeInTheDocument();expect(screen.getByRole('button',{name:'Check result'})).toBeInTheDocument();
});
test('uncertain unsubscribe can be dismissed and explicitly resumed without losing operation',async()=>{
 const {retainUnsubscribeJournal,tabUnsubscribeStore}=await import('@/lib/collections/sharing/unsubscribeJournal');
 const intent={userId:'reader',command:{operationId:'75600000-0000-4000-8000-000000000007',action:'unsubscribe' as const,collectionId:row.id}};
 expect(retainUnsubscribeJournal(tabUnsubscribeStore(),intent)).toBe(true);
 render(<ReceivedCollections {...props}/>);expect(await screen.findByRole('dialog')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 expect(window.sessionStorage.getItem('2000nl.pending-unsubscribe.v1.reader')).toContain(intent.command.operationId);
 fireEvent.click(screen.getByRole('button',{name:'Check result'}));expect(await screen.findByRole('dialog')).toBeInTheDocument();
});

test('a fresh lost-response operation stays dismissed until explicit resume',async()=>{
 render(<ReceivedCollections {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:'More actions · Lesson'}));
 fireEvent.click(screen.getByRole('menuitem',{name:'Remove from my library'}));
 fireEvent.click(screen.getByRole('dialog').querySelector('footer button:last-child')!);
 await screen.findByRole('button',{name:'Check result'});
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Check result'}));expect(await screen.findByRole('dialog')).toBeInTheDocument();
});

test('group-only access offers the group and never a misleading direct unsubscribe',()=>{
 mock.hook.mockReturnValue({status:'ready',collections:[{...row,directSubscription:false,groups:[{labelId:'22222222-2222-4222-8222-222222222222',name:'Easy Dutch'}]}],nextCursor:null});
 vi.stubEnv('NEXT_PUBLIC_LABEL_SHARING_ENABLED','true');
 mock.paths.mockReturnValue({status:'ready',data:{collectionId:row.id,isOwner:false,directSubscription:false,groups:[{labelId:'22222222-2222-4222-8222-222222222222',name:'Easy Dutch'}]},refresh:vi.fn()});
 render(<ReceivedCollections {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:'More actions · Lesson'}));
 expect(screen.queryByRole('menuitem',{name:'Remove from my library'})).toBeNull();
 expect(screen.getByRole('menuitem',{name:'Open group: Easy Dutch'})).toBeInTheDocument();
});
test('direct unsubscribe explains that access through a group survives',()=>{
 vi.stubEnv('NEXT_PUBLIC_LABEL_SHARING_ENABLED','true');
 mock.paths.mockReturnValue({status:'ready',data:{collectionId:row.id,isOwner:false,directSubscription:true,groups:[{labelId:'22222222-2222-4222-8222-222222222222',name:'Easy Dutch'}]},refresh:vi.fn()});
 render(<ReceivedCollections {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:'More actions · Lesson'}));
 fireEvent.click(screen.getByRole('menuitem',{name:'Remove from my library'}));
 expect(screen.getByRole('dialog')).toHaveTextContent('Access remains through these groups: Easy Dutch.');
});

test('workspace selection controls the paginated received query and hides the nested toolbar',()=>{
 const selection={query:'Dutch',sort:'count' as const,searchInputRef:React.createRef<HTMLInputElement>()};
 const view=render(<ReceivedCollections {...props} embedded selection={selection}/>);
 expect(screen.queryByRole('textbox')).toBeNull();expect(screen.queryByRole('button',{name:/^Sort:/})).toBeNull();
 expect(mock.hook).toHaveBeenLastCalledWith(expect.objectContaining({query:{query:'Dutch',sort:'count',scope:'all',labelId:null,limit:50}}));
 view.rerender(<ReceivedCollections {...props} userId="other" embedded selection={{...selection,query:''}}/>);
 expect(mock.hook).toHaveBeenLastCalledWith(expect.objectContaining({userId:'other',query:expect.objectContaining({query:''})}));
});
test('a matching received group suppresses a false search empty state',()=>{
 mock.hook.mockReturnValue({status:'ready',collections:[],nextCursor:null});
 render(<ReceivedCollections {...props} embedded hasGroups selection={{query:'YouTube',sort:'recent',searchInputRef:React.createRef<HTMLInputElement>()}}/>);
 expect(screen.queryByText('No matching collections')).toBeNull();
});

test('direct plus group received access keeps explicit direct and group actions',()=>{
 mock.hook.mockReturnValue({status:'ready',collections:[{...row,groups:[{labelId:'22222222-2222-4222-8222-222222222222',name:'Easy Dutch'}]}],nextCursor:null});
 render(<ReceivedCollections {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:'More actions · Lesson'}));
 expect(screen.getByRole('menuitem',{name:'Remove from my library'})).toBeInTheDocument();
 expect(screen.getByRole('menuitem',{name:'Open group: Easy Dutch'})).toBeInTheDocument();
});
test('a prior reader menu cannot expose actions after account replacement',()=>{
 const view=render(<ReceivedCollections {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:'More actions · Lesson'}));
 view.rerender(<ReceivedCollections {...props} userId="other-reader"/>);
 expect(screen.queryByRole('menuitem',{name:'Remove from my library'})).toBeNull();
});

test('an open reader menu loses direct actions when the latest row becomes group-only',()=>{
 const view=render(<ReceivedCollections {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:'More actions · Lesson'}));
 expect(screen.getByRole('menuitem',{name:'Remove from my library'})).toBeInTheDocument();
 mock.hook.mockReturnValue({status:'ready',collections:[{...row,directSubscription:false,groups:[{labelId:'22222222-2222-4222-8222-222222222222',name:'Easy Dutch'}]}],nextCursor:null});
 view.rerender(<ReceivedCollections {...props}/>);
 expect(screen.queryByRole('menuitem',{name:'Remove from my library'})).toBeNull();
 expect(screen.getByRole('menuitem',{name:'Open group: Easy Dutch'})).toBeInTheDocument();
});

test('saving personal labels leaves received details open',async()=>{
 render(<ReceivedCollections {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Lesson'}));fireEvent.click(await screen.findByRole('button',{name:'Choose labels'}));fireEvent.click(screen.getByRole('button',{name:'Save labels fixture'}));expect(screen.getByRole('button',{name:'View words'})).toBeInTheDocument();
});
test('revoked access closes the personal-label editor and hides collection details',async()=>{
 render(<ReceivedCollections {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Lesson'}));fireEvent.click(await screen.findByRole('button',{name:'Choose labels'}));expect(screen.getByRole('button',{name:'Save labels fixture'})).toBeInTheDocument();
 mock.details.mockResolvedValueOnce(Response.json({error:'details_unavailable'},{status:404}));fireEvent.focus(window);
 await screen.findByText('Collection organization is not available yet.');expect(screen.queryByRole('button',{name:'Save labels fixture'})).toBeNull();expect(screen.queryByRole('button',{name:'View words'})).toBeNull();
});
