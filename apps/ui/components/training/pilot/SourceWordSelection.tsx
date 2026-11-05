"use client";
import React from "react";
import { BuilderChoice } from "@/components/practice/builder/BuilderChoice";
import { SegmentedControl } from "@/components/practice/ui/SegmentedControl";
import { SettingsHelp } from "@/components/practice/settings/SettingsHelp";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { SourceWordStatus } from "@/lib/training/sourceWordSelection";
import s from "./approvedTrainingBuilder.module.css";

const copy = {
  ru: { translationHelp: ["Выберите, из каких слов брать примеры. «Только изучаемые» — из слов, которые вы уже учите. «Все слова» — также из новых.", "«Перевод» использует прогресс обратной карточки слова. Карточки с отметкой «Уже знаю» и исключённые из тренировок здесь тоже не показываем."], title: "Исходные слова", learning: "Только изучаемые", all: "Все слова", help: ["Выберите, из каких слов брать материал для упражнения. «Только изучаемые» — из слов, которые вы уже учите. «Все слова» — также из новых и отмеченных «Уже знаю».", "Берём только материал, связанный с выбранными значениями. Настройка «новые / повторение» отдельно определяет, какие карточки упражнения попадут в тренировку."] },
  en: { translationHelp: ["Choose which words supply examples. Learning only uses words you are already studying. All words also includes new words.", "Translation shares progress with the word’s reverse card. Cards marked Already know or excluded from training are also left out here."], title: "Source words", learning: "Learning only", all: "All words", help: ["Choose which words supply material for this exercise. Learning only uses words you are already studying. All words also includes new words and those marked Already know.", "Only material linked to the selected meanings is included. The separate new/review setting selects the exercise cards for your session."] },
  nl: { translationHelp: ["Kies welke woorden de voorbeelden leveren. Alleen in studie gebruikt woorden die je al leert. Alle woorden bevat ook nieuwe woorden.", "Vertalen deelt de voortgang met de omgekeerde woordkaart. Kaarten met Ken ik al of kaarten die van training zijn uitgesloten, verschijnen hier ook niet."], title: "Bronwoorden", learning: "Alleen in studie", all: "Alle woorden", help: ["Kies welke woorden het materiaal voor deze oefening leveren. Alleen in studie gebruikt woorden die je al leert. Alle woorden bevat ook nieuwe woorden en woorden met het label Ken ik al.", "We gebruiken alleen materiaal dat aan de geselecteerde betekenissen gekoppeld is. De aparte instelling nieuw/herhalen bepaalt welke oefenkaarten in je sessie komen."] },
};
export function SourceWordSelection({ language, value, onChange, translation = false }: { translation?: boolean; language: OnboardingLanguage; value: SourceWordStatus; onChange: (value: SourceWordStatus) => void }) {
  const t = copy[language];
  return <div className={s.field}>
    <h2>{t.title}<SettingsHelp label={t.title} text={translation ? [t.translationHelp[0], t.help[1], t.translationHelp[1]] : t.help}/></h2>
    <SegmentedControl standard label={t.title}>
      <BuilderChoice active={value === "learning"} onClick={() => onChange("learning")}>{t.learning}</BuilderChoice>
      <BuilderChoice active={value === "all"} onClick={() => onChange("all")}>{t.all}</BuilderChoice>
    </SegmentedControl>
  </div>;
}
