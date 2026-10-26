import React from "react";
import {fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,test,vi} from "vitest";
import {LibraryDestination} from "@/components/navigation/LibraryDestination";
const label={id:"label-id",name:"YouTube"};
vi.mock("@/components/library/organization/PersonalCollections",()=>({PersonalCollections:({onOpenLabel}:{onOpenLabel:(label:unknown)=>void})=><button onClick={()=>onOpenLabel(label)}>View label words</button>}));
vi.mock("@/components/training/wordlist/DictionarySearchTab",()=>({
 createDictionarySearchTabState:()=>({query:"",entryFilters:undefined,applyListFilter:false,collectionId:null,detailSelection:null}),
 DictionarySearchTab:({searchState,onSearchStateChange}:{searchState:Record<string,unknown>;onSearchStateChange:(state:Record<string,unknown>)=>void})=><><output data-testid="state">{JSON.stringify(searchState)}</output><button onClick={()=>onSearchStateChange({...searchState,query:"old search",dictionaryId:"old dictionary",entryFilters:{parts:["verb"],article:null}})}>Set old filters</button></>,
}));
afterEach(()=>{vi.unstubAllEnvs();});
test("catalog label View words replaces old query and filters then switches to Words",()=>{
 vi.stubEnv("NEXT_PUBLIC_COLLECTION_ORGANIZATION_ENABLED","true");
 render(<LibraryDestination open userId="owner" language="nl" translationLang="en" interfaceLanguage="en" lists={[]} activeList={null} onReloadLists={async()=>{}}/>);
 fireEvent.click(screen.getByRole("button",{name:"Set old filters"}));
 fireEvent.click(screen.getByRole("button",{name:"Collections"}));
 fireEvent.click(screen.getByRole("button",{name:"View label words"}));
 expect(screen.getByRole("button",{name:"Words"})).toHaveAttribute("aria-current","page");
 expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual({query:"",applyListFilter:false,collectionId:null,detailSelection:null,labelId:"label-id",labelName:"YouTube"});
});
