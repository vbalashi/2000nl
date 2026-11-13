export type ExerciseDirection='direct'|'reverse'|'recall';
export type ExerciseChoiceSnapshot={targetId:string;entryId:string;family:'idiom'|'translation';direction:ExerciseDirection;marks:Partial<Record<ExerciseDirection,string>>;revision:string};
export type ExerciseChoiceRequest={targetId:string;trainingSessionId:string;knownDirections:ExerciseDirection[];revision:string;clientEventId:string};
export const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
export function parseExerciseChoiceRequest(value:unknown):ExerciseChoiceRequest|null {
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['targetId','trainingSessionId','knownDirections','revision','clientEventId'].includes(k))||!uuid(v.targetId)||!uuid(v.trainingSessionId)||!uuid(v.clientEventId)||typeof v.revision!=='string'||!/^[a-f0-9]{64}$/.test(v.revision)||!Array.isArray(v.knownDirections)||v.knownDirections.length>2||new Set(v.knownDirections).size!==v.knownDirections.length||v.knownDirections.some(d=>!['direct','reverse','recall'].includes(d)))return null;
 return v as ExerciseChoiceRequest;
}
