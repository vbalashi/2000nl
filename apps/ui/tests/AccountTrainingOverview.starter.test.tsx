import React from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {AccountTrainingOverview} from '@/components/training/pilot/AccountTrainingOverview';
import {emptyTrainingSetups,type TrainingSetupsSnapshot} from '@/lib/training/setups/model';
afterEach(cleanup);
function show(snapshot:TrainingSetupsSnapshot, resume=false){
 const launch=vi.fn(),create=vi.fn();
 render(<AccountTrainingOverview ownerId="test" interfaceLanguage="en" languageCode="nl"
  languageOptions={[{value:'nl',label:'Dutch'}]} lists={[]} dictionaries={[{value:'00000000-0000-4000-8000-000000000001',label:'Dictionary'}]} scenarios={[{value:'understanding',label:'Words',modes:['word-to-definition']}]} snapshot={snapshot} accountStatus="ready"
  initialDraft={{family:'meaning',scenarioId:'understanding',modes:['word-to-definition'],cardFilter:'both',listValue:'',sourceValue:'all',newReviewRatio:2,dateWindow:'all',sessionSize:10,materialMode:'all-dictionaries'}}
  ownedSession={resume?{id:"session",completed:0,total:10}:undefined} pending={false} ready continueDisabled={false} materialUnavailable="Unavailable" partialMaterialNotice="Partial" setupUnavailable="Unavailable" translationUnavailable="Unavailable" translationLanguage="en"
  onSelect={vi.fn()} onCreate={create} onDefaultLaunch={launch} onContinue={vi.fn()} onRetry={vi.fn()}/>);
 return {launch,create};
}
test('pending registration cannot launch the fallback but can create a training',()=>{
 const actions=show({...emptyTrainingSetups(),starterStatus:'pending'});
 expect(screen.getByRole('button',{name:'Start training'})).toBeDisabled();
 expect(screen.getByText(/starter training is being prepared/i)).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Create training'}));expect(actions.create).toHaveBeenCalled();expect(actions.launch).not.toHaveBeenCalled();
});
test.each(['not_applicable','complete','superseded'] as const)('empty %s accounts retain ordinary launch',status=>{
 const actions=show({...emptyTrainingSetups(),starterStatus:status});
 fireEvent.click(screen.getByRole('button',{name:'Start training'}));expect(actions.launch).toHaveBeenCalled();
});

test('a previously owned session can resume while starter setup is pending',()=>{
 show({...emptyTrainingSetups(),starterStatus:'pending'},true);
 expect(screen.getByRole('button',{name:'Continue training'})).toBeEnabled();
});

test('early review starts the unsaved current setup',()=>{
 const onEarlyReview=vi.fn();
 const draft={family:'meaning' as const,scenarioId:'understanding',modes:['word-to-definition' as const],cardFilter:'review' as const,listValue:'',sourceValue:'all',newReviewRatio:2,dateWindow:'all' as const,sessionSize:10,materialMode:'all-dictionaries' as const};
 render(<AccountTrainingOverview ownerId="test" interfaceLanguage="en" languageCode="nl" languageOptions={[{value:'nl',label:'Dutch'}]} lists={[]} dictionaries={[{value:'demo',label:'Demo'}]} scenarios={[{value:'understanding',label:'Words',modes:['word-to-definition']}]} snapshot={{...emptyTrainingSetups(),starterStatus:'superseded'}} accountStatus="ready" initialDraft={draft} availability={{trainingId:'current-setup',status:'ready',dueToday:0,totalReviews:4,stillNew:0}} pending={false} ready continueDisabled={false} materialUnavailable="Unavailable" partialMaterialNotice="Partial" setupUnavailable="Unavailable" translationUnavailable="Unavailable" translationLanguage="en" onEarlyReview={onEarlyReview} onSelect={vi.fn()} onCreate={vi.fn()} onDefaultLaunch={vi.fn()} onContinue={vi.fn()} onRetry={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Review ahead'}));
 expect(onEarlyReview).toHaveBeenCalledWith(expect.objectContaining({id:'current-setup',draft}));
});
