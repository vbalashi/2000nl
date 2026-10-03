import {expect,test} from 'vitest';
import {trainingMetadata} from '@/lib/training/setups/metadata';
import {readLastSelectedTraining,writeLastSelectedTraining,resolveHighlightedTraining} from '@/lib/training/setups/lastSelected';
import type {TrainingSetupDraft} from '@/lib/training/setups/types';
const draft:TrainingSetupDraft={scenarioId:'understanding',modes:['word-to-definition'],cardFilter:'review',listValue:'all',newReviewRatio:2,dateWindow:'all',sourceValue:'all',sessionSize:5};
for(const language of ['en','nl','ru'] as const)for(const family of ['meaning','idiom','word-in-context'] as const)for(const modes of [['word-to-definition'],['definition-to-word'],['word-to-definition','definition-to-word']] as const)for(const filter of ['new','review','both'] as const)for(const size of [5,'all-due-today'] as const){
 test(`${language}/${family}/${modes.join('+')}/${filter}/${size}`,()=>{
 const result=trainingMetadata({...draft,family,modes:[...modes],cardFilter:filter,sessionSize:size},language,'Dutch');
 expect(result.summary).not.toContain('undefined');expect(result.summary).not.toContain('→');expect(result.summary.split(' · ')[0]).toBe('Dutch');
 expect(result.summary.split(' · ')).toHaveLength(family==='word-in-context'?4:5);
 expect(result.description).toContain(language==='en'?(filter==='new'?'New only':filter==='review'?'Reviews only':'New + reviews'):language==='nl'?(filter==='new'?'Alleen nieuwe':filter==='review'?'Alleen herhalingen':'Nieuw + herhalingen'):(filter==='new'?'Только новые':filter==='review'?'Только повторения':'Новые + повторения'));
 });
}
test('saved identity resolution tolerates deletion without borrowing another owner choice',()=>{
 const saved=[{id:'a',name:'A',languageCode:'nl',draft},{id:'b',name:'B',languageCode:'nl',draft}];
 writeLastSelectedTraining('one','b');writeLastSelectedTraining('two','a');
 expect(readLastSelectedTraining('one')).toBe('b');expect(readLastSelectedTraining('two')).toBe('a');
 expect(resolveHighlightedTraining(saved,'b','a')).toBe('b');expect(resolveHighlightedTraining(saved,'deleted','a')).toBe('a');expect(resolveHighlightedTraining(saved,'deleted',null)).toBe('a');
});
