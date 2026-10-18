import {expect,test} from 'vitest';
import {trainingEmptyState} from '@/lib/training/availability/emptyState';

test.each([
 ['review',0,0,109,true,'Only reviews are selected'],
 ['review',0,12,109,true,'Only reviews are selected'],
 ['review',0,12,0,false,'Nothing to review'],
 ['review',0,0,0,false,'No cards match'],
 ['both',0,0,0,false,'No cards match'],
 ['both',0,12,0,false,'Nothing to review'],
 ['new',0,12,0,false,'No new cards match'],
] as const)('%s with due %i, reviews %i, new %i explains empty selection',(filter,dueToday,totalReviews,stillNew,includeNew,text)=>{
 expect(trainingEmptyState('en',filter,{dueToday,totalReviews,stillNew})).toMatchObject({includeNew,message:expect.stringContaining(text)});
});
test.each([
 ['review',2,12,0],['both',0,0,109],['both',2,12,0],['new',0,0,109],
 ['review',null,null,null],['both',0,0,null],['new',0,12,null],
] as const)('%s with due %s, reviews %s, new %s does not claim empty',(filter,dueToday,totalReviews,stillNew)=>{
 expect(trainingEmptyState('en',filter,{dueToday,totalReviews,stillNew})).toBeNull();
});
test.each(['en','nl','ru'] as const)('localized review restriction in %s retains available count',language=>{
 expect(trainingEmptyState(language,'review',{dueToday:0,totalReviews:0,stillNew:109})).toMatchObject({includeNew:true,message:expect.stringContaining('109')});
});
