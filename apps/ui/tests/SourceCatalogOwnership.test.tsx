import React,{useState} from 'react';
import {fireEvent,render,screen,cleanup} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {BrowseCollectionSources} from '@/components/library/sharing/BrowseCollectionSources';
import {TrainingSourcePicker} from '@/components/training/pilot/TrainingSourcePicker';
import type {TrainingSetupDraft} from '@/lib/training/setups/types';
import type {TrainingSessionSize} from '@/lib/types';
const reads=vi.hoisted(()=>({personal:vi.fn(),training:vi.fn()}));
vi.mock('@/components/library/organization/usePersonalCollectionCatalog',()=>({usePersonalCollectionCatalog:reads.personal}));
vi.mock('@/components/library/sharing/useTrainingSourcePage',()=>({useTrainingSourcePage:reads.training}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
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
function TrainingFixture(){const[draft,setDraft]=useState<TrainingSetupDraft&{sessionSize:TrainingSessionSize}>({family:'meaning',scenarioId:'understanding',modes:['word-to-definition'],cardFilter:'review',newReviewRatio:2,listValue:'all',materialMode:'all-dictionaries',dateWindow:'all',sourceValue:'all',sessionSize:5});return <TrainingSourcePicker locale="en" lists={[]} dictionaries={[]} draft={draft} onChange={setDraft}/>;}
test('Training source type binds server ownership',()=>{
 reads.training.mockReturnValue({active:true,page:{collections:[],nextCursor:null},status:'ready',more:false,retry:vi.fn(),loadMore:vi.fn()});render(<TrainingFixture/>);
 fireEvent.click(screen.getByRole('button',{name:'Shared'}));expect(reads.training).toHaveBeenLastCalledWith('','received');
 fireEvent.click(screen.getByRole('button',{name:'Collections'}));expect(reads.training).toHaveBeenLastCalledWith('','owned');
 fireEvent.click(screen.getByRole('button',{name:'All'}));expect(reads.training).toHaveBeenLastCalledWith('','all');
});
