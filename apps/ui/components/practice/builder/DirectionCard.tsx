"use client";
import React from "react";
import { ArrowDown, Check } from "lucide-react";

export function DirectionCard({ label, selected, onClick, prompt, answer, promptLanguage, answerLanguage, classes }: {
  label: string; selected: boolean; onClick: () => void; prompt: string; answer: string;
  promptLanguage?: string; answerLanguage?: string;
  classes: {card:string;heading:string;check:string;prompt:string;arrow?:string;answer:string};
}) {
  return <button type="button" className={classes.card} aria-pressed={selected} onClick={onClick}>
    <span className={classes.heading}>{label}<span className={classes.check} aria-hidden="true">{selected && <Check size={12}/>}</span></span>
    <strong lang={promptLanguage} className={classes.prompt}>{prompt}</strong>
    <ArrowDown size={13} className={classes.arrow} aria-hidden="true"/>
    <span lang={answerLanguage} className={classes.answer}>{answer}</span>
  </button>;
}
