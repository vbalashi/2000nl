import React from 'react';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
import {parseTourRecord,tourStorageKey,tourFlows,tourCopy,topics,pausePoint} from '@/lib/onboarding/model';
import {OnboardingProvider,OnboardingSettings,useOnboardingQueryLocked} from '@/components/onboarding/Onboarding';
import {ONBOARDING_SIGNAL,signalOnboarding} from '@/lib/onboarding/signals';
vi.mock('react-joyride',()=>({Joyride:()=>null}));
const port={prepare:vi.fn(),pause:vi.fn(),completeCore:vi.fn()};
const record={version:1 as const,topic:'collections' as const,step:3,status:'paused' as const,coreCompleted:true};
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();});
function Locked(){return <output data-testid="locked">{String(useOnboardingQueryLocked())}</output>;}
function renderGuide(userId='one',autoStart=false){return render(<OnboardingProvider key={userId} userId={userId} autoStart={autoStart} language="ru" port={port}><OnboardingSettings collections sharing/><Locked/></OnboardingProvider>);}
test('every topic uses complete localization keys with stable step ids',()=>{
 for(const topic of topics){const ids=tourFlows[topic].map(step=>step.id);expect(new Set(ids).size).toBe(ids.length);for(const step of tourFlows[topic])for(const lang of ['en','nl','ru'] as const){expect(tourCopy[lang][step.title]).toBeTruthy();expect(tourCopy[lang][step.body]).toBeTruthy();}}
});
test('checkpoint validation rejects invalid topic, phase, version, and corrupt JSON',()=>{
 expect(parseTourRecord(JSON.stringify(record))).toEqual(record);
 for(const patch of [{topic:'__proto__'},{step:-1},{step:1000},{step:0.5},{version:2},{status:'skip'},{coreCompleted:0}])expect(parseTourRecord(JSON.stringify({...record,...patch}))).toBeNull();
 expect(parseTourRecord('{')).toBeNull();
});
test('saved pause is account scoped; resume opens a stable real topic entry after reload',async()=>{
 localStorage.setItem(tourStorageKey('one'),JSON.stringify(record));const view=renderGuide();
 fireEvent.click(await screen.findByRole('button',{name:'Продолжить знакомство'}));expect(port.prepare).toHaveBeenCalledWith('collections',0);
 expect(screen.getByTestId('locked')).toHaveTextContent('true');
 view.unmount();renderGuide('two');expect(screen.queryByRole('button',{name:'Продолжить знакомство'})).toBeNull();expect(screen.getByTestId('locked')).toHaveTextContent('false');
});
test('first use begins with languages once, existing users can start manually',async()=>{
 renderGuide('new',true);await waitFor(()=>expect(port.prepare).toHaveBeenCalledWith('core',0));expect(port.completeCore).not.toHaveBeenCalled();
 await waitFor(()=>expect(parseTourRecord(localStorage.getItem(tourStorageKey('new')))?.status).toBe('running'));
});
test('unavailable features are omitted from settings rather than sending users to missing controls',()=>{
 render(<OnboardingProvider userId="one" autoStart={false} language="en" port={port}><OnboardingSettings collections={false} sharing={false}/></OnboardingProvider>);
 expect(screen.queryByRole('button',{name:tourCopy.en.sharingTopic})).toBeNull();expect(screen.queryByRole('button',{name:tourCopy.en.incomingTopic})).toBeNull();expect(screen.queryByRole('button',{name:tourCopy.en.collectionsTopic})).toBeNull();
});
test('denied storage leaves topic controls usable and reports that resume is unavailable',async()=>{
 const denied=vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw Error('denied');});
 try{renderGuide();fireEvent.click(screen.getByRole('button',{name:tourCopy.ru.sharingTopic}));await screen.findByRole('alert');expect(port.prepare).toHaveBeenCalledWith('sharing',0);}finally{denied.mockRestore();}
});
test('accepted action signals carry only the action type, never card or account data',()=>{
 const listener=vi.fn();window.addEventListener(ONBOARDING_SIGNAL,listener);act(()=>signalOnboarding('training-saved'));expect(listener.mock.calls[0][0].detail).toBe('training-saved');window.removeEventListener(ONBOARDING_SIGNAL,listener);
});

test('pausing a native panel resumes through its real opener without marking the topic complete',()=>{
 for(const [topic,id,opener] of [['collections','membership','collections'],['collections','name','save'],['card','return','details'],['stats','progress','status'],['sharing','code','more']] as const){const step=tourFlows[topic].findIndex(item=>item.id===id);const checkpoint={...record,topic,step,status:'running' as const};expect(tourFlows[topic][pausePoint(checkpoint)].id).toBe(opener);}
});

test('reloading a completed guide does not navigate or save completion again',async()=>{
 localStorage.setItem(tourStorageKey('one'),JSON.stringify({...record,status:'complete',topic:'core',step:tourFlows.core.length-1}));renderGuide();
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Продолжить знакомство'})).toBeNull());
 expect(port.prepare).not.toHaveBeenCalled();expect(port.pause).not.toHaveBeenCalled();expect(port.completeCore).not.toHaveBeenCalled();
});
