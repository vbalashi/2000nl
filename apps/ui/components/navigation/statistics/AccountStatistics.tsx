"use client";
import React, { useCallback, useState } from "react";
import { History, ChevronRight } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { formatUiCount, formatUiMessage, getUiMessages } from "@/lib/uiMessages";
import { languageDisplayName } from "@/lib/languages/languageDisplayName";
import { useAccountMaterial } from "@/components/practice/material/AccountMaterialProvider";
import { materialLearningLanguages } from "@/lib/training/material/selection";
import { parseActivityCalendar } from "@/lib/training/activity/model";
import { materialKey, parseMaterialProgress, type MaterialProgress } from "@/lib/training/activity/material";
import { useAccountRead } from "@/lib/training/activity/useAccountRead";
import { StatisticsActivity } from "@/components/practice/statistics/StatisticsActivity";
import { StatisticsCoverage, StatisticsQueue } from "@/components/practice/statistics/StatisticsMaterial";
import { StatisticsLanguageTabs, StatisticsMaterialPicker } from "@/components/practice/statistics/StatisticsScope";
import s from "@/components/practice/statistics/statistics.module.css";

const parseCalendar = (body: unknown) => parseActivityCalendar(body);

/** Approved Statistics over account-owned languages and server read models. */
export function AccountStatistics({ userId, languageCode, open, interfaceLanguage, onPractiseMaterial, onHistory }: {
  userId: string; languageCode: string; open: boolean; interfaceLanguage: OnboardingLanguage;
  onPractiseMaterial: (languageCode: string, material: MaterialProgress) => void; onHistory?: () => void;
}) {
  const ui = getUiMessages(interfaceLanguage);
  const copy = ui.statistics;
  const account = useAccountMaterial();
  const configured = account?.snapshot ? materialLearningLanguages(account.snapshot.document, account.catalog) : [];
  const languages = configured.some(item => item.code === languageCode) ? configured : [{ code: languageCode, paused: false }, ...configured];
  const [chosenLanguage, setChosenLanguage] = useState<string | null>(null);
  const scope = languages.find(item => item.code === chosenLanguage) ?? languages.find(item => item.code === languageCode)!;
  const [refresh, setRefresh] = useState(0);
  const retry = () => setRefresh(n => n + 1);
  const query = new URLSearchParams({ language: scope.code }).toString();
  const activity = useAccountRead(`/api/training/activity?${query}`, userId, parseCalendar, open, refresh);
  const parseMaterial = useCallback((body: unknown) => parseMaterialProgress(body, scope.code), [scope.code]);
  const progress = useAccountRead(`/api/training/material-progress?${query}`, userId, parseMaterial, open, refresh);
  const [chosenMaterial, setChosenMaterial] = useState("all");
  const languageLabel = languageDisplayName(interfaceLanguage, scope.code);
  const materials = progress.status === "ready" ? progress.value.materials.filter(item =>
    // Legacy full-dictionary mirror is redundant when its dictionary scope is present.
    !(item.kind === "collection" && item.listType === "curated" && item.slug === "vandale-all" &&
      progress.value.materials.some(dictionary => dictionary.kind === "dictionary" && dictionary.total === item.total && /^VanDale\b/i.test(dictionary.name ?? "")))) : [];
  const selected = materials.find(item => materialKey(item) === chosenMaterial) ?? materials[0];
  const name = (item: MaterialProgress) => item.kind === "all" ? copy.allLearning : `${item.name} · ${item.kind === "dictionary" ? copy.materialDictionary : item.personal ? copy.materialOwnCollection : copy.materialCollection}`;
  const recentActivity = onHistory ? <button type="button" className={s.recentActivity} onClick={onHistory}>
    <History size={17} aria-hidden="true" />{copy.recentActivity}<ChevronRight size={15} aria-hidden="true" /></button> : null;
  const status = (message: string, failed: boolean) => <div className={s.status} aria-live="polite">
    {failed ? <><p role="alert">{message}</p><button type="button" onClick={retry}>{copy.timeRetry}</button></> : <p role="status">{message}</p>}
  </div>;
  return <div className={`${s.statistics} ${s.page}`} lang={interfaceLanguage}>
    <h1 className={s.srOnly}>{ui.navigation.statistics}</h1>
    {<StatisticsLanguageTabs interfaceLanguage={interfaceLanguage} value={scope.code}
      languages={languages.map(item => ({ id: item.code, label: languageDisplayName(interfaceLanguage, item.code) }))}
      onChange={code => { setChosenLanguage(code); setChosenMaterial("all"); }} />}
    {activity.status === "ready"
      ? <StatisticsActivity key={scope.code} interfaceLanguage={interfaceLanguage} calendar={activity.value} recentActivity={recentActivity} />
      : <>{status(activity.status === "loading" ? copy.activityLoading : copy.activityUnavailable, activity.status === "error")}{recentActivity}</>}
    {progress.status !== "ready" || !selected
      ? status(progress.status === "loading" ? copy.materialLoading : copy.materialUnavailable, progress.status === "error")
      : <>
        <StatisticsMaterialPicker interfaceLanguage={interfaceLanguage} languageLabel={languageLabel} value={materialKey(selected)} onChange={setChosenMaterial}
          options={[...materials].sort((a,b)=>Number(a.personal)-Number(b.personal)).map(item => ({ group: item.personal ? copy.materialOwnCollection : undefined, id: materialKey(item), label: name(item), short: item.kind === "all" ? copy.all : undefined,
            description: `${item.kind === "all" ? copy.allEnabledDescription : item.kind === "dictionary" ? copy.materialDictionary : item.personal ? copy.materialOwnCollection : copy.materialCollection} · ${formatUiCount(interfaceLanguage, item.total, copy, "card")}` }))} />
        <StatisticsQueue interfaceLanguage={interfaceLanguage} due={selected.due}
          description={selected.kind === "all" ? formatUiMessage(copy.allMaterial, { language: languageLabel }) : `${languageLabel} · ${name(selected)}`}
          practiseLabel={selected.kind === "all" ? copy.practiseAll : formatUiMessage(copy.practise, { material: name(selected) })}
          onPractise={scope.paused ? undefined : () => onPractiseMaterial(scope.code, selected)} />
        <StatisticsCoverage interfaceLanguage={interfaceLanguage} started={selected.started} total={selected.total} scopeLabel={selected.kind === "all" ? languageLabel : name(selected)} />
      </>}
    {((activity.status === "ready" && activity.refreshFailed) || (progress.status === "ready" && progress.refreshFailed)) &&
      <div className={s.status} role="status"><p>{copy.activityUnavailable}</p><button type="button" onClick={retry}>{copy.timeRetry}</button></div>}
    <details className={s.notes}><summary>{copy.about}</summary><p>{copy.accountNotes}</p></details>
  </div>;
}
