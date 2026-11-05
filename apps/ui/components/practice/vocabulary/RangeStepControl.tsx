"use client";
import React from "react";
import { SegmentedControl } from "../ui/SegmentedControl";
import { BuilderChoice } from "../builder/BuilderChoice";
import controls from "../builder/builderControls.module.css";
import s from "./vocabularySelection.module.css";
export function RangeStepControl({value,onChange,label}:{value:number;onChange:(step:number)=>void;label:string}){
 return <div className={s.stepChoice}><span className={controls.label}>{label}</span><SegmentedControl standard label={label}>{[1,10,100].map(step=><BuilderChoice key={step} active={value===step} onClick={()=>onChange(step)}>{step}</BuilderChoice>)}</SegmentedControl></div>;
}
