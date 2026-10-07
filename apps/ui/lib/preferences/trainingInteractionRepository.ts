import {supabase} from "@/lib/supabaseClient";
import {withPreferenceDeadline} from "./requestDeadline";
import {parseTrainingInteractions, type TrainingInteractions} from "./trainingInteractions";
export interface TrainingInteractionRepository {
 load(userId:string):Promise<TrainingInteractions>;
 save(userId:string,value:TrainingInteractions):Promise<void>;
}
const columns = {
 animation:"training_animation_enabled", gradeSwipe:"training_grade_swipe_enabled",
 translationSwipe:"training_translation_swipe_enabled", syllableDoubleTap:"training_syllable_double_tap_enabled",
 showSyllables:"training_show_syllables", audioSwipe:"training_audio_swipe_enabled",
} as const;
export const trainingInteractionRepository:TrainingInteractionRepository = {
 async load(userId){
  const {data,error}=await withPreferenceDeadline(signal=>supabase.from("user_settings")
   .select(Object.values(columns).join(",")).eq("user_id",userId).abortSignal(signal).maybeSingle());
  if(error)throw new Error("training_interactions_load_failed");
  const record=data as unknown as Record<string,unknown>|null;
  return parseTrainingInteractions(Object.fromEntries(Object.entries(columns).map(([key,column])=>[key,record?.[column]])));
 },
 async save(userId,value){
  if(Object.keys(columns).some(key=>typeof value[key as keyof TrainingInteractions]!=="boolean"))throw new Error("invalid_training_interactions");
  const {error}=await withPreferenceDeadline(signal=>supabase.from("user_settings").upsert({user_id:userId,
   ...Object.fromEntries(Object.entries(columns).map(([key,column])=>[column,value[key as keyof TrainingInteractions]]))},
   {onConflict:"user_id"}).abortSignal(signal));
  if(error)throw new Error("training_interactions_save_failed");
 },
};
