import React from 'react';
import {fireEvent,render,screen,cleanup} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {TrainingOverview,type TrainingOverviewItem,type TrainingOverviewState} from '@/components/practice/TrainingOverview';
afterEach(cleanup);
const items:TrainingOverviewItem[]=[{id:'a',name:'Words',language:'Dutch',description:'Words · Direct',summary:'Dutch · 20 exercises',completedToday:12,meaningCount:36,sessionSize:20,canLaunch:true},{id:'b',name:'Idioms',language:'Dutch',description:'Idioms · Direct',summary:'Dutch · 10 exercises',completedToday:null,meaningCount:null,sessionSize:10,canLaunch:true}];
function setup(state:TrainingOverviewState={status:'ready',trainings:items,mainId:'a'},interfaceLanguage:'en'|'nl'|'ru'='en'){const callbacks={onLaunch:vi.fn(),onResume:vi.fn(),onEdit:vi.fn(),onCreate:vi.fn(),onRetry:vi.fn()};render(<TrainingOverview state={state} interfaceLanguage={interfaceLanguage} {...callbacks}/>);return callbacks;}
test('edit and launch take the stable training identity directly',()=>{const c=setup();fireEvent.click(screen.getAllByRole('button',{name:'Edit Idioms'})[0]);expect(c.onEdit).toHaveBeenCalledWith('b');fireEvent.click(screen.getByRole('button',{name:'Start training'}));expect(c.onLaunch).toHaveBeenCalledWith('a');expect(screen.queryByRole('dialog')).toBeNull();});
test('an unfinished session overrides the main routine and resumes its identity',()=>{const c=setup({status:'ready',trainings:items,mainId:'a',resume:{sessionId:'session-b',trainingId:'b',completed:3,total:10}});fireEvent.click(screen.getByRole('button',{name:'Continue training'}));expect(c.onResume).toHaveBeenCalledWith('session-b');expect(c.onLaunch).not.toHaveBeenCalled();expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow','3');});
test('unknown activity is omitted rather than presented as zero',()=>{setup({status:'ready',trainings:items,mainId:'b'});expect(screen.queryByText('done today')).toBeNull();expect(screen.queryByText('meanings')).toBeNull();expect(screen.getByText('per session').nextElementSibling).toHaveTextContent('10');});
test('loading, failure and empty are distinct actionable states',()=>{setup({status:'loading'});expect(screen.getByRole('status')).toHaveTextContent('Loading');expect(screen.queryByRole('button')).toBeNull();cleanup();let c=setup({status:'error',message:'Could not load training.'});fireEvent.click(screen.getByRole('button',{name:'Try again'}));expect(c.onRetry).toHaveBeenCalled();cleanup();c=setup({status:'ready',trainings:[],mainId:null});fireEvent.click(screen.getByRole('button',{name:'Create training'}));expect(c.onCreate).toHaveBeenCalled();});
test('unavailable training cannot start and explains why',()=>{setup({status:'ready',mainId:'a',trainings:[{...items[0],canLaunch:false,unavailableReason:'Source unavailable.'}]});expect(screen.getByRole('button',{name:'Start training'})).toBeDisabled();expect(screen.getByRole('status')).toHaveTextContent('Source unavailable.');});
test('a deleted main identity does not hide other saved training',()=>{setup({status:'ready',mainId:'deleted',trainings:[items[1]]});expect(screen.getByRole('button',{name:'Start Idioms'})).toBeEnabled();});

test('resumed session shows its own completed count, not total activity today',()=>{
 setup({status:'ready',trainings:items,mainId:'a',resume:{sessionId:'second-session',trainingId:'a',completed:4,total:20}});
 expect(screen.getByText('done').nextElementSibling).toHaveTextContent('4');
 expect(screen.getByText('remaining').nextElementSibling).toHaveTextContent('16');
 expect(screen.queryByText('done today')).toBeNull();
 expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow','4');
});
test('the shared overview localizes visible and accessible actions in Dutch',()=>{
 const c=setup({status:'ready',trainings:items,mainId:'a',resume:{sessionId:'session-a',trainingId:'a',completed:4,total:20}},'nl');
 expect(screen.getByRole('region',{name:'Huidige training'})).toBeInTheDocument();
 expect(screen.getByText('resterend').nextElementSibling).toHaveTextContent('16');
 expect(screen.getByRole('progressbar',{name:'Voortgang van de sessie'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Training hervatten'}));
 expect(c.onResume).toHaveBeenCalledWith('session-a');
 expect(screen.getByRole('button',{name:'Idioms aanpassen'})).toBeInTheDocument();
});
test('Russian overview copy preserves the training name and localizes the action',()=>{
 setup(undefined,'ru');
 expect(screen.getByRole('button',{name:'Изменить «Idioms»'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Начать «Idioms»'})).toBeInTheDocument();
 expect(screen.getByText('Сохранённые тренировки')).toBeInTheDocument();
});

 test('unknown resumed total does not manufacture remaining cards or a progress bar',()=>{setup({status:'ready',trainings:items,mainId:'a',resume:{sessionId:'unknown-total',trainingId:'a',completed:3,total:null}});expect(screen.getByText('remaining').nextElementSibling).toHaveTextContent('—');expect(screen.queryByRole('progressbar')).toBeNull();});

test('highlighted training remains in the complete saved list',()=>{setup();expect(screen.getByRole('button',{name:'Start Words'})).toBeEnabled();expect(screen.getByRole('button',{name:'Start Idioms'})).toBeEnabled();});
test('zero-card plans are not resumable or in progress',()=>{setup({status:'ready',trainings:items,mainId:'a',resume:{sessionId:'empty',trainingId:'a',completed:0,total:0}});expect(screen.queryByRole('button',{name:'Continue training'})).toBeNull();expect(screen.queryByText('IN PROGRESS')).toBeNull();expect(screen.getByRole('button',{name:'Start training'})).toBeEnabled();});

test('empty due-only hero replaces Start with early review before Adjust',()=>{
 const onEarlyReview=vi.fn();const onLaunch=vi.fn();
 render(<TrainingOverview state={{status:'ready',trainings:items,mainId:'a',emptyTraining:{trainingId:'a',message:'No cards are due for review now.',canReviewAhead:true}}} onEarlyReview={onEarlyReview} onLaunch={onLaunch} onResume={vi.fn()} onEdit={vi.fn()} onCreate={vi.fn()} onRetry={vi.fn()}/>);
 expect(screen.queryByRole('button',{name:'Start training'})).toBeNull();
 const action=screen.getByRole('button',{name:'Review ahead'});
 expect(screen.getByRole('status').compareDocumentPosition(action)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 fireEvent.click(action);expect(onEarlyReview).toHaveBeenCalledWith('a');expect(onLaunch).not.toHaveBeenCalled();
 expect(screen.getByRole('button',{name:'Start Words'})).toBeEnabled();
});
test('exhausted early-review hero offers adjustment without another empty Start',()=>{
 setup({status:'ready',trainings:items,mainId:'a',emptyTraining:{trainingId:'a',message:'No eligible review cards.',canReviewAhead:false}});
 expect(screen.queryByRole('button',{name:'Start training'})).toBeNull();
 expect(screen.queryByRole('button',{name:'Review ahead'})).toBeNull();
 expect(screen.getByRole('button',{name:'Adjust'})).toBeEnabled();
});
