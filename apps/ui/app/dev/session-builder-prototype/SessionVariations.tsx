"use client";
import React from "react";
import {Action,Choice,Modal} from "./VariantControls";
import s from "./prototype.module.css";
export type SessionStyle={height:28|34|46|"adaptive";ink:"tonal"|"neutral";marker:"left"|"bottom";layout:"auto"|"two";language:"en"|"nl"|"ru";definition:"reading"|"ui"};
export const sessionStyleDefaults:SessionStyle={height:"adaptive",ink:"tonal",marker:"left",layout:"auto",language:"en",definition:"reading"};
export function SessionVariations({value,onChange,onClose}:{value:SessionStyle;onChange:(style:SessionStyle)=>void;onClose:()=>void}){
 const set=(patch:Partial<SessionStyle>)=>onChange({...value,...patch});
 return <Modal title="Training variations" onClose={onClose}><div className={s.sourceTools}>
  <h3>Button height</h3><div className={s.choices}><Choice active={value.height==="adaptive"} onClick={()=>set({height:"adaptive"})}>Auto · 46 / 28 px</Choice>{([28,34,46] as const).map(height=><Choice key={height} active={value.height===height} onClick={()=>set({height})}>{height} px</Choice>)}</div>
  <h3>Rating text</h3><div className={s.choices}><Choice active={value.ink==="tonal"} onClick={()=>set({ink:"tonal"})}>Coloured</Choice><Choice active={value.ink==="neutral"} onClick={()=>set({ink:"neutral"})}>Neutral</Choice></div>
  <h3>Colour marker</h3><div className={s.choices}><Choice active={value.marker==="left"} onClick={()=>set({marker:"left"})}>Left</Choice><Choice active={value.marker==="bottom"} onClick={()=>set({marker:"bottom"})}>Bottom</Choice></div>
  <h3>Rating layout</h3><div className={s.choices}><Choice active={value.layout==="auto"} onClick={()=>set({layout:"auto"})}>Auto · fit labels</Choice><Choice active={value.layout==="two"} onClick={()=>set({layout:"two"})}>Two columns</Choice></div>
  <h3>Button language</h3><div className={s.choices}>{(["en","nl","ru"] as const).map(language=><Choice key={language} active={value.language===language} onClick={()=>set({language})}>{{en:"English",nl:"Nederlands",ru:"Русский"}[language]}</Choice>)}</div>
  <h3>Definitions · training & dictionary</h3><div className={s.choices}><Choice active={value.definition==="reading"} onClick={()=>set({definition:"reading"})}>Reading · larger</Choice><Choice active={value.definition==="ui"} onClick={()=>set({definition:"ui"})}>UI · compact</Choice></div>
  <p className={s.muted}>Slim buttons keep a touch target of at least 44 px. Auto switches to two columns when four labels do not fit.</p>
 </div><div className={s.modalActions}><Action onClick={()=>onChange(sessionStyleDefaults)}>Reset</Action><Action primary onClick={onClose}>View variation</Action></div></Modal>;
}
