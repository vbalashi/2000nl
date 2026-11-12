import { supabase } from '../supabaseClient';
import { performTrainingExclusion } from './trainingExclusionClient';
import { publishPlatformV2CardStateChanged } from './platformV2CardStateChanges';
export type ExerciseKnownChoice = {exclusionId:string;targetId:string;family:'idiom'|'translation';text:string|null;directions:('direct'|'reverse'|'recall')[]};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
export async function fetchExerciseKnownChoices(entryId:string):Promise<ExerciseKnownChoice[]> {
 const {data,error}=await supabase.rpc('get_training_exercise_known_choices_v1',{p_entry_id:entryId});
 if(error)throw new Error('exercise_known_unavailable');
 if(!Array.isArray(data)||data.some(x=>!x||!uuid(x.exclusionId)||!uuid(x.targetId)||!['idiom','translation'].includes(x.family)||(x.text!==null&&typeof x.text!=='string')||!Array.isArray(x.directions)||!x.directions.length||x.directions.some((d:unknown)=>typeof d!=='string'||!(x.family==='idiom'?['direct','reverse']:['recall']).includes(d))))throw new Error('exercise_known_contract_mismatch');
 return data;
}
export async function resumeExerciseKnownChoice(entryId:string,choice:ExerciseKnownChoice,clientEventId:string){
 await performTrainingExclusion({actionId:'restore-pair',clientEventId,exclusionId:choice.exclusionId,target:{kind:'exercise',targetId:choice.targetId}});
 publishPlatformV2CardStateChanged(entryId);
}
