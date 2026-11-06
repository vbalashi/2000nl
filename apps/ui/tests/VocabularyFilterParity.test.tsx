import React from 'react';
import {beforeAll,expect,test,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {ApprovedTrainingBuilder} from '@/components/training/pilot/ApprovedTrainingBuilder';
import {LibraryFilters} from '@/components/practice/library/LibraryFilters';
import {DEFAULT_VOCABULARY_SELECTION} from '@/lib/vocabulary/selection';
import {partId} from '@/lib/vocabulary/partsOfSpeech';
import {singleNounArticle} from '@/lib/training/nounArticles';
import type {TrainingSetupDraft} from '@/lib/training/setups/types';
import type {TrainingSessionSize} from '@/lib/types';
beforeAll(()=>{
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open');}});
});
function props(){return {
 interfaceLanguage:'en' as const,draft:{family:'meaning' as const,scenarioId:'understanding',modes:['word-to-definition' as const],cardFilter:'review' as const,listValue:'all',newReviewRatio:2,dateWindow:'all' as const,sourceValue:'all',sessionSize:5},
 languageCode:'nl',languageOptions:[],lists:[],dictionaries:[],sources:[],scenarios:[],languagePending:false,dictionariesLoading:false,translationLanguage:'ru',name:'Original',onNameChange:vi.fn(),onLanguageChange:vi.fn(),onDraftChange:vi.fn(),onSelectFamily:vi.fn(),onToggleMode:vi.fn(),onMixChange:vi.fn(),onBack:vi.fn(),onSave:vi.fn(async()=>true),onBeginSave:vi.fn(),onStart:vi.fn(),saveDisabled:false,startDisabled:false,saveLabel:'Update training',startLabel:'Start training',canSave:true,editing:true,onSaveAs:vi.fn(async(_name:string)=>true),onDelete:vi.fn(async()=>true),saveAsLabel:'Save as…',deleteLabel:'Delete training'
};}

test('Library and training expose the same compact choices and commit equivalent content criteria',()=>{
 const results:unknown[]=[];const choices:unknown[]=[];
 for(const surface of ['library','training']){
  let selected:unknown;
  function Training(){
   const p=props();const [draft,setDraft]=React.useState<TrainingSetupDraft & {sessionSize:TrainingSessionSize}>({...p.draft,vocabulary:{...DEFAULT_VOCABULARY_SELECTION}});
   return <ApprovedTrainingBuilder {...p} draft={draft} onDraftChange={setDraft} onStart={()=>{selected={vocabulary:draft.vocabulary,parts:(draft.partOfSpeech??[]).map(partId),article:singleNounArticle(draft.nounArticles??[])};}}/>;
  }
  render(surface==='library'?<LibraryFilters value={{languageCode:'nl',dictionaryId:null,parts:[],article:null}} languageOptions={[{id:'nl',label:'Dutch'}]} sourceOptions={[]} locale='en' countContent='Matching articles' onClose={()=>{}} onApply={next=>{selected={vocabulary:next.vocabulary,parts:next.parts,article:next.article};}}/>:<Training/>);
  const filters=screen.getByRole('button',{name:/^Filters /});if(filters.getAttribute('aria-expanded')==='false')fireEvent.click(filters);
  fireEvent.click(screen.getByRole('button',{name:'By frequency'}));
  choices.push(['Choose words','Where they occur','Places in the list','Entry type','Meanings per entry'].map(name=>[name,within(screen.getByRole('group',{name})).getAllByRole('button').map(button=>button.getAttribute('aria-label')??button.textContent)]));
  for(const name of ['Top 100','Top 200','Top 300','Top 500','Top 1,000','Spoken','Written','First meaning','First 2 meanings','First 3 meanings','First 4 meanings','First 5 meanings','All meanings'])expect(screen.getByRole('button',{name})).toBeVisible();
  expect(screen.queryByRole('slider',{name:'Meanings per entry'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Written'}));
  fireEvent.click(screen.getByRole('button',{name:'Top 300'}));
  fireEvent.click(screen.getByRole('button',{name:'First 5 meanings'}));
  for(const name of ['First meaning','First 2 meanings','First 3 meanings','First 4 meanings','First 5 meanings'])expect(screen.getByRole('button',{name})).toHaveAttribute('aria-pressed','true');
  fireEvent.click(screen.getByRole('button',{name:/1–300/ }));
  const range=screen.getByRole('dialog',{name:'Positions in the frequency list'});
  fireEvent.change(within(range).getByRole('spinbutton',{name:'From'}),{target:{value:'200'}});
  fireEvent.change(within(range).getByRole('spinbutton',{name:'To'}),{target:{value:'500'}});
  fireEvent.click(within(range).getByRole('button',{name:'Done'}));
  expect(screen.getByRole('button',{name:'Top 300'})).toHaveAttribute('aria-pressed','false');
  fireEvent.click(screen.getByRole('button',{name:/^Part of speech/}));
  fireEvent.click(screen.getByRole('button',{name:'Nouns'}));
  fireEvent.click(screen.getByRole('button',{name:'Noun subfilters'}));
  fireEvent.click(within(screen.getByRole('menu',{name:'Noun article'})).getByRole('menuitem',{name:'het'}));
  fireEvent.click(screen.getByRole('button',{name:surface==='library'?'Show results':'Start training'}));
  expect(selected).toEqual({vocabulary:{...DEFAULT_VOCABULARY_SELECTION,mode:'frequency',profile:'written',from:200,to:500,meanings:5},parts:['noun'],article:'het'});
  results.push(selected);cleanup();
 }
 expect(choices[0]).toEqual(choices[1]);expect(results[0]).toEqual(results[1]);
},15000);
