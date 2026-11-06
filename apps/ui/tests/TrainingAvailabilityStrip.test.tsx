import React from 'react';
import {render,screen} from '@testing-library/react';
import {expect,test,vi} from 'vitest';
import {TrainingAvailabilityStrip} from '@/components/training/pilot/TrainingAvailabilityStrip';
test('updating hides counts and a failed count exposes retry',()=>{
 const retry=vi.fn();
 const {rerender}=render(<TrainingAvailabilityStrip state={{status:'loading'}} language="en" onRetry={retry}/>);
 expect(screen.getByRole('status').textContent).toContain('Updating card counts');
 expect(screen.getByRole('region')).toHaveAttribute('data-updating','true');
 rerender(<TrainingAvailabilityStrip state={{status:'ready',value:{dueToday:1,totalReviews:4,newCards:6,studyDay:'2026-11-05',timezone:'Europe/Amsterdam',asOf:'2026-11-05T00:00:00Z'},refreshing:true,refreshFailed:false}} language="en" onRetry={retry}/>);
 expect(screen.getByRole('region')).toHaveAttribute('data-updating','true');
 expect(screen.getByText('Due now').closest('dl')).toHaveAttribute('aria-hidden','true');
 rerender(<TrainingAvailabilityStrip state={{status:'error'}} language="en" onRetry={retry}/>);
 expect(screen.getByRole('alert').textContent).toContain('Could not update the card counts');
 screen.getByRole('button',{name:'Try again'}).click();
 expect(retry).toHaveBeenCalledOnce();
 expect(screen.queryByText('Updating card counts…')).toBeNull();
});
