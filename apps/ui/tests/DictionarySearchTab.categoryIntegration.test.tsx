import React,{useState} from "react";
import {beforeEach,expect,test,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {DictionarySearchTab,createDictionarySearchTabState,type DictionarySearchTabState} from "@/components/training/wordlist/DictionarySearchTab";
const {capture,legacy} = vi.hoisted(()=>({capture:vi.fn(),legacy:vi.fn()}));
vi.mock("@/components/practice/material/useLibraryMaterialSelection",()=>({useLibraryMaterialSelection:()=>({revision:7,status:'ready',currentLanguageAllowed:true,languages:[{code:'nl',label:'Dutch'}],dictionaries:[{id:'source',name:'Source'}],reload:()=>{}})}));
vi.mock("@/components/training/wordlist/LibraryCategoryResults",()=>({LibraryCategoryResults:(props:any)=>{capture(props);return <button onClick={()=>props.onCategoryChange('examples')}>Pick examples</button>;}}));
vi.mock("@/lib/platform/platformV2LibraryClient",()=>({fetchPlatformV2LibraryGroupPage:legacy}));
vi.mock("@/lib/trainingService",()=>({fetchAvailableLearningLanguages:vi.fn().mockResolvedValue([]),fetchAvailableDictionarySources:vi.fn().mockResolvedValue([]),fetchDictionaryEntryById:vi.fn()}));
vi.mock("@/components/training/library-v2/LibraryWordDetail",()=>({LibraryWordDetail:()=>null}));
vi.mock("@/components/training/wordlist/WordDetailDrawer",()=>({WordDetailDrawer:()=>null}));
function Harness({initial={}}:{initial?:Partial<DictionarySearchTabState>}) {
 const [state,setState]=useState(()=>({...createDictionarySearchTabState(),query:'ontmut',languageCode:'nl',...initial}));
 return <DictionarySearchTab open userId='reader' language='nl' translationLang={null} interfaceLanguage='en' userLists={[]}
  viewedListId={null} viewedList={null} viewedListName='' reloadLists={async()=>{}} notifyListsUpdated={()=>{}}
  searchState={state} onSearchStateChange={setState}/>;
}
beforeEach(()=>{vi.clearAllMocks();legacy.mockResolvedValue({groups:[],selectedTierComplete:true,nextGroupCursor:null});window.history.replaceState({},'', '/?destination=library');});
test('normal Library query uses category search with current dictionary/part filters and no prototype flag',async()=>{
 render(<Harness initial={{dictionaryId:'source',entryFilters:{parts:['verb'],article:null}}}/>);
 await waitFor(()=>expect(capture).toHaveBeenCalled());
 expect(capture.mock.lastCall?.[0]).toMatchObject({query:'ontmut',dictionaryId:'source',filters:{parts:['verb'],article:null},material:undefined,materialRevision:7,enabled:true});
 expect(legacy).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Pick examples'}));
 expect(capture.mock.lastCall?.[0].category).toBe('examples');
});
test.each([
 [{applyListFilter:true,collectionId:'collection'},{kind:'collection',id:'collection',collectionType:'curated'}],
 [{labelId:'label',labelName:'Label'},{kind:'label',id:'label'}],
] as const)('normal query preserves collection or label identity',async(initial,material)=>{
 render(<Harness initial={initial}/>);
 await waitFor(()=>expect(capture).toHaveBeenCalled());
 expect(capture.mock.lastCall?.[0]).toMatchObject({material,query:'ontmut'});
 expect(screen.queryByText(/сбросьте фильтры/)).toBeNull();expect(legacy).not.toHaveBeenCalled();
});
