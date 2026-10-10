import React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {TrainingInteractionPreferencesProvider,useTrainingInteractions,defaultTrainingInteractions} from '@/components/practice/ui/TrainingInteractionPreferences';
import {HeadwordWithPronunciationBreaks} from '@/components/training/HeadwordWithPronunciationBreaks';
import {useTranslationSwipe,useCardVerticalSwipe} from '@/components/practice/ui/useTranslationSwipe';
import {trainingInteractionRepository} from '@/lib/preferences/trainingInteractionRepository';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function State(){const {preferences,save,saveStatus,loadStatus}=useTrainingInteractions();return <><output>{JSON.stringify(preferences)}</output><span>{loadStatus}/{saveStatus}</span><button onClick={()=>void save({...preferences,animation:!preferences.animation})}>Toggle</button></>;}
test('defaults keep every optional gesture off',()=>{render(<State/>);expect(screen.getByRole('status')).toHaveTextContent(JSON.stringify(defaultTrainingInteractions));});
test('loads account preferences and saves only interaction columns',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({training_animation_enabled:false,training_grade_swipe_enabled:true}),{status:200})).mockResolvedValueOnce(new Response(null,{status:201}));vi.stubGlobal('fetch',fetch);
 const loaded=await trainingInteractionRepository.load('owner');expect(loaded).toEqual({...defaultTrainingInteractions,animation:false,gradeSwipe:true});
 await trainingInteractionRepository.save('owner',loaded);
 expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({user_id:'owner',training_animation_enabled:false,training_grade_swipe_enabled:true,training_translation_swipe_enabled:false,training_syllable_double_tap_enabled:false,training_show_syllables:false,training_audio_swipe_enabled:false,training_progress_animation:'dots'});
});
test('failed saving keeps the confirmed account choice; returning to the app reloads account preferences',async()=>{
 const repository={load:vi.fn().mockResolvedValue(defaultTrainingInteractions),save:vi.fn().mockRejectedValue(new Error())};
 render(<TrainingInteractionPreferencesProvider userId="owner" repository={repository}><State/></TrainingInteractionPreferencesProvider>);
 await screen.findByText('ready/idle');fireEvent.click(screen.getByText('Toggle'));await screen.findByText('ready/error');
 expect(screen.getByRole('status')).toHaveTextContent('"animation":true');
 repository.load.mockResolvedValue({...defaultTrainingInteractions,animation:false});fireEvent(window,new Event('focus'));
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('"animation":false'));
});
test('a late previous-account response cannot replace the next account settings',async()=>{
 let resolve!:(v:typeof defaultTrainingInteractions)=>void;
 const repository={load:vi.fn().mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValue({...defaultTrainingInteractions,animation:false}),save:vi.fn()};
 const view=(id:string)=><TrainingInteractionPreferencesProvider userId={id} repository={repository}><State/></TrainingInteractionPreferencesProvider>;
 const {rerender}=render(view('first'));rerender(view('second'));await screen.findByText('ready/idle');
 await act(async()=>resolve(defaultTrainingInteractions));expect(screen.getByRole('status')).toHaveTextContent('"animation":false');
});
test('last syllable choice is shared across words and survives a new session',async()=>{
 let stored={...defaultTrainingInteractions,syllableDoubleTap:true};
 const repository={load:vi.fn(async()=>stored),save:vi.fn(async(_id:string,value:typeof stored)=>{stored=value;})};
 const view=(text="wed·strijd")=><TrainingInteractionPreferencesProvider userId="owner" repository={repository}><HeadwordWithPronunciationBreaks text={text}/><HeadwordWithPronunciationBreaks text="bui·gen"/></TrainingInteractionPreferencesProvider>;
 const {rerender,unmount}=render(view());
 await waitFor(()=>expect(screen.getByRole('button',{name:'wedstrijd'})).toHaveAttribute('aria-pressed','false'));
 const word=screen.getByRole('button',{name:'wedstrijd'});expect(word).toHaveTextContent('wedstrijd');
 fireEvent.doubleClick(word);expect(word).toHaveTextContent('wed·strijd');expect(screen.getByRole('button',{name:'buigen'})).toHaveTextContent('bui·gen');
 await waitFor(()=>expect(stored.showSyllables).toBe(true));
 rerender(view('an·der'));expect(screen.getByRole('button',{name:'ander'})).toHaveTextContent('an·der');
 unmount();render(view());
 await waitFor(()=>expect(screen.getByRole('button',{name:'wedstrijd'})).toHaveTextContent('wed·strijd'));
 fireEvent.keyDown(screen.getByRole('button',{name:'wedstrijd'}),{key:'Enter'});expect(screen.getByRole('button',{name:'buigen'})).toHaveTextContent('buigen');
 await waitFor(()=>expect(stored.showSyllables).toBe(false));
});
test('disabled gesture renders plain words and words without syllables have no gesture',()=>{
 render(<TrainingInteractionPreferencesProvider userId="owner" initial={{...defaultTrainingInteractions,showSyllables:true}}><HeadwordWithPronunciationBreaks text="wed·strijd"/><HeadwordWithPronunciationBreaks text="plain"/></TrainingInteractionPreferencesProvider>);
 expect(screen.queryByRole('button')).toBeNull();expect(document.body).toHaveTextContent('wedstrijdplain');
});
test('rapid toggles are saved in order',async()=>{
 let finish!:()=>void;
 const repository={load:vi.fn(),save:vi.fn().mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;})).mockResolvedValue(undefined)};
 render(<TrainingInteractionPreferencesProvider userId="owner" initial={{...defaultTrainingInteractions,syllableDoubleTap:true}} repository={repository}><HeadwordWithPronunciationBreaks text="wed·strijd"/></TrainingInteractionPreferencesProvider>);
 const word=screen.getByRole('button',{name:'wedstrijd'});fireEvent.doubleClick(word);await waitFor(()=>expect(repository.save).toHaveBeenCalledOnce());fireEvent.doubleClick(word);expect(word).toHaveTextContent('wedstrijd');
 await act(async()=>finish());await waitFor(()=>expect(repository.save).toHaveBeenCalledTimes(2));expect(repository.save.mock.calls[1][1].showSyllables).toBe(false);
});
test('touch double-tap toggles once and does not mistake a drag for a tap',async()=>{
 const repository={load:vi.fn(),save:vi.fn().mockResolvedValue(undefined)};
 render(<TrainingInteractionPreferencesProvider userId="owner" initial={{...defaultTrainingInteractions,syllableDoubleTap:true}} repository={repository}><HeadwordWithPronunciationBreaks text="re·ˈcord"/></TrainingInteractionPreferencesProvider>);
 const word=screen.getByRole('button',{name:'record'});
 const pointer=(type:string,y=100)=>fireEvent(word,Object.assign(new Event(type,{bubbles:true}),{pointerType:'touch',isPrimary:true,clientX:100,clientY:y}));
 pointer('pointerdown');pointer('pointerup');pointer('pointerdown');pointer('pointerup');
 expect(word).toHaveTextContent('re·ˈcord');fireEvent.doubleClick(word);expect(word).toHaveTextContent('re·ˈcord');
 pointer('pointerdown');pointer('pointerup',140);pointer('pointerdown');pointer('pointerup');expect(word).toHaveTextContent('re·ˈcord');
 await waitFor(()=>expect(repository.save).toHaveBeenCalledOnce());
});
test('turning the gesture off hides syllables, re-enabling restores the remembered display',async()=>{
 const repository={load:vi.fn(),save:vi.fn().mockResolvedValue(undefined)};
 function Toggle(){const {preferences,save}=useTrainingInteractions();return <button onClick={()=>void save({...preferences,syllableDoubleTap:!preferences.syllableDoubleTap})}>Gesture</button>;}
 render(<TrainingInteractionPreferencesProvider userId="owner" initial={{...defaultTrainingInteractions,syllableDoubleTap:true,showSyllables:true}} repository={repository}><div data-testid="word"><HeadwordWithPronunciationBreaks text="wed·strijd"/></div><Toggle/></TrainingInteractionPreferencesProvider>);
 fireEvent.click(screen.getByText('Gesture'));expect(screen.getByTestId('word')).toHaveTextContent('wedstrijd');expect(screen.queryByRole('button',{name:'wedstrijd'})).toBeNull();
 await waitFor(()=>expect(repository.save).toHaveBeenCalledOnce());fireEvent.click(screen.getByText('Gesture'));expect(screen.getByRole('button',{name:'wedstrijd'})).toHaveTextContent('wed·strijd');
 await waitFor(()=>expect(repository.save).toHaveBeenCalledTimes(2));
});
function Swipe({onToggle,enabled=true}:{onToggle:()=>void;enabled?:boolean}){const root=React.useRef<HTMLDivElement>(null);useTranslationSwipe({root,enabled,onToggle});return <div ref={root}><article data-testid="training-sense-card-shell"><div data-testid="lower">Lower card</div><div data-testid="scroll" style={{overflowY:'auto'}}>Long answer</div><button>Translation</button></article></div>;}
function stroke(node:HTMLElement,dx=0,dy=60){fireEvent.touchStart(node,{touches:[{clientX:100,clientY:200}]});fireEvent.touchMove(node,{touches:[{clientX:100+dx,clientY:200+dy}]});fireEvent.touchEnd(node,{touches:[],changedTouches:[{clientX:100+dx,clientY:200+dy}]});}
test('downward strokes work in the lower non-scrolling card, ignore scroll, sideways and interactive controls',()=>{
 const onToggle=vi.fn();render(<TrainingInteractionPreferencesProvider userId="test" initial={{...defaultTrainingInteractions,translationSwipe:true}}><Swipe onToggle={onToggle}/></TrainingInteractionPreferencesProvider>);
 stroke(screen.getByTestId('lower'));expect(onToggle).toHaveBeenCalledOnce();
 const scroll=screen.getByTestId('scroll');Object.defineProperties(scroll,{scrollHeight:{value:800},clientHeight:{value:300}});
 stroke(scroll);stroke(screen.getByTestId('lower'),80,20);stroke(screen.getByTestId('lower'),0,200);stroke(screen.getByRole('button',{name:'Translation'}));
 expect(onToggle).toHaveBeenCalledOnce();
});
test('disabled translation gesture never intercepts or toggles',()=>{const onToggle=vi.fn();render(<Swipe onToggle={onToggle}/>);stroke(screen.getByTestId('lower'));expect(onToggle).not.toHaveBeenCalled();});

test('plain display uses the canonical headword rather than guessing from pronunciation',()=>{
 render(<HeadwordWithPronunciationBreaks text="má·ken" plainText="maken"/>);
 expect(document.body).toHaveTextContent('maken');expect(document.body).not.toHaveTextContent('máken');
});

test('plain canonical headword keeps invisible pronunciation-based wrap points',()=>{
 render(<HeadwordWithPronunciationBreaks text="ar·beids·on·ge·schikt·heids·ver·ze·ke·ring" plainText="arbeidsongeschiktheidsverzekering"/>);
 expect(document.body).toHaveTextContent('arbeidsongeschiktheidsverzekering');
 expect(document.body).not.toHaveTextContent('·');
 expect(document.querySelectorAll('wbr')).toHaveLength(9);
});

test('audio swipe is an opt-in upward stroke and preserves scrolling and controls',()=>{
 const onPlayAudio=vi.fn(), onToggle=vi.fn();
 function AudioSwipe(){const root=React.useRef<HTMLDivElement>(null);useCardVerticalSwipe({root,enabled:true,audioEnabled:true,onToggle,onPlayAudio});return <div ref={root}><article data-testid="training-sense-card-shell"><div data-testid="lower">Lower card</div><div data-testid="scroll" style={{overflowY:'auto'}}>Long answer</div><button>Audio</button></article></div>;}
 const view=(enabled:boolean)=><TrainingInteractionPreferencesProvider userId="owner" initial={{...defaultTrainingInteractions,audioSwipe:enabled,translationSwipe:true}}><AudioSwipe/></TrainingInteractionPreferencesProvider>;
 const {unmount}=render(view(false));stroke(screen.getByTestId('lower'),0,-60);expect(onPlayAudio).not.toHaveBeenCalled();
 unmount();render(view(true));stroke(screen.getByTestId('lower'),0,-60);expect(onPlayAudio).toHaveBeenCalledOnce();expect(onToggle).not.toHaveBeenCalled();
 stroke(screen.getByTestId('lower'));expect(onToggle).toHaveBeenCalledOnce();
 const scroll=screen.getByTestId('scroll');Object.defineProperties(scroll,{scrollHeight:{value:800},clientHeight:{value:300}});
 stroke(scroll,0,-60);stroke(screen.getByRole('button',{name:'Audio'}),0,-60);stroke(screen.getByTestId('lower'),60,-15);stroke(screen.getByTestId('lower'),0,-200);
 expect(onPlayAudio).toHaveBeenCalledOnce();
});
