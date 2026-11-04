import React from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {TrainingInteractionSettings} from '@/components/practice/ui/TrainingInteractionSettings';
import {defaultTrainingInteractions} from '@/components/practice/ui/TrainingInteractionPreferences';
const save=vi.fn();
vi.mock('@/components/practice/ui/TrainingInteractionPreferences',async importOriginal=>({...await importOriginal<object>(),useTrainingInteractions:()=>({preferences:defaultTrainingInteractions,save,loadStatus:'ready',saveStatus:'idle',reload:vi.fn()})}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
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
