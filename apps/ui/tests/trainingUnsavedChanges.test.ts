import {expect,test} from 'vitest';
import {hasUnsavedTrainingChanges as changed} from '@/lib/training/setups/unsavedChanges';
import type {SavedTraining} from '@/lib/training/setups/model';
const saved:SavedTraining={id:'one',name:'Translation',languageCode:'nl',draft:{scenarioId:'understanding',modes:['word-to-definition'],cardFilter:'review',listValue:'all',newReviewRatio:2,dateWindow:'all',sourceValue:'all',sessionSize:5,partOfSpeech:['zn','ww']}};
test('initial and restored values are clean; name, language and recipe edits are dirty',()=>{
 expect(changed(saved,saved)).toBe(false);
 expect(changed(saved,{...saved,name:'Renamed'})).toBe(true);
 expect(changed(saved,{...saved,languageCode:'en'})).toBe(true);
 expect(changed(saved,{...saved,draft:{...saved.draft,sessionSize:10}})).toBe(true);
 expect(changed(saved,{...saved,draft:{...saved.draft,partOfSpeech:['ww','zn'],family:'meaning',materialMode:'collection',nounArticles:[]}})).toBe(false);
});
test('successful save establishes a new baseline while the old baseline remains dirty',()=>{
 const edited={...saved,name:'Renamed'};
 expect(changed(saved,edited)).toBe(true);
 expect(changed(edited,edited)).toBe(false);
 expect(changed(undefined,edited)).toBe(false);
});
