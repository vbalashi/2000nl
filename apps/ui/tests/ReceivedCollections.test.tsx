import React from 'react';
import {fireEvent,render,screen} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
vi.mock('@/lib/collections/sharing/shareCommandClient',async original=>({...await original<typeof import('@/lib/collections/sharing/shareCommandClient')>(),executeShareIntent:vi.fn(async()=>({state:'uncertain'}))}));
const mock=vi.hoisted(()=>({hook:vi.fn(),refresh:vi.fn(),more:vi.fn()}));
vi.mock('@/components/library/organization/useReceivedCatalog',()=>({useReceivedCatalog:mock.hook}));
import {ReceivedCollections} from '@/components/library/sharing/ReceivedCollections';
const row={id:'75600000-0000-4000-8000-000000000001',name:'Lesson',itemCount:10,ownerUserId:'private-account-id'};
const props={active:true,userId:'reader',locale:'en' as const,onOpen:vi.fn(),onAdd:vi.fn()};
beforeEach(()=>{window.sessionStorage.clear();vi.clearAllMocks();mock.hook.mockReturnValue({status:'ready',collections:[row],nextCursor:null,loadingMore:false,refresh:mock.refresh,loadMore:mock.more});});
test('opens exact collection and does not expose internal owner identity',()=>{
 render(<ReceivedCollections {...props}/>);expect(screen.queryByText(row.ownerUserId)).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'View words'}));expect(props.onOpen).toHaveBeenCalledWith(row);
});
test('search and sort are sent to the paginated query, rather than filtering one loaded page',()=>{
 render(<ReceivedCollections {...props}/>);fireEvent.change(screen.getByRole('textbox',{name:'Search collections'}),{target:{value:'Dutch'}});fireEvent.change(screen.getByRole('combobox',{name:'Sort'}),{target:{value:'name'}});
 expect(mock.hook.mock.calls.at(-1)?.[0].query).toMatchObject({query:'Dutch',sort:'name',limit:50});
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
