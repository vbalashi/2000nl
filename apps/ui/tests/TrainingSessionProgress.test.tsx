import React from 'react';
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
import {TrainingSessionProgress} from '@/components/training/v2/TrainingSessionProgress';
import {parseTrainingInteractions} from '@/lib/preferences/trainingInteractions';
afterEach(cleanup);
const planned={kind:'planned' as const,position:7,total:15,fraction:7/15};
test('exact accessible count with bounded tiny marks for a long session',()=>{
 const {container}=render(<TrainingSessionProgress presentation={{...planned,total:2000}} language="ru" variant="dots"/>);
 expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax','2000');
 expect(container.querySelectorAll('span')).toHaveLength(16);
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
 expect(container.querySelectorAll('path')[1]).toHaveAttribute('stroke-dasharray',`${10/15} 1`);
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
