import React from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LibraryCategoryResults } from "@/components/training/wordlist/LibraryCategoryResults";
import { readDictionaryCategory, readMoreDictionaryContext, hydrateDictionaryWordResults } from "@/lib/platform/dictionaryCategorySearch";
import { buildLibraryHeadwordGroupResults } from "@/components/training/wordlist/libraryHeadwordGroupResults";
import { multiSenseBankGroup } from "./platformV2LibraryFixture";
vi.mock("@/lib/platform/dictionaryCategorySearch",()=>({
  DICTIONARY_SEARCH_CATEGORIES:["headwords","examples","definitions","alphabetical"],
  CONTEXT_SEARCH_PAGE_SIZE:50,readDictionaryCategory:vi.fn(),readMoreDictionaryContext:vi.fn(),hydrateDictionaryWordResults:vi.fn(),
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

test('context count is a lower bound and only More fetches another page; errors retain the first page',async()=>{
 const initial={id:'examples' as const,total:null,items:[{resultKey:'first',entry:{id:'one',headword:'bank'},field:{text:'First bank'}}],page:{hasMore:true,nextCursor:'next'}};
 vi.mocked(readDictionaryCategory).mockImplementation(async(_scope,_category,onPage)=>{onPage(initial,true);return initial;});
 vi.mocked(readMoreDictionaryContext).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({...initial,items:[...initial.items,{resultKey:'second',entry:{id:'two',headword:'bank'},field:{text:'Second bank'}}],page:{hasMore:false,nextCursor:null}});
 const host=document.createElement('span');document.body.appendChild(host);
 try {
  render(<LibraryCategoryResults {...props} category='examples' countHost={host}/>);
  await screen.findByRole('button',{name:'First bank bank'});
  expect(host).toHaveTextContent('Found: 1+');
  expect(readMoreDictionaryContext).not.toHaveBeenCalled();
  expect(screen.queryByText('Loading all matches…')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'More 50'}));
  await screen.findByRole('alert');
  expect(screen.getByRole('button',{name:'First bank bank'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Retry'}));
  await screen.findByRole('button',{name:'Second bank bank'});
  expect(host).toHaveTextContent('Found: 2');
  expect(screen.queryByRole('button',{name:'More 50'})).toBeNull();
  expect(readDictionaryCategory).toHaveBeenCalledTimes(1);
 } finally {host.remove();}
});

test('changing query cancels a continuation and its late response cannot replace the new list',async()=>{
 const first={id:'examples' as const,total:null,items:[{resultKey:'first',entry:{id:'one',headword:'bank'},field:{text:'First bank'}}],page:{hasMore:true,nextCursor:'next'}};
 vi.mocked(readDictionaryCategory).mockImplementation(async(scope,_category,onPage)=>{const page={...first,items:scope.query==='bank'?first.items:[{resultKey:'new',entry:{id:'new',headword:'fiets'},field:{text:'New fiets'}}]};onPage(page,true);return page;});
 let resolve!:(page:typeof first)=>void;
 vi.mocked(readMoreDictionaryContext).mockImplementation(()=>new Promise(done=>{resolve=done;}));
 const view=render(<LibraryCategoryResults {...props} category='examples'/>);
 await screen.findByRole('button',{name:'First bank bank'});
 fireEvent.click(screen.getByRole('button',{name:'More 50'}));
 await waitFor(()=>expect(readMoreDictionaryContext).toHaveBeenCalledTimes(1));
 const signal=vi.mocked(readMoreDictionaryContext).mock.calls[0][0].signal;
 view.rerender(<LibraryCategoryResults {...props} query='fiets' category='examples'/>);
 await screen.findByRole('button',{name:'New fiets fiets'});
 expect(signal.aborted).toBe(true);
 await act(async()=>{resolve(first);});
 expect(screen.queryByRole('button',{name:'First bank bank'})).toBeNull();
 expect(screen.getByRole('button',{name:'New fiets fiets'})).toBeTruthy();
});

test('an invalidated continuation restarts from the first page instead of retrying a stale cursor',async()=>{
 const page={id:'examples' as const,total:null,items:[{entry:{id:'one',headword:'bank'},field:{text:'First bank'}}],page:{hasMore:true,nextCursor:'old'}};
 vi.mocked(readDictionaryCategory).mockImplementation(async(_scope,_category,onPage)=>{onPage(page,true);return page;});
 vi.mocked(readMoreDictionaryContext).mockRejectedValue(new Error('invalid_cursor'));
 render(<LibraryCategoryResults {...props} category='examples'/>);
 await screen.findByRole('button',{name:'First bank bank'});
 fireEvent.click(screen.getByRole('button',{name:'More 50'}));
 await waitFor(()=>expect(readDictionaryCategory).toHaveBeenCalledTimes(2));
 await screen.findByRole('button',{name:'First bank bank'});
 expect(readMoreDictionaryContext).toHaveBeenCalledTimes(1);
});

test.each(['headwords','alphabetical'] as const)('word category %s uses exact selected totals without more reads',async category=>{
 vi.mocked(readDictionaryCategory).mockImplementation(async(_scope,id,onPage)=>{
  const page={id,total:115,wordGroupCount:73,items:[{entry:{id:'one',headword:'bank'}}],page:{hasMore:false,nextCursor:null}};onPage(page,true);return page;
 });
 const host=document.createElement('span');document.body.appendChild(host);
 try{
  render(<LibraryCategoryResults {...props} category={category} countHost={host}/>);
  await screen.findByTestId('library-headword-group-group-bank');
  expect(host).toHaveTextContent('73 articles · 115 meanings');
  expect(readDictionaryCategory).toHaveBeenCalledTimes(1);expect(hydrateDictionaryWordResults).toHaveBeenCalledTimes(1);
 }finally{host.remove();}
});

test.each(['headwords','alphabetical'] as const)('legacy %s does not pair loaded articles with a global meaning total',async category=>{
 vi.mocked(readDictionaryCategory).mockImplementation(async(_scope,id,onPage)=>{
  const page={id,total:115,items:[{entry:{id:'one',headword:'bank'}}],page:{hasMore:false,nextCursor:null}};onPage(page,true);return page;
 });
 const host=document.createElement('span');document.body.appendChild(host);
 try{
  render(<LibraryCategoryResults {...props} category={category} countHost={host}/>);
  await screen.findByTestId('library-headword-group-group-bank');
  expect(host).toHaveTextContent('Found: 1');
  expect(host).not.toHaveTextContent('115');
  expect(readDictionaryCategory).toHaveBeenCalledTimes(1);
 }finally{host.remove();}
});
