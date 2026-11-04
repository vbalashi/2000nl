import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {TrainingInteractionSettings} from '@/components/practice/ui/TrainingInteractionSettings';
import {defaultTrainingInteractions} from '@/components/practice/ui/TrainingInteractionPreferences';
const save=vi.fn();
const state=vi.hoisted(()=>({preferences:null as null | Record<string,unknown>}));
vi.mock('@/components/practice/ui/TrainingInteractionPreferences',async importOriginal=>({...await importOriginal<object>(),useTrainingInteractions:()=>({preferences:state.preferences??defaultTrainingInteractions,save,loadStatus:'ready',saveStatus:'idle',reload:vi.fn()})}));
afterEach(()=>{cleanup();vi.clearAllMocks();vi.useRealTimers();state.preferences=null;});
test.each([
 {language:'en',count:'Always show card count',animation:'Card animation',grade:'Swipe to rate'},
 {language:'ru',count:'Всегда показывать количество карточек',animation:'Анимация карточки',grade:'Оценка свайпом'},
 {language:'nl',count:'Aantal kaarten altijd tonen',animation:'Kaartanimatie',grade:'Beoordelen met een veeg'},
] as const)('accessible switches and grouped gestures in $language',({language,count,animation,grade})=>{
 render(<TrainingInteractionSettings language={language}/>);
 const switches=screen.getAllByRole('switch');
 expect(switches).toHaveLength(6);
 expect(screen.getAllByRole('group').find(el=>el.querySelector('[role=switch]'))!.querySelectorAll('[role=switch]')).toHaveLength(4);
 expect(screen.getByRole('switch',{name:count})).toHaveAttribute('aria-checked','false');
 expect(screen.getByRole('switch',{name:animation})).toHaveAttribute('aria-checked','true');
 const gradeSwitch=screen.getByRole('switch',{name:grade});
 expect(gradeSwitch).toHaveAttribute('aria-checked','false');
 fireEvent.click(gradeSwitch);
 expect(save).toHaveBeenCalledWith({...defaultTrainingInteractions,gradeSwipe:true});
 for(const help of screen.getAllByRole('button').filter(button=>button.hasAttribute('aria-controls'))) expect(document.getElementById(help.getAttribute('aria-controls')!)).toHaveAttribute('popover','auto');
});

test('progress options save the account choice without changing gestures',()=>{
 render(<TrainingInteractionSettings language="ru"/>);
 expect(screen.getByRole('button',{name:'Точки'})).toHaveAttribute('aria-pressed','true');
 for(const [name,progressAnimation] of [['Волна','wave'],['Выключена','off']] as const){
  fireEvent.click(screen.getByRole('button',{name}));
  expect(save).toHaveBeenLastCalledWith({...defaultTrainingInteractions,progressAnimation});
 }
});


test('count help explains unlimited and animation-off exceptions',()=>{
 render(<TrainingInteractionSettings language="en"/>);
 const help=screen.getByRole('button',{name:'? Always show card count'});
 const text=document.getElementById(help.getAttribute('aria-controls')!)!;
 expect(text).toHaveTextContent('always visible in unlimited sessions or when progress animation is Off');
});

test('live preview follows the saved progress choice and optional count',()=>{
 vi.useFakeTimers();
 const view=render(<TrainingInteractionSettings language="en"/>);
 expect(screen.getAllByRole('progressbar')).toHaveLength(2);
 expect(screen.queryAllByTestId('progress-preview-count')).toHaveLength(0);
 expect(screen.getByText(/Up to 30 cards/)).toBeVisible();
 state.preferences={...defaultTrainingInteractions,progressAnimation:'off'};
 view.rerender(<TrainingInteractionSettings language="en"/>);
 expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
 expect(screen.getAllByTestId('progress-preview-count').map(el=>el.textContent)).toEqual(['6 / 20','6 / 40']);
 state.preferences={...defaultTrainingInteractions,progressAnimation:'wave',alwaysShowCardCount:true};
 view.rerender(<TrainingInteractionSettings language="en"/>);
 expect(screen.getAllByRole('progressbar').every(el=>el.dataset.variant==='wave')).toBe(true);
 expect(screen.getAllByTestId('progress-preview-count')).toHaveLength(2);
});


test('preview advances but stays still with reduced motion',()=>{
 vi.useFakeTimers();
 const media={matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()};
 const match=vi.spyOn(window,'matchMedia').mockReturnValue(media as unknown as MediaQueryList);
 const view=render(<TrainingInteractionSettings language="en"/>);
 act(()=>vi.advanceTimersByTime(1800));
 expect(screen.getAllByRole('progressbar').every(el=>el.getAttribute('aria-valuenow')==='7')).toBe(true);
 view.unmount();
 media.matches=true;
 render(<TrainingInteractionSettings language="en"/>);
 act(()=>vi.advanceTimersByTime(5400));
 expect(screen.getAllByRole('progressbar').every(el=>el.getAttribute('aria-valuenow')==='6')).toBe(true);
 match.mockRestore();
});
