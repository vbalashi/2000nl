"use client";
import { ArrowDown } from "lucide-react";
import React,{useContext} from "react";
import {InterfaceLanguageContext} from "./VariantControls";
import {formatUiMessage,getUiMessages} from "@/lib/uiMessages";
import {previewLanguageCode,previewLanguageName} from "./previewLanguage";
import s from "./prototype.module.css";

const sentences: Record<string, string> = {
  English: "I cycle to work.", Dutch: "Ik ga met de fiets naar mijn werk.",
  Russian: "Я езжу на работу на велосипеде.", "Русский": "Я езжу на работу на велосипеде.",
  German: "Ich fahre mit dem Fahrrad zur Arbeit.", French: "Je vais au travail à vélo.",
  Spanish: "Voy al trabajo en bicicleta.",
};
export function TranslationDirectionPreview({ from, to }: { from: string; to: string }) {
  const locale=useContext(InterfaceLanguageContext);
  const messages=getUiMessages(locale);
  const copy=messages.builder;
  const languageName=(name:string)=>previewLanguageName(locale,name);
  if(from === "Off") return <p className={s.muted}>{copy.translationOff}</p>;
  if(from === to) return <p className={s.muted}>{formatUiMessage(copy.translationSame,{language:languageName(to)})}</p>;
  return <div className={s.field}>
    <h2>{copy.sentenceTranslation} <span className={s.muted}>{languageName(from)} → {languageName(to)}</span></h2>
    <div className={s.directions}><div className={`${s.direction} ${s.directionSelected}`} aria-label={formatUiMessage(copy.translationDirection,{from:languageName(from),to:languageName(to)})}>
      <span className={s.directionHeading}>{languageName(from)} → {languageName(to)}</span>
      <strong lang={sentences[from]?previewLanguageCode(from):locale} className={s.prompt}>{sentences[from] || formatUiMessage(copy.sentenceIn,{language:languageName(from)})}</strong>
      <ArrowDown className={s.directionArrow} size={15} aria-hidden="true"/>
      <span lang={previewLanguageCode(to)} className={s.answer}>{sentences[to]}</span>
    </div></div>
  </div>;
}
