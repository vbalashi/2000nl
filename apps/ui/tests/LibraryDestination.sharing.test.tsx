import React from 'react';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {useCollectionSelectionScope} from '@/components/library/sharing/CollectionSelectionContext';
const mock=vi.hoisted(()=>({pick:null as null|((row:any)=>void),search:vi.fn(),source:null as null|{id:string;name:string;createdAt:string}}));
vi.mock('@/components/library/sharing/useReceivedSource',()=>({useReceivedSource:(_user:string,id:string|null)=>({source:id===mock.source?.id?mock.source:null,status:'ready'})}));
vi.mock('@/components/library/organization/PersonalCollections',()=>({PersonalCollections:()=>null}));
vi.mock('@/components/library/sharing/SharedCollectionsWorkspace',()=>({SharedCollectionsWorkspace:({onOpenReceived,onOpenOwned,onAdd}:{onOpenReceived:(r:unknown)=>void;onOpenOwned:(r:unknown)=>void;onAdd:()=>void})=><><button onClick={()=>onOpenReceived({id:'received',name:'Anna lesson',itemCount:2,createdAt:'2026-01-01T00:00:00Z'})}>Open received lesson</button><button onClick={()=>onOpenOwned({id:'own',name:'Mine',itemCount:1,createdAt:'2026-01-01T00:00:00Z'})}>Open own lesson</button><button onClick={onAdd}>Add invitation</button></>}));
vi.mock('@/components/library/sharing/InvitationPreview',()=>({InvitationPreview:()=>null}));
vi.mock('@/components/training/wordlist/DictionarySearchTab',()=>({createDictionarySearchTabState:()=>({query:'',dictionaryId:null,partsOfSpeech:[]}),DictionarySearchTab:(props:unknown)=>{mock.pick=useCollectionSelectionScope()?.onBrowseSelected??null;mock.search(props);return <div data-testid="words"/>;}}));
import {LibraryDestination} from '@/components/navigation/LibraryDestination';
const own={id:'own',name:'Mine',type:'user' as const};
const props={userId:'reader',open:true,language:'nl',translationLang:'en',interfaceLanguage:'en' as const,lists:[own],activeList:own,onReloadLists:vi.fn()};
beforeEach(()=>{vi.stubEnv('NEXT_PUBLIC_COLLECTION_SHARING_ENABLED','true');vi.clearAllMocks();mock.source=null;});
afterEach(()=>{vi.unstubAllEnvs();});
test('shared tab survives without an active invitation and opens collection through fresh Words filters',()=>{
 mock.source={id:'received',name:'Anna lesson',createdAt:'2026-01-01T00:00:00Z'};
 render(<LibraryDestination {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Shared'}));fireEvent.click(screen.getByRole('button',{name:'Open received lesson'}));
 const last=mock.search.mock.calls.at(-1)?.[0];expect(last.searchState).toMatchObject({collectionId:'received',applyListFilter:true,dictionaryId:null,partsOfSpeech:[]});expect(last.collections).toContainEqual(expect.objectContaining({id:'received',name:'Anna lesson'}));expect(last.userLists).toEqual([own]);
});
test('a selected source loses its caption when the authoritative read no longer grants it',()=>{
 mock.source={id:'received',name:'Anna lesson',createdAt:'2026-01-01T00:00:00Z'};
 const view=render(<LibraryDestination {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Shared'}));fireEvent.click(screen.getByRole('button',{name:'Open received lesson'}));
 mock.source=null;view.rerender(<LibraryDestination {...props} lists={[...props.lists]}/>);
 expect(mock.search.mock.calls.at(-1)?.[0].collections).toEqual([own]);
});
test('a received-source draft is not carried across accounts',()=>{
 const view=render(<LibraryDestination {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Shared'}));fireEvent.click(screen.getByRole('button',{name:'Open received lesson'}));
 view.rerender(<LibraryDestination {...props} userId="other"/>);expect(mock.search.mock.calls.at(-1)?.[0].collections).toEqual([own]);expect(mock.search.mock.calls.at(-1)?.[0].searchState.collectionId).toBeUndefined();
});
test('own publication opens Words with a single source and stays in owner lists',()=>{
 render(<LibraryDestination {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Shared'}));fireEvent.click(screen.getByRole('button',{name:'Open own lesson'}));
 const last=mock.search.mock.calls.at(-1)?.[0];expect(last.searchState).toMatchObject({collectionId:'own',applyListFilter:true,dictionaryId:null,partsOfSpeech:[]});expect(last.userLists).toEqual([own]);
});

test('received filter sources remain available for browsing but never enter personal editing lists',()=>{
 const received={id:'received',name:'Shared source',type:'user' as const,ownership:'received' as const};
 render(<LibraryDestination {...props} lists={[own,received]}/>);
 const last=mock.search.mock.calls.at(-1)?.[0];expect(last.collections).toContainEqual(received);expect(last.userLists).toEqual([own]);
});

test('choosing a received source in filters uses current metadata and keeps its user type after revoke',()=>{
 const received={id:'received',name:'Old name',type:'user' as const,ownership:'received' as const};mock.source={id:'received',name:'Current name',createdAt:'2026-01-01T00:00:00Z'};
 const view=render(<LibraryDestination {...props} lists={[own,received]}/>);const previous=mock.search.mock.calls.at(-1)?.[0];
 act(()=>previous.onSearchStateChange({...previous.searchState,applyListFilter:true,collectionId:'received'}));
 expect(mock.search.mock.calls.at(-1)?.[0].collections).toContainEqual(expect.objectContaining({id:'received',name:'Current name'}));
 mock.source=null;view.rerender(<LibraryDestination {...props} lists={[own,received]}/>);
 expect(mock.search.mock.calls.at(-1)?.[0].collections).toEqual([own]);
 expect(mock.search.mock.calls.at(-1)?.[0].collectionSourceRead).toMatchObject({collectionId:'received',type:'user',status:'unavailable'});
});

test('own picker metadata yields to fresh rows and does not revive a deleted source',async()=>{
 let finish!:()=>void;const onReloadLists=vi.fn(()=>new Promise<void>(resolve=>finish=resolve));const view=render(<LibraryDestination {...props} onReloadLists={onReloadLists}/>);
 act(()=>{mock.pick?.({id:'own',name:'Picker snapshot',createdAt:'2026-01-01T00:00:00Z',ownership:'owned',isShared:false,itemCount:1,labelIds:[]});const previous=mock.search.mock.calls.at(-1)?.[0];previous.onSearchStateChange({...previous.searchState,applyListFilter:true,collectionId:'own'});});
 view.rerender(<LibraryDestination {...props} lists={[{...own,name:'Fresh rename'}]} onReloadLists={onReloadLists}/>);expect(mock.search.mock.calls.at(-1)?.[0].collections).toContainEqual(expect.objectContaining({id:'own',name:'Fresh rename'}));
 await waitFor(()=>expect(onReloadLists).toHaveBeenCalledOnce());view.rerender(<LibraryDestination {...props} lists={[]} onReloadLists={onReloadLists}/>);await act(async()=>finish());
 expect(mock.search.mock.calls.at(-1)?.[0].collections).toEqual([]);expect(mock.search.mock.calls.at(-1)?.[0].collectionSourceRead).toMatchObject({type:'user',status:'unavailable'});
});
