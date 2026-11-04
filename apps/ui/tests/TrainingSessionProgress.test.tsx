import React from 'react';
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {TrainingSessionProgress} from '@/components/training/v2/TrainingSessionProgress';
import {parseTrainingInteractions} from '@/lib/preferences/trainingInteractions';
afterEach(cleanup);
const planned={kind:'planned' as const,position:7,total:15,fraction:7/15};
test('oversized legacy plans do not sample several cards into one dot',()=>{
 const {container}=render(<TrainingSessionProgress presentation={{...planned,total:2000,fraction:7/2000}} language="ru" variant="dots"/>);
 expect(container.querySelectorAll("span")).toHaveLength(1);
 expect(screen.getByRole("progressbar")).toHaveAttribute("data-variant","line");
});
test('off and infinite sessions render no progress region',()=>{
 const {rerender,container}=render(<TrainingSessionProgress presentation={planned} language="en" variant="off"/>);
 expect(container).toBeEmptyDOMElement();
 rerender(<TrainingSessionProgress presentation={{kind:'ordinal',position:99}} language="en" variant="wave"/>);
 expect(container).toBeEmptyDOMElement();
});
test('reduced motion snaps to the accepted position and wave follows its path',()=>{
 const match=vi.spyOn(window,'matchMedia').mockReturnValue({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()} as unknown as MediaQueryList);
 const {rerender,container}=render(<TrainingSessionProgress presentation={planned} language="en" variant="wave"/>);
 rerender(<TrainingSessionProgress presentation={{...planned,position:10,fraction:10/15}} language="en" variant="wave"/>);
 expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow','10');
 expect(container.querySelectorAll('path')[1]).toHaveAttribute('stroke-dasharray',`${9/14} 1`);
 match.mockRestore();
});
test('progress preferences accept all three modes and recover invalid legacy values',()=>{
 for(const progressAnimation of ['off','dots','wave']) expect(parseTrainingInteractions({progressAnimation}).progressAnimation).toBe(progressAnimation);
 expect(parseTrainingInteractions({progressAnimation:true}).progressAnimation).toBe('dots');
});

test('dots land on a mark instead of stopping partway through a jump',()=>{
 const {container}=render(<TrainingSessionProgress presentation={{...planned,position:6,fraction:6/15}} language="en" variant="dots"/>);
 const marks=Array.from(container.querySelectorAll('span'));
 const runner=marks.pop()!;
 expect(marks.some(mark=>mark.style.left===runner.style.left && mark.style.top===runner.style.top)).toBe(true);
});

test('completed dots are joined by a subtle thread',()=>{
 const {container}=render(<TrainingSessionProgress presentation={planned} language="en" variant="dots"/>);
 expect(container.querySelector('polyline')?.getAttribute('points')?.split(' ')).toHaveLength(7);
});

test.each([4,6])('twenty-card plan has one dot per card and %i completed marks', completed=>{
 const {container}=render(<TrainingSessionProgress presentation={{kind:'planned',position:completed,total:20,fraction:completed/20}} language="en" variant="dots"/>);
 const marks=Array.from(container.querySelectorAll('span')).slice(0,-1);
 expect(marks).toHaveLength(20);
 expect(marks.filter(mark=>mark.style.opacity==='0.48')).toHaveLength(completed);
 expect(container.querySelector('polyline')?.getAttribute('points')?.split(' ')).toHaveLength(completed);
 expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow',String(completed));
});

test.each([20,30,40,50])('straight progress at %i cards', total=>{
 const {container}=render(<TrainingSessionProgress presentation={{kind:'planned',position:6,total,fraction:6/total}} language="en" variant="dots"/>);
 const marks=Array.from(container.querySelectorAll('span'));
 expect(marks).toHaveLength(total<=30?total+1:1);
 expect(marks.every(mark=>mark.style.top==='8px')).toBe(true);
 if(total>30)expect(marks[0].style.left).toBe(`${6/total*100}%`);
});

// The same renderer powers live sessions and Appearance previews.
test.each(['dots','wave'] as const)('%s uses exact marks through 30 and continuous progress from 31', variant=>{
 const {container,rerender}=render(<TrainingSessionProgress presentation={{kind:'planned',position:6,total:30,fraction:6/30}} language="en" variant={variant}/>);
 const marks=Array.from(container.querySelectorAll<HTMLElement>('[data-progress-mark]'));
 expect(marks).toHaveLength(30);
 expect(marks.filter(mark=>mark.style.opacity==='0.48')).toHaveLength(6);
 const runner=container.querySelectorAll('span')[30];
 expect(runner.style.left).toBe(marks[5].style.left);
 expect(runner.style.top).toBe(marks[5].style.top);
 if(variant==='wave') expect(new Set(marks.map(mark=>mark.style.top)).size).toBeGreaterThan(2);
 rerender(<TrainingSessionProgress presentation={{kind:'planned',position:6,total:31,fraction:6/31}} language="en" variant={variant}/>);
 expect(container.querySelectorAll('[data-progress-mark]')).toHaveLength(0);
 expect(container.querySelectorAll('span')).toHaveLength(1);
 expect(container.querySelectorAll('path')[1]).toHaveAttribute('stroke-dasharray',`${6/31} 1`);
 expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax','31');
});
