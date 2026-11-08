import React from 'react';
import {render,screen} from '@testing-library/react';
import {expect,test,vi} from 'vitest';
import {TrainingAvailabilityStrip} from '@/components/training/pilot/TrainingAvailabilityStrip';
const value={dueToday:2,totalReviews:7,newCards:6,totalWords:5,totalMeanings:8,totalCards:15,studyDay:'2026-11-05',timezone:'Europe/Amsterdam',asOf:'2026-11-05T00:00:00Z'};
test('same-scope refresh retains totals without flashing updating, but changed scope hides them',()=>{
 const {rerender}=render(<TrainingAvailabilityStrip state={{status:'ready',value,refreshing:false,refreshFailed:false}} language="en"/>);
 const summary=screen.getByRole('region');
 expect(summary).toHaveTextContent('Found 5 words with 8 meanings. Available cards: 15. Of these cards, you are learning 7, ready to review now: 2.');
 rerender(<TrainingAvailabilityStrip state={{status:'ready',value,refreshing:true,refreshFailed:false}} language="en"/>);
 expect(screen.queryByRole('status')).not.toBeInTheDocument();
 expect(summary.querySelector('[aria-hidden="true"]')).toBeNull();
 expect(summary).toHaveTextContent('Found 5 words');
 rerender(<TrainingAvailabilityStrip state={{status:'loading'}} language="en"/>);
 expect(screen.getByRole('status')).toHaveTextContent('Updating card counts');
 expect(summary.querySelector('[aria-hidden="true"]')).toHaveTextContent('Found 5 words');
});
test('shows card count even when equal to meanings and uses correct Russian plural forms',()=>{
 const same={...value,totalWords:1,totalMeanings:2,totalCards:2,totalReviews:0,newCards:2,dueToday:0};
 const {rerender}=render(<TrainingAvailabilityStrip state={{status:'ready',value:same,refreshing:false,refreshFailed:false}} language="ru"/>);
 expect(screen.getByRole('region')).toHaveTextContent('Найдено 1 слово, всего 2 значения. Доступно карточек: 2. Из этих карточек вы изучаете 0, готовы к повторению сейчас: 0.');
 expect(screen.getByRole('region')).toHaveTextContent('Доступно карточек: 2.');
 rerender(<TrainingAvailabilityStrip state={{status:'ready',value:{...same,totalWords:5,totalMeanings:5,totalCards:5,newCards:5},refreshing:false,refreshFailed:false}} language="ru"/>);
 expect(screen.getByRole('region')).toHaveTextContent('Найдено 5 слов, всего 5 значений.');
});
test('a failed count exposes retry',()=>{
 const retry=vi.fn();render(<TrainingAvailabilityStrip state={{status:'error'}} language="en" onRetry={retry}/>);
 expect(screen.getByRole('alert')).toHaveTextContent('Could not update the card counts');screen.getByRole('button',{name:'Try again'}).click();expect(retry).toHaveBeenCalledOnce();
});
