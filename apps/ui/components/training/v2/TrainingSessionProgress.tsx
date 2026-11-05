"use client";
import { localizedField } from "@/lib/i18n/catalog";

import React, {useEffect, useRef, useState} from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { ProgressAnimation } from "@/lib/preferences/trainingInteractions";
import type { TrainingSessionPresentationSnapshot } from "./useTrainingSessionPresentation";
import styles from "./TrainingSessionLayout.module.css";

export const MAX_EXACT_SESSION_DOTS = 30;

const labels = localizedField("sessionProgress", "label");
const waveY = (x: number) => 10 + 6 * Math.sin(x / 314 * Math.PI * 2);
const wave = Array.from({length: 101}, (_, i) => `${i ? "L" : "M"}${i * 3.14},${waveY(i * 3.14)}`).join(" ");


/** Bounded visual marks; the accessible counter always retains the exact total. */
export function TrainingSessionProgress({ presentation, language, variant }: {
  presentation: TrainingSessionPresentationSnapshot;
  language: OnboardingLanguage;
  variant: ProgressAnimation;
}) {
  const count = presentation.kind === "planned" ? Math.max(1, Math.min(MAX_EXACT_SESSION_DOTS, presentation.total)) : 1;
  const fraction = presentation.kind === "planned" ? Math.max(0, Math.min(1, presentation.fraction)) : 0;
  const exactDots = presentation.kind === "planned" && presentation.total <= MAX_EXACT_SESSION_DOTS;
  const line = variant === "dots" && !exactDots;
  const target = exactDots ? Math.round(fraction * count) / count : fraction;
  const [position, setPosition] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const snap = () => { cancelAnimationFrame(frame); current.current = target; setPosition(target); };
    if (media.matches || target <= current.current) { snap(); return; }
    const from = current.current, started = performance.now();
    const animate = (now: number) => {
      const t = Math.min(1, (now - started) / 620);
      current.current = from + (target - from) * (t * t * (3 - 2 * t));
      setPosition(current.current);
      if (t < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    media.addEventListener("change", snap);
    return () => { cancelAnimationFrame(frame); media.removeEventListener("change", snap); };
  }, [target, variant]);
  if (presentation.kind !== "planned" || variant === "off") return null;
  const completedMarks = Math.round(position * count);
  const step = Math.max(0, position * count - 1), index = Math.floor(step), travel = step - index;
  const dotX = (i: number) => count === 1 ? 157 : i * 314 / (count - 1);
  const x = dotX(index) + (dotX(Math.min(index + 1, count - 1)) - dotX(index)) * travel;
  const waveX = exactDots ? x : position * 314;
  const waveLeft = (value: number) => (2 + value) / 318 * 100;
  return <div className={styles.sessionProgress} data-variant={line ? "line" : variant} data-testid="training-session-progress-track"
    role="progressbar" aria-label={labels[language]} aria-valuemin={0}
    aria-valuemax={presentation.total} aria-valuenow={Math.min(presentation.position, presentation.total)}>
    {variant === "wave" ? <svg viewBox="-2 0 318 20" preserveAspectRatio="none" aria-hidden="true">
      <path d={wave} fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      <path d={wave} fill="none" stroke="currentColor" strokeOpacity=".312" strokeWidth="1.4" pathLength="1" strokeDasharray={`${waveX / 314} 1`} vectorEffect="non-scaling-stroke" />
    </svg> : null}
    {line ? <svg viewBox="0 0 314 11" preserveAspectRatio="none" aria-hidden="true" className={styles.progressThread}><path d="M0 8 H314" fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="1" vectorEffect="non-scaling-stroke" /><path d="M0 8 H314" fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="1" pathLength="1" strokeDasharray={`${position} 1`} vectorEffect="non-scaling-stroke" /></svg> : null}
    {variant === "dots" && !line && completedMarks >= 2 ? <svg viewBox="0 0 314 11" preserveAspectRatio="none" aria-hidden="true" className={styles.progressThread}><polyline points={Array.from({length: Math.min(count, completedMarks)}, (_, i) => `${dotX(i)},8`).join(" ")} fill="none" stroke="currentColor" strokeOpacity=".22" strokeWidth="1" vectorEffect="non-scaling-stroke" /></svg> : null}
    {exactDots ? Array.from({length: count}, (_, i) => <span aria-hidden="true" data-progress-mark="" key={i} className={styles.progressDot} style={{left:`${variant === "wave" ? waveLeft(dotX(i)) : dotX(i)/314*100}%`,top:variant === "wave" ? waveY(dotX(i)) : 8,opacity:i<completedMarks?.48:.15}} />) : null}
    <span aria-hidden="true" className={styles.progressDot} style={{
      left:`${variant === "wave" ? waveLeft(waveX) : line ? position*100 : x/314*100}%`,
      top:variant === "wave" ? waveY(waveX) : 8,
      width:variant === "wave" || line?4.5:3,height:variant === "wave" || line?4.5:3,opacity:variant === "wave"?.48:position > 0?.55:0,
    }} />
  </div>;
}
