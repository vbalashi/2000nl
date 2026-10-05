import {expect,test} from 'vitest';
import {orderedConjugationPersons,conjugationPersonLabel} from '@/lib/dictionary/conjugationPresentation';

test.each([
 ['nl',['zij','jullie','wij','hij_zij_het','u','jij','ik'],['ik','jij','u','hij_zij_het','wij','jullie','zij']],
 ['en',['they','we','he_she_it','you','i'],['i','you','he_she_it','we','they']],
 ['fr',['ils_elles','vous','nous','il_elle','tu','je'],['je','tu','il_elle','nous','vous','ils_elles']],
 ['de',['sie','ihr','wir','er_sie_es','du','ich'],['ich','du','er_sie_es','wir','ihr','sie']],
])('%s uses its own person order', (language,input,expected)=>{
 expect(orderedConjugationPersons(input,language)).toEqual(expected);
 expect(orderedConjugationPersons(input)).toEqual(expected);
});

test('partial, duplicate and unknown rows are retained without adding missing people',()=>{
 expect(orderedConjugationPersons(['other_b','wij','other_a','ik','wij'],'nl-NL')).toEqual(['ik','wij','other_b','other_a']);
 expect(orderedConjugationPersons(['x','ik','z'],'xx')).toEqual(['x','ik','z']);
 expect(orderedConjugationPersons([],'nl')).toEqual([]);
 expect(conjugationPersonLabel('dat_hij_zij_het')).toBe('dat hij / zij / het');
});
