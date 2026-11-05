"use client";
import {useEffect,useState} from "react";
import {withPreferenceDeadline} from "@/lib/preferences/requestDeadline";
import {fetchAvailableLists} from "@/lib/trainingService";
import {useMaterialDictionaryCatalog} from "@/components/practice/material/useMaterialDictionaryCatalog";
/** A foreign-language draft reads its own catalog without changing the owned run. */
export function useTrainingEditorMaterial(owner:string|undefined,language:string|null){
 const inventory=useMaterialDictionaryCatalog(owner??"",owner&&language?[language]:[]);
 const [attempt,setAttempt]=useState(0);
 const key=JSON.stringify([owner,language]);
 const [result,setResult]=useState<{key:string;lists:{value:string;label:string}[];status:"ready"|"error"}>();
 useEffect(()=>{if(!owner||!language)return;let current=true;void withPreferenceDeadline(()=>fetchAvailableLists(owner,language)).then(rows=>{if(current)setResult({key,status:"ready",lists:rows.map(row=>({value:`${row.type}:${row.id}`,label:row.name}))});}).catch(()=>{if(current)setResult({key,status:"error",lists:[]});});return()=>{current=false;};},[owner,language,key,attempt]);
 return {status:result?.key!==key?"loading" as const:result.status!=="ready"?result.status:inventory.status,
  lists:result?.key===key?result.lists:[],dictionaries:inventory.sources.map(row=>({value:row.id,label:row.name})),reload:()=>{setAttempt(n=>n+1);inventory.reload();}};
}
