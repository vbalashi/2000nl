"use client";
import { ArrowDown } from "lucide-react";
import s from "./prototype.module.css";

const sentences: Record<string, string> = {
  English: "I cycle to work.", Dutch: "Ik ga met de fiets naar mijn werk.",
  Russian: "Я езжу на работу на велосипеде.", "Русский": "Я езжу на работу на велосипеде.",
  German: "Ich fahre mit dem Fahrrad zur Arbeit.", French: "Je vais au travail à vélo.",
  Spanish: "Voy al trabajo en bicicleta.",
};
export function TranslationDirectionPreview({ from, to }: { from: string; to: string }) {
  if(from === "Off") return <p className={s.muted}>Choose a translation language in Settings to practise sentence translation.</p>;
  if(from === to) return <p className={s.muted}>Choose a translation language different from {to} in Settings.</p>;
  return <div className={s.field}>
    <h2>Sentence translation <span className={s.muted}>{from} → {to}</span></h2>
    <div className={s.directions}><div className={`${s.direction} ${s.directionSelected}`} aria-label={`Sentence translation from ${from} to ${to}`}>
      <span className={s.directionHeading}>{from} → {to}</span>
      <strong className={s.prompt}>{sentences[from] || `A sentence in ${from}`}</strong>
      <ArrowDown className={s.directionArrow} size={15} aria-hidden="true"/>
      <span className={s.answer}>{sentences[to]}</span>
    </div></div>
  </div>;
}
