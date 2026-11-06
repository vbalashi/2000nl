"use client";
import React from "react";
import {Layers2,Scale} from "lucide-react";
import type {CardFilter} from "@/lib/types";
import s from "./sessionSummaryIcons.module.css";

export function SessionBalanceIcon(){return <Scale size={15} aria-hidden="true"/>;}
export function SessionSizeIcon(){return <Layers2 size={15} aria-hidden="true"/>;}
export function SessionMix({filter,ratio,label,expanded=false}:{filter:CardFilter;ratio:number;label:string;expanded?:boolean}){
 return <span className={s.mix} title={label} aria-label={label}>
  <span aria-hidden="true" className={s.mix}><SessionBalanceIcon/>{" "}{expanded||filter!=="both"?label:`1 : ${ratio}`}</span>
 </span>;
}
