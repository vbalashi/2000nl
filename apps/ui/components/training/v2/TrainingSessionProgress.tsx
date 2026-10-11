"use client";
import React, {useEffect, useRef, useState} from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { ProgressAnimation } from "@/lib/preferences/trainingInteractions";
import type { TrainingSessionPresentationSnapshot } from "./useTrainingSessionPresentation";
import styles from "./TrainingSessionLayout.module.css";

const labels = { en: "Session progress", nl: "Sessievoortgang", ru: "Прогресс сессии" };
const waveY = (x: number) => 10 + 6 * Math.sin(x / 314 * Math.PI * 2);
const wave = Array.from({length: 101}, (_, i) => `${i ? "L" : "M"}${i * 3.14},${waveY(i * 3.14)}`).join(" ");
const jitter = (i: number) => Math.sin(i * 7.13) * .7;

/** Bounded visual marks; the accessible counter always retains the exact total. */
export function TrainingSessionProgress({ presentation, language, variant }: {
  presentation: TrainingSessionPresentationSnapshot;
  language: OnboardingLanguage;
  variant: ProgressAnimation;
}) {
  const count = presentation.kind === "planned" ? Math.max(2, Math.min(15, presentation.total)) : 2;
  const fraction = presentation.kind === "planned" ? Math.max(0, Math.min(1, presentation.fraction)) : 0;
  const target = variant === "dots" ? Math.round(fraction * (count - 1)) / (count - 1) : fraction;
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
  const step = position * (count - 1), index = Math.floor(step), travel = step - index;
  const dotX = (i: number) => i * 314 / (count - 1) + (i > 0 && i < count - 1 ? jitter(i) * 3 : 0);
  const x = dotX(index) + (dotX(Math.min(index + 1, count - 1)) - dotX(index)) * travel;
  return <div className={styles.sessionProgress} data-variant={variant} data-testid="training-session-progress-track"
    role="progressbar" aria-label={labels[language]} aria-valuemin={0}
    aria-valuemax={presentation.total} aria-valuenow={Math.min(presentation.position, presentation.total)}>
    {variant === "wave" ? <svg viewBox="-2 0 318 20" preserveAspectRatio="none" aria-hidden="true">
      <path d={wave} fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      <path d={wave} fill="none" stroke="currentColor" strokeOpacity=".312" strokeWidth="1.4" pathLength="1" strokeDasharray={`${position} 1`} vectorEffect="non-scaling-stroke" />
    </svg> : null}
    {variant === "dots" ? Array.from({length: count}, (_, i) => <span aria-hidden="true" key={i} className={styles.progressDot} style={{left:`${dotX(i)/314*100}%`,top:8+jitter(i)*.55,opacity:i<=step?.48:.15}} />) : null}
    <span aria-hidden="true" className={styles.progressDot} style={{
      left:`${variant === "wave" ? (2+position*314)/318*100 : x/314*100}%`,
      top:variant === "wave" ? waveY(position*314) : 8+jitter(index)*.55-7*Math.sin(Math.PI*travel),
      width:variant === "wave"?4.5:3,height:variant === "wave"?4.5:3,opacity:variant === "wave"?.48:.55,
    }} />
  </div>;
}
