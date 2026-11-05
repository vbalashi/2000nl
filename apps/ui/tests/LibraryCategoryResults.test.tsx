import React from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LibraryCategoryResults } from "@/components/training/wordlist/LibraryCategoryResults";
import { readDictionaryCategory, hydrateDictionaryWordResults } from "@/lib/platform/dictionaryCategorySearch";
import { buildLibraryHeadwordGroupResults } from "@/components/training/wordlist/libraryHeadwordGroupResults";
import { multiSenseBankGroup } from "./platformV2LibraryFixture";
vi.mock("@/lib/platform/dictionaryCategorySearch",()=>({
  DICTIONARY_SEARCH_CATEGORIES:["headwords","examples","definitions","alphabetical"],
  readDictionaryCategory:vi.fn(),hydrateDictionaryWordResults:vi.fn(),
}));
beforeEach(()=>{
  vi.clearAllMocks();
  vi.mocked(hydrateDictionaryWordResults).mockResolvedValue(buildLibraryHeadwordGroupResults([multiSenseBankGroup]));
  vi.mocked(readDictionaryCategory).mockImplementation(async(scope,category,onPage)=>{
    const context=category==='examples'||category==='definitions';
    const page={id:category,total:null,page:{hasMore:false,nextCursor:null},items:Array.from({length:context?7:2},(_,i)=>({
      resultKey:`${category}-${i}`,entry:{id:`entry-${i}`,headword:'bank'},field:{sourcePath:`example[${i}]`,text:`Sentence ${i} about ${scope.query}`},
    }))};
    onPage(page,true);return page;
  });
});
function Harness({query="bank"}:{query?:string}) {
  const [category,onCategoryChange]=React.useState<import("@/lib/platform/dictionaryCategorySearch").DictionarySearchCategory>("headwords");
  return <LibraryCategoryResults {...props} query={query} category={category} onCategoryChange={onCategoryChange}/>;
}
const props={query:'bank',languageCode:'nl',dictionaryId:null,interfaceLanguage:'en' as const,userId:'reader',onSelect:vi.fn(),onSelectGroup:vi.fn()};
test('uses normal Library article rows and shows every context hit with its exact count',async()=>{
  render(<Harness/>);
  await screen.findByTestId('library-headword-group-group-bank');
  expect(screen.getAllByTestId('library-headword-group-row')).toHaveLength(1);
  expect(vi.mocked(readDictionaryCategory).mock.calls.map(call=>call[1])).toEqual(['headwords']);
  fireEvent.click(screen.getByRole('button',{name:'Examples'}));
  expect(await screen.findByRole('button',{name:'Sentence 6 about bank bank'})).toBeTruthy();
  expect(screen.queryByRole('button',{name:/More results/i})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Words'}));
  await screen.findByTestId('library-headword-group-group-bank');
  expect(hydrateDictionaryWordResults).toHaveBeenCalledTimes(1);
  expect(vi.mocked(readDictionaryCategory).mock.calls.map(call=>call[1])).toEqual(["headwords","examples"]);
});
test('returning to an earlier query starts a fresh read rather than leaving an empty cached word list',async()=>{
  const view=render(<Harness/>);
  await screen.findByTestId('library-headword-group-group-bank');
  view.rerender(<Harness query='ontmut'/>);
  await waitFor(()=>expect(hydrateDictionaryWordResults).toHaveBeenCalledTimes(2));
  view.rerender(<Harness/>);
  await waitFor(()=>expect(hydrateDictionaryWordResults).toHaveBeenCalledTimes(3));
  await screen.findByTestId('library-headword-group-group-bank');
});
