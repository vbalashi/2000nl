import React from 'react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {act,cleanup,fireEvent,render,renderHook,screen} from '@testing-library/react';
import {MeaningLearningProgress} from '@/components/practice/MeaningLearningProgress';
import {useMeaningLearningActions} from '@/components/training/library-v2/useMeaningLearningActions';
import {fetchMeaningProgress,resumeMeaningProgress} from '@/lib/platform/meaningProgressClient';
import {getUiMessages} from '@/lib/uiMessages';
import type {MeaningLearningProgress as Progress} from '../../../packages/shared/types/meaningLearningProgress';
const exclude=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/platform/meaningProgressClient',()=>({fetchMeaningProgress:vi.fn(),resumeMeaningProgress:vi.fn()}));
vi.mock('@/components/training/v2/useTrainingExclusion',()=>({useTrainingExclusion:()=>({exclude,busy:false,failed:false})}));
const progress=(exclusionId:string|null):Progress=>({entryId:'active',headword:'bank',revision:'a'.repeat(64),exclusionId,directions:['word-to-definition','definition-to-word'].map(cardTypeId=>({cardTypeId:cardTypeId as 'word-to-definition'|'definition-to-word',stateRevision:'revision',knownMarkId:'known',knownMarkRevision:'revision',knownMarkedAt:null,phase:'learning',presentations:1,gradedAttempts:0,lastGrade:null,lastReviewedAt:null,nextReviewAt:null,stability:null,difficulty:null}))});
beforeEach(()=>{
 vi.clearAllMocks();
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value(){this.setAttribute('open','');}});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value(){this.removeAttribute('open');}});
});
afterEach(cleanup);
test('owner hook rejects active resume and word-wide exclusion without any write',async()=>{
 const {result}=renderHook(()=>useMeaningLearningActions('active','user',undefined,undefined,{active:true,headword:true}));
 await act(async()=>{await result.current.resume();await result.current.exclude();});
 expect(fetchMeaningProgress).not.toHaveBeenCalled();expect(resumeMeaningProgress).not.toHaveBeenCalled();expect(exclude).not.toHaveBeenCalled();
});
test('sibling resume reads fresh state and rejects a shared exclusion restore',async()=>{
 vi.mocked(fetchMeaningProgress).mockResolvedValue(progress('shared-exclusion'));
 const {result}=renderHook(()=>useMeaningLearningActions('sibling','user',undefined,undefined,{active:false,headword:true}));
 await act(async()=>{await result.current.resume();await result.current.exclude();});
 expect(fetchMeaningProgress).toHaveBeenCalledOnce();expect(resumeMeaningProgress).not.toHaveBeenCalled();expect(exclude).not.toHaveBeenCalled();expect(result.current.busy).toBe(false);
});
test('sibling resume remains available when it does not restore a shared exclusion',async()=>{
 vi.mocked(fetchMeaningProgress).mockResolvedValue(progress(null));
 vi.mocked(resumeMeaningProgress).mockResolvedValue(progress(null));
 const {result}=renderHook(()=>useMeaningLearningActions('sibling','user',undefined,undefined,{active:false,headword:true}));
 await act(async()=>{await result.current.resume();});
 expect(resumeMeaningProgress).toHaveBeenCalledOnce();
});
for(const active of [true,false])test(`progress sheet blocks ${active?'active entry':'shared word'} resume`,async()=>{
 vi.mocked(fetchMeaningProgress).mockResolvedValue(progress('shared-exclusion'));
 render(<MeaningLearningProgress entryId="active" language="en" learningActionsBlocked={active} headwordActionsBlocked onClose={vi.fn()}/>);
 const resume=await screen.findByRole('button',{name:getUiMessages('en').learningProgress.resume});
 expect(resume).toBeDisabled();fireEvent.click(resume);
 expect(resumeMeaningProgress).not.toHaveBeenCalled();
 expect(screen.getByRole('note')).toHaveTextContent(/training screen/);
});
