import React from 'react';
import {render,screen} from '@testing-library/react';
import {expect,test,vi} from 'vitest';
import {TrainingAvailabilityStrip} from '@/components/training/pilot/TrainingAvailabilityStrip';
test('pending count has visible updating text and a failed count exposes retry',()=>{
 const retry=vi.fn();
 const {rerender}=render(<TrainingAvailabilityStrip state={{status:'loading'}} language="en" onRetry={retry}/>);
 expect(screen.getByRole('status').textContent).toContain('Updating card counts');
 rerender(<TrainingAvailabilityStrip state={{status:'error'}} language="en" onRetry={retry}/>);
 expect(screen.getByRole('alert').textContent).toContain('Could not update the card counts');
 screen.getByRole('button',{name:'Try again'}).click();
 expect(retry).toHaveBeenCalledOnce();
 expect(screen.queryByText('Updating card counts…')).toBeNull();
});
