"use client";
import { localizedField, localizedSection } from "@/lib/i18n/catalog";

import React from "react";
import {SourceWordIcon} from "./ExerciseSummaryIcons";
import { BuilderChoice } from "@/components/practice/builder/BuilderChoice";
import { SegmentedControl } from "@/components/practice/ui/SegmentedControl";
import { SettingsHelp } from "@/components/practice/settings/SettingsHelp";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { SourceWordStatus } from "@/lib/training/sourceWordSelection";
import s from "./approvedTrainingBuilder.module.css";

const copy = localizedSection("sourceWordSelection");
export function SourceWordSelection({ language, value, onChange, translation = false }: { translation?: boolean; language: OnboardingLanguage; value: SourceWordStatus; onChange: (value: SourceWordStatus) => void }) {
  const t = copy[language];
  return <div className={`${s.field} ${s.sourceWordRow}`}>
    <h2>{t.title}<SettingsHelp label={t.title} text={translation ? [t.translationHelp[0], t.help[1], t.translationHelp[1]] : t.help}/></h2>
    <SegmentedControl standard label={t.title}>
      <BuilderChoice active={value === "learning"} onClick={() => onChange("learning")}><span className={s.sourceChoice}><SourceWordIcon status="learning"/>{t.learning}</span></BuilderChoice>
      <BuilderChoice active={value === "all"} onClick={() => onChange("all")}><span className={s.sourceChoice}><SourceWordIcon status="all"/>{t.all}</span></BuilderChoice>
    </SegmentedControl>
  </div>;
}
