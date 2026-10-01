import {type Draft, initialDraft} from "./model";
export type TrainingPreset = {id:string;name:string;draft:Draft;today?:number};
export const sampleTrainings:TrainingPreset[] = [
 {id:"core",name:"Core vocabulary",draft:{...initialDraft},today:12},
 {id:"idioms",name:"Everyday idioms",draft:{...initialDraft,types:["Idioms"],size:10},today:4},
 {id:"translation",name:"Sentence translation",draft:{...initialDraft,types:["Translation"],directions:["Reverse"],size:10},today:0},
];
