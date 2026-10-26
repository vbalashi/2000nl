import React,{useState} from 'react';
import {act,fireEvent,render,renderHook,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({page:vi.fn(),refs:vi.fn(),resolved:vi.fn()}));
vi.mock('@/lib/collections/sharing/readableTrainingCatalog',()=>({readTrainingCollectionPage:mock.page,readTrainingCollectionReferences:mock.refs}));
vi.mock('@/lib/events/userEventHints',()=>({useUserEventHints:()=>{}}));
import {CollectionSelectionContext} from '@/components/library/sharing/CollectionSelectionContext';
import {useTrainingSourceReferences} from '@/components/library/sharing/useTrainingSourceReferences';
import {TrainingSourcePicker} from '@/components/training/pilot/TrainingSourcePicker';
import type {TrainingSessionSize} from '@/lib/types';
import type {TrainingSetupDraft} from '@/lib/training/setups/types';
const id='75600000-0000-4000-8000-000000000001',second='75600000-0000-4000-8000-000000000002',row={id,name:'Shared lesson',ownership:'received',availableItemCount:2};
const scope={userId:'reader',languageCode:'nl',onTrainingResolved:mock.resolved};
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('NEXT_PUBLIC_COLLECTION_SHARING_ENABLED','true');mock.page.mockResolvedValue({collections:[row],nextCursor:null});mock.refs.mockResolvedValue([row]);});
afterEach(()=>{vi.unstubAllEnvs();});
function Picker(){const[draft,setDraft]=useState<TrainingSetupDraft & {sessionSize:TrainingSessionSize}>({family:'meaning',scenarioId:'understanding',modes:['word-to-definition'],cardFilter:'both',newReviewRatio:2,dateWindow:'all',sourceValue:'all',materialMode:'collection',listValue:'',sessionSize:5});return <TrainingSourcePicker locale="en" draft={{...draft,sessionSize:5}} onChange={setDraft} lists={Array.from({length:1000},(_,n)=>({value:'user:old-'+n,label:'Legacy '+n}))} dictionaries={[]}/>;}
test('source picker reads one bounded page; search remains available for a single remote match',async()=>{
 render(<CollectionSelectionContext.Provider value={scope}><Picker/></CollectionSelectionContext.Provider>);
 await screen.findByRole('button',{name:'Shared lesson'});expect(mock.page).toHaveBeenCalledOnce();expect(screen.queryByRole('button',{name:'Legacy 0'})).toBeNull();expect(mock.resolved).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Search sources'}));fireEvent.change(screen.getByRole('textbox',{name:'Search sources'}),{target:{value:'Shared'}});
 await waitFor(()=>expect(mock.page).toHaveBeenCalledTimes(2));await screen.findByRole('button',{name:'Shared lesson'});expect(screen.getByRole('textbox',{name:'Search sources'})).toHaveValue('Shared');fireEvent.click(screen.getByRole('button',{name:'Shared lesson'}));expect(mock.resolved).toHaveBeenCalledWith([id],[row]);
});
test('a next cursor is fetched only after explicit Show more',async()=>{
 const first=Array.from({length:50},(_,n)=>({...row,id:n===49?id:'75600000-0000-4000-8000-'+String(n+10).padStart(12,'0'),name:'Lesson '+n}));
 mock.page.mockResolvedValueOnce({collections:first,nextCursor:{id,key:'lesson49',scope:'a'.repeat(64)}}).mockResolvedValueOnce({collections:[{...row,id:second,name:'Next page'}],nextCursor:null});
 render(<CollectionSelectionContext.Provider value={scope}><Picker/></CollectionSelectionContext.Provider>);await screen.findByRole('button',{name:'Show more'});expect(mock.page).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole('button',{name:'Show more'}));await screen.findByRole('button',{name:'Next page'});expect(mock.page).toHaveBeenCalledTimes(2);
});
test('recipe metadata requests only exact IDs, never enumerates a catalog, and aborts old accounts',async()=>{
 let settle!:(value:typeof row[])=>void;mock.refs.mockReturnValueOnce(new Promise(resolve=>settle=resolve)).mockResolvedValueOnce([]);
 const wrapper=({children,user='reader'}:{children:React.ReactNode;user?:string})=><CollectionSelectionContext.Provider value={{...scope,userId:user}}>{children}</CollectionSelectionContext.Provider>;
 const hook=renderHook(()=>useTrainingSourceReferences(['user:'+id,'user:'+id]),{wrapper});await waitFor(()=>expect(mock.refs).toHaveBeenCalledOnce());expect(mock.refs.mock.calls[0][2]).toEqual([id]);expect(mock.page).not.toHaveBeenCalled();hook.unmount();expect(mock.refs.mock.calls[0][3].aborted).toBe(true);await act(async()=>settle([row]));expect(mock.resolved.mock.calls.every(call=>call[1].length===0)).toBe(true);
});
