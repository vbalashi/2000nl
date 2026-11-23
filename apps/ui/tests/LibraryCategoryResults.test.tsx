import React from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LibraryCategoryResults } from "@/components/training/wordlist/LibraryCategoryResults";
import { readDictionaryCategory, readMoreDictionaryContext, hydrateDictionaryWordResults } from "@/lib/platform/dictionaryCategorySearch";
import { buildLibraryHeadwordGroupResults } from "@/components/training/wordlist/libraryHeadwordGroupResults";
import { multiSenseBankGroup } from "./platformV2LibraryFixture";
vi.mock("@/lib/platform/dictionaryCategorySearch",()=>({
  DICTIONARY_SEARCH_CATEGORIES:["headwords","examples","definitions","alphabetical"],
  CONTEXT_SEARCH_PAGE_SIZE:50,WORD_SEARCH_PAGE_SIZE:25,readDictionaryCategory:vi.fn(),readMoreDictionaryContext:vi.fn(),hydrateDictionaryWordResults:vi.fn(),
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

test('returning to the same visible scope starts a fresh authorized read without another typing debounce',async()=>{
 const view=render(<LibraryCategoryResults {...props}/>);
 await screen.findByTestId('library-headword-group-group-bank');
 vi.useFakeTimers();
 try {
  view.rerender(<LibraryCategoryResults {...props} enabled={false}/>);
  view.rerender(<LibraryCategoryResults {...props} enabled/>);
  await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
  expect(readDictionaryCategory).toHaveBeenCalledTimes(2);
  expect(hydrateDictionaryWordResults).toHaveBeenCalledTimes(2);
 } finally {vi.useRealTimers();}
});

test('a changed account on return keeps the typing debounce and does not reveal previous rows',async()=>{
 const view=render(<LibraryCategoryResults {...props}/>);
 await screen.findByTestId('library-headword-group-group-bank');
 vi.useFakeTimers();
 try {
  view.rerender(<LibraryCategoryResults {...props} enabled={false}/>);
  view.rerender(<LibraryCategoryResults {...props} userId='other' enabled/>);
  await act(async()=>{await vi.advanceTimersByTimeAsync(249);});
  expect(readDictionaryCategory).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('library-headword-group-group-bank')).toBeNull();
  await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
  expect(readDictionaryCategory).toHaveBeenCalledTimes(2);
 } finally {vi.useRealTimers();}
});

test('revoked access on return does not restore cached rows or parent selection',async()=>{
 const onRows=vi.fn();
 const view=render(<LibraryCategoryResults {...props} onWordResults={onRows}/>);
 await screen.findByTestId('library-headword-group-group-bank');
 vi.mocked(readDictionaryCategory).mockRejectedValueOnce(new Error('dictionary_search_access_changed'));
 view.rerender(<LibraryCategoryResults {...props} onWordResults={onRows} enabled={false}/>);
 view.rerender(<LibraryCategoryResults {...props} onWordResults={onRows} enabled/>);
 await screen.findByRole('alert');
 expect(screen.queryByTestId('library-headword-group-group-bank')).toBeNull();
 expect(onRows).toHaveBeenLastCalledWith([]);
 expect(hydrateDictionaryWordResults).toHaveBeenCalledTimes(1);
});

test('same-scope return waits for both fresh reads with controlled 80ms latency each',async()=>{
 const view=render(<LibraryCategoryResults {...props}/>);
 await screen.findByTestId('library-headword-group-group-bank');
 const category=vi.mocked(readDictionaryCategory).getMockImplementation()!;
 const hydrated=buildLibraryHeadwordGroupResults([multiSenseBankGroup]);
 vi.mocked(readDictionaryCategory).mockImplementation(async(...args)=>{
  await new Promise(resolve=>setTimeout(resolve,80));
  return category(...args);
 });
 vi.mocked(hydrateDictionaryWordResults).mockImplementation(async()=>{
  await new Promise(resolve=>setTimeout(resolve,80));
  return hydrated;
 });
 vi.useFakeTimers();
 try {
  view.rerender(<LibraryCategoryResults {...props} enabled={false}/>);
  view.rerender(<LibraryCategoryResults {...props} enabled/>);
  await act(async()=>{await vi.advanceTimersByTimeAsync(80);});
  await act(async()=>{await vi.advanceTimersByTimeAsync(79);});
  expect(screen.queryByTestId('library-headword-group-group-bank')).toBeNull();
  await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
  expect(screen.getByTestId('library-headword-group-group-bank')).toBeVisible();
 } finally {vi.useRealTimers();}
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
  expect(host).toHaveTextContent('73 articles');
  expect(host.querySelector('[data-count-detail]')).toHaveAttribute('data-count-detail','73 articles · 115 meanings');
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

test('Words renders a bounded page with exact totals, appends explicitly and retries without blanking admitted articles',async()=>{
 const first={id:'headwords' as const,total:1000,wordGroupCount:500,items:[{entry:{id:'entry-bank-furniture',headword:'bank'},headwordGroupId:'group-bank'}],page:{hasMore:true,nextCursor:'next'}};
 vi.mocked(readDictionaryCategory).mockImplementation(async(_s,_c,publish)=>{publish(first,true);return first;});
 vi.mocked(readMoreDictionaryContext).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({...first,items:[...first.items,{entry:{id:'entry-bank-finance',headword:'bank'},headwordGroupId:'group-bank'}],page:{hasMore:false,nextCursor:null}});
 const onCount=vi.fn(),onRows=vi.fn();
 render(<LibraryCategoryResults {...props} onWordCount={onCount} onWordResults={onRows}/>);
 await screen.findByTestId('library-headword-group-group-bank');
 expect(onCount).toHaveBeenLastCalledWith(500);expect(onRows.mock.lastCall![0]).toHaveLength(1);
 expect(readMoreDictionaryContext).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'More 25'}));await screen.findByRole('alert');
 expect(screen.getByTestId('library-headword-group-group-bank')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Retry'}));
 await waitFor(()=>expect(hydrateDictionaryWordResults).toHaveBeenCalledTimes(2));
 expect(vi.mocked(hydrateDictionaryWordResults).mock.calls[1][1]).toHaveLength(2);
 expect(vi.mocked(hydrateDictionaryWordResults).mock.calls[1][2]).toHaveLength(1);
 await waitFor(()=>expect(screen.queryByRole('button',{name:'More 25'})).toBeNull());
 expect(onCount).toHaveBeenLastCalledWith(500);
});
test('access denial during continuation clears prior articles and does not offer stale More',async()=>{
 const first={id:'headwords' as const,total:100,wordGroupCount:50,items:[{entry:{id:'one',headword:'bank'}}],page:{hasMore:true,nextCursor:'next'}};
 vi.mocked(readDictionaryCategory).mockImplementation(async(_s,_c,publish)=>{publish(first,true);return first;});
 vi.mocked(readMoreDictionaryContext).mockRejectedValue(new Error('dictionary_search_access_changed'));
 render(<LibraryCategoryResults {...props}/>);await screen.findByTestId('library-headword-group-group-bank');
 fireEvent.click(screen.getByRole('button',{name:'More 25'}));await screen.findByRole('alert');
 expect(screen.queryByTestId('library-headword-group-group-bank')).toBeNull();
 expect(screen.queryByRole('button',{name:'More 25'})).toBeNull();
});
test.each([{userId:'other'},{material:{kind:'collection' as const,id:'other',collectionType:'user' as const}},{filters:{parts:['noun'] as const,article:null}}])('a changed account/material/filter rejects late article hydration (%j)',async changed=>{
 let resolve!:(value:ReturnType<typeof buildLibraryHeadwordGroupResults>)=>void;
 vi.mocked(hydrateDictionaryWordResults).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 const view=render(<LibraryCategoryResults {...props}/>);
 await waitFor(()=>expect(hydrateDictionaryWordResults).toHaveBeenCalledOnce());
 const signal=vi.mocked(hydrateDictionaryWordResults).mock.calls[0][0].signal;
 view.rerender(<LibraryCategoryResults {...props} {...changed as any}/>);
 expect(signal.aborted).toBe(true);
 await act(async()=>resolve(buildLibraryHeadwordGroupResults([{...multiSenseBankGroup,headwordGroupId:'stale-group'}])));
 expect(screen.queryByTestId('library-headword-group-stale-group')).toBeNull();
 await screen.findByTestId('library-headword-group-group-bank');
});

test('revocation clears parent bulk rows and completed tabs can load again',async()=>{
 const onRows=vi.fn();
 function Tabs(){const [category,onCategoryChange]=React.useState<import("@/lib/platform/dictionaryCategorySearch").DictionarySearchCategory>('headwords');return <LibraryCategoryResults {...props} category={category} onCategoryChange={onCategoryChange} onWordResults={onRows}/>;}
 const original=vi.mocked(readDictionaryCategory).getMockImplementation()!;
 vi.mocked(readDictionaryCategory).mockImplementation(async(s,c,publish)=>{const page=await original(s,c,()=>{});const next={...page,page:{hasMore:true,nextCursor:'next'}};publish(next,true);return next;});
 render(<Tabs/>);await screen.findByTestId('library-headword-group-group-bank');
 fireEvent.click(screen.getByRole('button',{name:'Examples'}));await screen.findByRole('button',{name:'Sentence 6 about bank bank'});
 fireEvent.click(screen.getByRole('button',{name:'Words'}));await screen.findByTestId('library-headword-group-group-bank');
 vi.mocked(readMoreDictionaryContext).mockRejectedValueOnce(new Error('dictionary_search_access_changed'));
 fireEvent.click(screen.getByRole('button',{name:'More 25'}));await screen.findByRole('alert');
 expect(onRows).toHaveBeenLastCalledWith([]);
 fireEvent.click(screen.getByRole('button',{name:'Examples'}));await screen.findByRole('button',{name:'Sentence 6 about bank bank'});
 expect(vi.mocked(readDictionaryCategory).mock.calls.filter(call=>call[1]==='examples')).toHaveLength(2);
});

test.each(['category', 'continuation', 'hydration'] as const)(
  'an account change detected during %s clears the prior account’s rows and parent selection',
  async (phase) => {
    const onRows = vi.fn();
    const page = {
      id: 'headwords' as const, total: 2, wordGroupCount: 2,
      items: [{ entry: { id: 'entry-bank-furniture', headword: 'bank' } }],
      page: { hasMore: true, nextCursor: 'next' },
    };
    vi.mocked(readDictionaryCategory).mockImplementationOnce(async (_scope, _category, publish) => {
      publish(page, true);
      return page;
    });
    const view = render(<LibraryCategoryResults {...props} onWordResults={onRows}/>);
    await screen.findByTestId('library-headword-group-group-bank');
    expect(onRows.mock.lastCall?.[0]).toHaveLength(1);

    const changed = new Error('auth_account_changed');
    if (phase === 'category') {
      vi.mocked(readDictionaryCategory).mockRejectedValueOnce(changed);
      view.rerender(<LibraryCategoryResults {...props} onWordResults={onRows} category="examples"/>);
    } else {
      if (phase === 'continuation') {
        vi.mocked(readMoreDictionaryContext).mockRejectedValueOnce(changed);
      } else {
        vi.mocked(readMoreDictionaryContext).mockResolvedValueOnce({
          ...page, items: [...page.items, { entry: { id: 'entry-two', headword: 'fiets' } }],
          page: { hasMore: false, nextCursor: null },
        });
        vi.mocked(hydrateDictionaryWordResults).mockRejectedValueOnce(changed);
      }
      fireEvent.click(screen.getByRole('button', { name: 'More 25' }));
    }

    await screen.findByRole('alert');
    expect(onRows).toHaveBeenLastCalledWith([]);
    expect(screen.queryByTestId('library-headword-group-group-bank')).toBeNull();
    expect(screen.queryByRole('button', { name: 'More 25' })).toBeNull();
    if (phase === 'category') {
      view.rerender(<LibraryCategoryResults {...props} onWordResults={onRows}/>);
      expect(screen.queryByTestId('library-headword-group-group-bank')).toBeNull();
      await screen.findByTestId('library-headword-group-group-bank');
      expect(readDictionaryCategory).toHaveBeenCalledTimes(3);
    }
  },
);

test('a reference row opens its exact source article, preserving dictionary and homograph identity',async()=>{
 const groups=[0,1,2].map(i=>({...multiSenseBankGroup,headwordGroupId:`pointer-group-${i}`,dictionary:{...multiSenseBankGroup.dictionary,dictionaryId:i===2?'other':'same'},header:{text:'same spelling',homographNumber:i+1},senseCount:0,entryCount:1,entries:[{kind:'cross-reference' as const,crossReferenceId:`pointer-${i}`,meaningOrdinal:1,label:null,text:'target',target:{query:'target'},capabilities:[]}]}));
 const rows=buildLibraryHeadwordGroupResults(groups);
 vi.mocked(hydrateDictionaryWordResults).mockResolvedValueOnce(rows);
 const select=vi.fn();render(<LibraryCategoryResults {...props} onSelectGroup={select}/>);
 for(const [i,row] of rows.entries()){
  fireEvent.click(await screen.findByTestId(`library-headword-group-pointer-group-${i}`));
  expect(select).toHaveBeenLastCalledWith(row);expect(row.selectedEntryId).toBe(`pointer-${i}`);
 }
});
