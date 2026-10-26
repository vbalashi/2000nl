import {expect,test} from 'vitest';
import {trainingFilterKey} from '@/lib/training/trainingFilterIdentity';
import {trainingExtensionOptions} from '@/lib/training/trainingExtensionOptions';
test('due and early sessions cannot share a filter identity',()=>{expect(trainingFilterKey({dateWindow:'all'})).not.toBe(trainingFilterKey({dateWindow:'all',reviewTiming:'early'}));});
test('ordinary and contextual presentation cannot share filter identity',()=>{expect(trainingFilterKey({dateWindow:'all'})).not.toBe(trainingFilterKey({dateWindow:'all',presentationMode:'word-in-context'}));});
test('unordered lexical filters retain semantic identity',()=>{expect(trainingFilterKey({dateWindow:'all',partOfSpeech:['ww','zn']})).toBe(trainingFilterKey({dateWindow:'all',partOfSpeech:['zn','ww']}));});
test('extension preserves explicit early policy without introducing it to due runs',()=>{expect(trainingExtensionOptions({dateWindow:'all',reviewTiming:'early'})).toEqual({reviewTiming:'early'});expect(trainingExtensionOptions({dateWindow:'all'})).toBeUndefined();});
