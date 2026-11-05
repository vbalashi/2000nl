import React,{useState} from 'react';
import {beforeEach,expect,test,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {TrainingTodaySetup,type TrainingSetupDraft} from '@/components/training/pilot/TrainingTodaySetup';
const {count,accountMaterial,accountReload,editorReload}=vi.hoisted(()=>({count:vi.fn(),accountMaterial:{status:'ready' as 'ready'|'error'},accountReload:vi.fn(),editorReload:vi.fn()}));
beforeEach(()=>{accountMaterial.status='ready';vi.clearAllMocks();});
vi.mock('@/components/practice/material/useNewTrainingMaterial',()=>({useNewTrainingMaterial:(input:{languages:unknown[];lists:unknown[];dictionaries:unknown[]})=>({...input,status:accountMaterial.status,currentLanguageAllowed:true,reload:accountReload})}));
vi.mock('@/lib/training/availability/useTrainingAvailability',()=>({useTrainingAvailability:(input:unknown)=>{count(input);return {status:'ready',value:{dueToday:1,totalReviews:2,newCards:3},refreshing:false,refreshFailed:false,reload:vi.fn()};}}));
vi.mock('@/components/training/pilot/useTrainingEditorMaterial',()=>({useTrainingEditorMaterial:()=>({status:'ready',lists:[],dictionaries:[{value:'00000000-0000-4000-8000-000000000001',label:'English source'}],reload:editorReload})}));
vi.mock('@/lib/training/setups/client',()=>({fetchAccountTrainingSetups:async()=>({revision:0,document:{schemaVersion:1,trainings:[],mainTrainingId:null}})}));
const base:TrainingSetupDraft={family:'meaning',scenarioId:'understanding',modes:['word-to-definition'],cardFilter:'both',materialMode:'all-dictionaries',listValue:'',sessionSize:5,newReviewRatio:4,dateWindow:'all',sourceValue:'all'};
const intent={key:1,userId:'owner',languageCode:'en',material:{materialMode:'selected-dictionaries' as const,dictionaryIds:['00000000-0000-4000-8000-000000000001'],vocabulary:{mode:'frequency' as const,materialKinds:[],profile:'spoken' as const,from:1,to:100,meanings:2 as const}}};
function Harness({change,start,continued,catalogReady=true}:{catalogReady?:boolean;change:()=>void;start:(draft:TrainingSetupDraft)=>void;continued:()=>void}){
 const [language,setLanguage]=useState('nl');
 return <TrainingTodaySetup interfaceLanguage='en' userId='owner' trainingLanguageCode={language} initialDraft={{...base,sessionSize:10}} status='ready' hasOwnedSession ownedSession={{id:'owned-nl',draft:base,completed:2,total:5}} activeSessionLabel='Owned Dutch run' materialIntent={intent}
 trainingLanguageOptions={[{value:'nl',label:'Dutch'},{value:'en',label:'English'}]} dictionaries={language==='en'&&!catalogReady?[]:[{value:intent.material.dictionaryIds[0],label:'English source'}]} dictionariesLoading={language==='en'&&!catalogReady} lists={[]} sources={[]} scenarios={[{value:'understanding',label:'Meaning',modes:['word-to-definition','definition-to-word']}]}
 stats={{newWordsToday:0,newCardsToday:0,learningStartedToday:0,graduatedNewWordsToday:0,dailyNewLimit:10,reviewWordsDone:0,reviewCardsDone:0,reviewWordsDue:0,reviewCardsDue:0,totalWordsLearned:0,totalWordsInList:0}}
 onTrainingLanguageChange={code=>{change();setLanguage(code);}} onStart={start} onContinue={continued} onRetry={()=>{}}/>;
}
test('foreign Library handoff preserves owned language/run and session settings until explicit Start',async()=>{
 const change=vi.fn(),start=vi.fn(),continued=vi.fn();render(<Harness change={change} start={start} continued={continued}/>);
 const launch=await screen.findByRole('button',{name:'Start training'});await waitFor(()=>expect(launch).toBeEnabled());
 expect(change).not.toHaveBeenCalled();expect(start).not.toHaveBeenCalled();
 expect(count.mock.calls.at(-1)?.[0]).toMatchObject({recipe:{languageCode:'en',draft:{sessionSize:5,newReviewRatio:4,vocabulary:{meanings:2}}}});
 fireEvent.click(launch);
 await waitFor(()=>expect(start).toHaveBeenCalledOnce());expect(change).toHaveBeenCalledOnce();expect(start.mock.calls[0][0]).toMatchObject({sessionSize:5,newReviewRatio:4,dictionaryIds:intent.material.dictionaryIds,vocabulary:intent.material.vocabulary});
});
test('Back from a foreign handoff leaves the Dutch owned session available to continue',async()=>{
 const change=vi.fn(),start=vi.fn(),continued=vi.fn();render(<Harness change={change} start={start} continued={continued}/>);
 await screen.findByRole('button',{name:'Start training'});fireEvent.click(screen.getByRole('button',{name:'Back to Training'}));
 fireEvent.click(await screen.findByRole('button',{name:'Continue training'}));expect(continued).toHaveBeenCalledOnce();expect(change).not.toHaveBeenCalled();expect(start).not.toHaveBeenCalled();
});

test('queued foreign Start waits for the actual dictionary catalog and launches once',async()=>{
 const change=vi.fn(),start=vi.fn(),continued=vi.fn();const props={change,start,continued};
 const view=render(<Harness {...props} catalogReady={false}/>);
 const launch=await screen.findByRole('button',{name:'Start training'});await waitFor(()=>expect(launch).toBeEnabled());fireEvent.click(launch);
 await waitFor(()=>expect(change).toHaveBeenCalledOnce());expect(start).not.toHaveBeenCalled();
 view.rerender(<Harness {...props} catalogReady/>);await waitFor(()=>expect(start).toHaveBeenCalledOnce());
});

test('Retry in a foreign draft also refreshes failed account material preferences',async()=>{
 const props={change:vi.fn(),start:vi.fn(),continued:vi.fn()};const view=render(<Harness {...props}/>);await screen.findByRole('button',{name:'Start training'});
 accountMaterial.status='error';view.rerender(<Harness {...props}/>);fireEvent.click(await screen.findByRole('button',{name:'Retry'}));
 expect(accountReload).toHaveBeenCalledOnce();expect(editorReload).toHaveBeenCalledOnce();
 accountMaterial.status='ready';view.rerender(<Harness {...props}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'Start training'})).toBeEnabled());expect(props.change).not.toHaveBeenCalled();
});
