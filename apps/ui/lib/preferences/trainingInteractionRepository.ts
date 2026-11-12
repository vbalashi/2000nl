import {supabase} from "@/lib/supabaseClient";
import {withPreferenceDeadline} from "./requestDeadline";
import {parseTrainingInteractions, type TrainingInteractions} from "./trainingInteractions";
export interface TrainingInteractionRepository {
 load(userId:string):Promise<TrainingInteractions>;
 save(userId:string,value:TrainingInteractions):Promise<void>;
}
const questionColumn = "training_show_question_on_answer";
const countColumn = "training_always_show_card_count";
const columns = {
 animation:"training_animation_enabled", gradeSwipe:"training_grade_swipe_enabled",
 translationSwipe:"training_translation_swipe_enabled", syllableDoubleTap:"training_syllable_double_tap_enabled",
 progressAnimation:"training_progress_animation", showSyllables:"training_show_syllables", audioSwipe:"training_audio_swipe_enabled",
} as const;
// Postgres reports an unknown selected column as 42703; PostgREST reports an
// unknown write column as PGRST204 while its schema cache is still stale.
function missingCountColumn(error: {code?:string;message?:string}|null): boolean {
 return Boolean(error && (error.code === "42703" || error.code === "PGRST204") && error.message?.includes(countColumn));
}
function missingQuestionColumn(error: {code?:string;message?:string}|null): boolean {
 return Boolean(error && (error.code === "42703" || error.code === "PGRST204") && error.message?.includes(questionColumn));
}
export const trainingInteractionRepository:TrainingInteractionRepository = {
 async load(userId){
  const read=(withCount:boolean, withQuestion:boolean)=>withPreferenceDeadline(signal=>supabase.from("user_settings")
   .select([...Object.values(columns),...(withCount?[countColumn]:[]),...(withQuestion?[questionColumn]:[])].join(",")).eq("user_id",userId).abortSignal(signal).maybeSingle());
  let withCount=true, withQuestion=true;
  let {data,error}=await read(withCount,withQuestion);
  for(let i=0;i<2 && error;i++){
   if(missingCountColumn(error) && withCount) withCount=false;
   else if(missingQuestionColumn(error) && withQuestion) withQuestion=false;
   else break;
   ({data,error}=await read(withCount,withQuestion));
  }
  if(error)throw new Error("training_interactions_load_failed");
  const record=data as unknown as Record<string,unknown>|null;
  return parseTrainingInteractions({...Object.fromEntries(Object.entries(columns).map(([key,column])=>[key,record?.[column]])),alwaysShowCardCount:record?.[countColumn],showQuestionOnAnswer:record?.[questionColumn]});
 },
 async save(userId,value){
  if(Object.keys(columns).some(key=>key === "progressAnimation" ? !["off","dots","wave"].includes(value.progressAnimation) : typeof value[key as keyof TrainingInteractions]!=="boolean") || typeof value.alwaysShowCardCount!=="boolean" || typeof value.showQuestionOnAnswer!=="boolean")throw new Error("invalid_training_interactions");
  const base={user_id:userId,...Object.fromEntries(Object.entries(columns).map(([key,column])=>[column,value[key as keyof TrainingInteractions]]))};
  const write=(withCount:boolean,withQuestion:boolean)=>withPreferenceDeadline(signal=>supabase.from("user_settings").upsert(
   {...base,...(withCount?{[countColumn]:value.alwaysShowCardCount}:{}),...(withQuestion?{[questionColumn]:value.showQuestionOnAnswer}:{})},{onConflict:"user_id"}).abortSignal(signal));
  let withCount=true,withQuestion=true;
  let {error}=await write(withCount,withQuestion);
  for(let i=0;i<2 && error;i++){
   if(missingCountColumn(error) && withCount){if(value.alwaysShowCardCount)throw new Error("training_card_count_unavailable");withCount=false;}
   else if(missingQuestionColumn(error) && withQuestion){if(!value.showQuestionOnAnswer)throw new Error("training_question_setting_unavailable");withQuestion=false;}
   else break;
   ({error}=await write(withCount,withQuestion));
  }
  if(error)throw new Error("training_interactions_save_failed");
 },
};
