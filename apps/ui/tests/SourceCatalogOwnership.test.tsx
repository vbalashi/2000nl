import React,{useState} from 'react';
import {fireEvent,render,screen,cleanup} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {BrowseCollectionSources} from '@/components/library/sharing/BrowseCollectionSources';
import {TrainingSourcePicker} from '@/components/training/pilot/TrainingSourcePicker';
import type {TrainingSetupDraft} from '@/lib/training/setups/types';
import type {TrainingSessionSize} from '@/lib/types';
const reads=vi.hoisted(()=>({personal:vi.fn(),training:vi.fn(),labels:vi.fn(),groups:vi.fn()}));
vi.mock('@/components/library/organization/usePersonalCollectionCatalog',()=>({usePersonalCollectionCatalog:reads.personal}));
vi.mock('@/components/library/sharing/useTrainingSourcePage',()=>({useTrainingSourcePage:reads.training}));
vi.mock('@/components/library/organization/usePersonalLabels',()=>({usePersonalLabels:reads.labels}));
vi.mock('@/components/library/sharing/useLabelSharingCatalog',()=>({useLabelSharingCatalog:reads.groups}));
afterEach(()=>{cleanup();vi.resetAllMocks();vi.unstubAllEnvs();});
const received={id:'10000000-0000-4000-8000-000000000001',name:'Received through a group',ownership:'received' as const,isShared:true,createdAt:'2026-11-08T00:00:00Z',itemCount:1,labelIds:[]};
function catalog(){return {collections:[received],status:'ready',nextCursor:null,loadingMore:false,refresh:vi.fn(),loadMore:vi.fn()};}
test('Library Shared requests received rows before paging and selects the real group-derived collection',()=>{
 reads.personal.mockReturnValue(catalog());const select=vi.fn(),onSelect=vi.fn();
 render(<BrowseCollectionSources userId="owner" language="nl" query="" options={[]} curatedIds={[]} selected={null} select={select} onSelect={onSelect} locale="en" kind="shared"/>);
 expect(reads.personal).toHaveBeenLastCalledWith(expect.objectContaining({query:expect.objectContaining({ownership:'received',limit:50})}));
 fireEvent.click(screen.getByRole('button',{name:received.name}));
 expect(onSelect).toHaveBeenCalledWith(received);expect(select).toHaveBeenCalledWith('collection:'+received.id);
});
test('Dictionary tab does not expose unrelated collection pagination or read errors',()=>{
 reads.personal.mockReturnValue({...catalog(),collections:[],status:'error',nextCursor:{id:received.id,key:'x',scope:'x'}});
 render(<BrowseCollectionSources userId="owner" language="nl" query="" options={[{id:'dictionary:d',label:'Dutch dictionary'}]} curatedIds={[]} selected={null} select={vi.fn()} onSelect={vi.fn()} locale="en" kind="dictionary"/>);
 expect(screen.getByRole('button',{name:'Dutch dictionary'})).toBeInTheDocument();expect(screen.queryByRole('alert')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'More results'})).not.toBeInTheDocument();
});
function TrainingFixture(){const[draft,setDraft]=useState<TrainingSetupDraft&{sessionSize:TrainingSessionSize}>({family:'meaning',scenarioId:'understanding',modes:['word-to-definition'],cardFilter:'review',newReviewRatio:2,listValue:'all',materialMode:'all-dictionaries',dateWindow:'all',sourceValue:'all',sessionSize:5});return <><TrainingSourcePicker locale="en" lists={[]} dictionaries={[{value:"dict",label:"Dictionary"}]} draft={draft} onChange={setDraft}/><output data-testid="draft">{JSON.stringify(draft)}</output></>;}
test('Training source type binds server ownership',()=>{
 reads.labels.mockReturnValue({snapshot:null});reads.groups.mockReturnValue({status:'idle',data:null});
 reads.training.mockReturnValue({active:true,page:{collections:[],nextCursor:null},status:'ready',more:false,retry:vi.fn(),loadMore:vi.fn()});render(<TrainingFixture/>);
 fireEvent.click(screen.getByRole('button',{name:'Shared'}));expect(reads.training).toHaveBeenLastCalledWith('','received',true);
 fireEvent.click(screen.getByRole('button',{name:'Collections'}));expect(reads.training).toHaveBeenLastCalledWith('','owned',true);
 fireEvent.click(screen.getByRole('button',{name:'All'}));expect(reads.training).toHaveBeenLastCalledWith('','all',true);
});

test('Library label filter shows both personal labels and shared groups independently of collection pages',()=>{
 reads.personal.mockReturnValue(catalog());
 const select=vi.fn();
 const props={userId:'owner',language:'nl',query:'',options:[
  {id:'label:own',label:'YouTube'},{id:'label:received',label:'KNM',received:true},
 ],curatedIds:[],selected:null,select,onSelect:vi.fn(),locale:'en' as const};
 const view=render(<BrowseCollectionSources {...props} kind="label"/>);
 expect(screen.getByRole('button',{name:'YouTube'})).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:received.name})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'KNM'}));
 expect(select).toHaveBeenCalledWith('label:received');
 view.rerender(<BrowseCollectionSources {...props} kind="shared"/>);
 expect(screen.getByRole('button',{name:'KNM'})).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'YouTube'})).not.toBeInTheDocument();
});
test('Training can select or replace a shared label without treating the source as a collection',()=>{
 vi.stubEnv('NEXT_PUBLIC_LABEL_SHARING_ENABLED','true');
 vi.stubEnv('NEXT_PUBLIC_COLLECTION_ORGANIZATION_ENABLED','true');
 reads.labels.mockReturnValue({snapshot:{revision:1,labels:[{id:'owned-label',name:'YouTube',parent_id:null}],assignments:[]}});
 reads.groups.mockReturnValue({status:'ready',data:{received:[{labelId:'received-label',name:'KNM',collectionCount:8}]}});
 reads.training.mockReturnValue({active:true,scope:{userId:'owner'},page:{collections:[],nextCursor:null},status:'ready',more:false});
 render(<TrainingFixture/>);
 fireEvent.click(screen.getByRole('button',{name:'Labels'}));
 expect(screen.getByRole('button',{name:'YouTube'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'KNM'}));
 const draft=()=>JSON.parse(screen.getByTestId('draft').textContent!);
 expect(draft()).toMatchObject({materialMode:'all-dictionaries',listValue:'',librarySelection:{labelId:'received-label',labelName:'KNM',query:'',category:'headwords'}});
 expect(screen.getByRole('button',{name:'KNM'})).toHaveAttribute('aria-pressed','true');
 fireEvent.click(screen.getByRole('button',{name:'Dictionaries'}));
 const dictionary=screen.getByRole('button',{name:'Dictionary'});
 expect(dictionary).toHaveAttribute('aria-pressed','false');
 fireEvent.click(dictionary);
 expect(draft().librarySelection).toBeUndefined();
 expect(draft().dictionaryIds).toEqual(['dict']);
});
