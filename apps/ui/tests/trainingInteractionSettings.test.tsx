import React from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {TrainingInteractionSettings} from '@/components/practice/ui/TrainingInteractionSettings';
import {defaultTrainingInteractions} from '@/components/practice/ui/TrainingInteractionPreferences';
const save=vi.fn();
vi.mock('@/components/practice/ui/TrainingInteractionPreferences',async importOriginal=>({...await importOriginal<object>(),useTrainingInteractions:()=>({preferences:defaultTrainingInteractions,save,loadStatus:'ready',saveStatus:'idle',reload:vi.fn()})}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
test.each(['en','ru','nl'] as const)('accessible switches and grouped gestures in %s',language=>{
 render(<TrainingInteractionSettings language={language}/>);
 const switches=screen.getAllByRole('switch');
 expect(switches).toHaveLength(5);
 expect(screen.getByRole('group').querySelectorAll('[role=switch]')).toHaveLength(4);
 expect(switches[0]).toHaveAttribute('aria-checked','true');
 expect(switches[1]).toHaveAttribute('aria-checked','false');
 fireEvent.click(switches[1]);
 expect(save).toHaveBeenCalledWith({...defaultTrainingInteractions,gradeSwipe:true});
 for(const help of screen.getAllByRole('button')) expect(document.getElementById(help.getAttribute('aria-controls')!)).toHaveAttribute('popover','auto');
});
