import type {TrainingFocusFilter} from '@/lib/types';
/** Extend an accepted run with its explicit timing policy. Fresh starts never use this helper. */
export function trainingExtensionOptions(filter:TrainingFocusFilter):{reviewTiming:'early'}|undefined{
 return filter.reviewTiming==='early'?{reviewTiming:'early'}:undefined;
}
