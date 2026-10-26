import React from "react";
import s from "./wordIdentity.module.css";
/** Inline lockup inherits the heading's size; the article never competes with the headword. */
export function WordIdentity({article,headword}:{article?:string|null;headword:string}){
 return <>{article&&<><span className={s.article}>{article}</span>{" "}</>}{headword}</>;
}
