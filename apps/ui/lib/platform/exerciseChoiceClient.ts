import { supabase } from '../supabaseClient';
import { platformV2AuthenticatedJsonHeaders } from './platformV2Http';
import { platformFetchWithTimeout } from './platformFetchWithTimeout';
import { invalidateTrainingAvailability } from '../training/availability/cache';
import { publishPlatformV2CardStateChanged } from './platformV2CardStateChanges';
import {uuid,type ExerciseChoiceSnapshot,type ExerciseChoiceRequest} from '../../../../packages/shared/types/exerciseKnownChoice';
export type {ExerciseDirection,ExerciseChoiceSnapshot,ExerciseChoiceRequest} from '../../../../packages/shared/types/exerciseKnownChoice';
export async function fetchExerciseChoice(targetId:string):Promise<ExerciseChoiceSnapshot>{
 const {data,error}=await supabase.rpc('get_training_exercise_choice_v1',{p_target:targetId});
 if(error||!data||data.targetId!==targetId||!uuid(data.entryId)||!['idiom','translation'].includes(data.family)||!(data.family==='idiom'?['direct','reverse']:['recall']).includes(data.direction)||!data.marks||typeof data.marks!=='object'||Array.isArray(data.marks)||Object.entries(data.marks).some(([d,id])=>!(data.family==='idiom'?['direct','reverse']:['recall']).includes(d)||!uuid(id))||typeof data.revision!=='string'||!/^[a-f0-9]{64}$/.test(data.revision))throw new Error('exercise_choice_unavailable');
 return data;
}
export async function saveExerciseChoice(request:ExerciseChoiceRequest,entryId:string){
 const response=await platformFetchWithTimeout('/api/training/exercise-known-choice',{method:'POST',credentials:'same-origin',cache:'no-store',headers:await platformV2AuthenticatedJsonHeaders(),body:JSON.stringify(request)});
 const data=await response.json(); if(!response.ok)throw new Error(data?.error==='training_session_superseded'?'training_session_superseded':response.status===409?'training_known_choice_conflict':'training_known_choice_failed');
 if(!data||!['accepted','duplicate'].includes(data.status)||data.clientEventId!==request.clientEventId||data.targetId!==request.targetId||data.entryId!==entryId||data.trainingSessionId!==request.trainingSessionId||!['consumed','consumed-complete'].includes(data.consumption?.status))throw new Error('invalid_training_known_choice_receipt');
 invalidateTrainingAvailability();publishPlatformV2CardStateChanged(entryId);
}
