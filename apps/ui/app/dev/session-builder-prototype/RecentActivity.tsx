"use client";
import React from "react";
import {PracticePanel} from "@/components/practice/ui/PracticePanel";
import type {PreviewAction} from "./sessionPreviewModel";
import s from "./trainingSession.module.css";

export function RecentActivity({items,onClose}:{items:PreviewAction[];onClose:()=>void}){
 const groups=new Map<string,PreviewAction[]>();
 for(const item of items){const day=new Date(item.at).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"});groups.set(day,[...(groups.get(day)||[]),item]);}
 return <PracticePanel title="Recent activity" onClose={onClose}><div className={s.history}>
  <p className={s.caption}>Across your training · demo activity</p>
  {!items.length&&<p>No activity yet. Completed exercises will appear here.</p>}
  {[...groups].map(([day,actions])=><section key={day}><h3>{day}</h3><ol>{actions.map(item=><li key={item.id}><div><strong>{item.word}</strong><span>{item.exercise}</span></div><div className={s.result}><strong data-rating={item.result}>{item.result}</strong><time dateTime={item.at}>{new Date(item.at).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</time></div></li>)}</ol></section>)}
 </div></PracticePanel>;
}
