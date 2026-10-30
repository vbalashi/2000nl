"use client";

import React, { useEffect, useState } from "react";
import { Joyride, type TooltipRenderProps } from "react-joyride";
import { X, RotateCcw } from "lucide-react";
import { AppFrame } from "@/components/navigation/AppFrame";
import { TrainingOverview } from "@/components/practice/TrainingOverview";
import { SettingsPanel, SettingsRow } from "@/components/practice/settings/SettingsLayout";
import { TrainingSenseCardStage } from "@/components/training/v2/TrainingSenseCardStage";
import { buildTrainingSenseCardModel, type TrainingSenseCardContent } from "@/components/training/v2/trainingSenseCardModel";
import { gateFurnitureEntry, gateSingleSenseGroup } from "@/lib/platform/fixtures/senseCardV1GateFixture";
import { getStoredOnboardingLanguage, type OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages } from "@/lib/uiMessages";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import { languageDisplayName } from "@/lib/languages/languageDisplayName";
import { previewLocales, previewSteps, previewLanguageOptions, progressLabel, type PreviewCopy, type PreviewStage } from "./content";
import { readPreviewPreferences, resolvePreviewPreferences, savePreviewPreferences, previewTranslationLanguages, type PreviewPreferences, type PreviewTranslationLanguage } from "./preferences";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import settingsStyle from "@/components/practice/settings/settings.module.css";
import styles from "./preview.module.css";

type MessageData = { copy: PreviewCopy; progress: string; languageStep: boolean; secondary: boolean };
function TourMessage({ step, tooltipProps, controls }: TooltipRenderProps) {
  const data = step.data as MessageData;
  return <div {...tooltipProps} className={styles.tooltip}>
    <div className={styles.tooltipTop}><span>{data.progress}</span>
      <button onClick={() => controls.skip()} aria-label={data.copy.close}><X size={18}/></button></div>
    <h2>{step.title}</h2><div className={styles.copy}>{step.content}</div>
    {data.secondary && <p className={styles.secondaryMention}>{data.copy.secondaryMention}</p>}
    <p className={styles.instruction}>{data.languageStep ? data.copy.confirmHint : data.copy.clickHint}</p>
  </div>;
}

const sampleWordTranslations = { en: "bench · sofa", nl: "zitbank", ru: "скамья · диван", de: "Sitzbank · Sofa", fr: "banc · canapé", es: "banco · sofá" };
function withoutTranslations(nodes: TrainingSenseCardContent[]): TrainingSenseCardContent[] {
  return nodes.map(node => ({ ...node, translation: undefined, literalTranslation: undefined, children: withoutTranslations(node.children) }));
}

export function OnboardingPreview() {
  const [preferences, setPreferences] = useState<PreviewPreferences>(() => resolvePreviewPreferences(null));
  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState<PreviewStage>("interface");
  const [revealed, setRevealed] = useState(false);
  const [running, setRunning] = useState(true);
  const [notice, setNotice] = useState<keyof PreviewCopy | null>(null);
  const [saveError, setSaveError] = useState(false);
  const language = preferences.interfaceLanguage;
  const copy = previewLocales[language];
  const ui = getUiMessages(language);
  const languageStep = stage === "interface" || stage === "translation";

  useEffect(() => {
    // Read an available saved app language, but never write app/account keys.
    try { setPreferences(readPreviewPreferences(window.localStorage, getStoredOnboardingLanguage())); }
    catch { setPreferences(resolvePreviewPreferences(null)); }
    setReady(true);
  }, []);
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = language;
    return () => { document.documentElement.lang = previous; };
  }, [language]);
  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => {
      const selector = stage === "interface" ? "#preview-interface select" : stage === "translation" ? "#preview-translation select" : null;
      if (selector) document.querySelector<HTMLSelectElement>(selector)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [stage, ready]);

  const persist = (next: PreviewPreferences) => {
    let saved = false;
    try { saved = savePreviewPreferences(window.localStorage, next); } catch { /* storage may be denied */ }
    setSaveError(!saved);
    return saved;
  };
  const choose = (patch: Partial<PreviewPreferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    persist(next);
  };
  const confirm = (next: PreviewStage) => { if (persist(preferences)) { setStage(next); setNotice(null); } };
  const replay = () => { setRunning(false); setStage("interface"); setRevealed(false); setNotice(null); requestAnimationFrame(() => setRunning(true)); };
  const start = () => { setStage("card"); setNotice(null); };
  const spec = previewSteps.find(step => step.id === stage)!;
  const target = stage === "card" ? `#preview-card button[aria-label="${platformV2Message(language, "senseCard.answer.show")}"]` : spec.target;
  const step = { target, title: copy[spec.title], content: copy[spec.body], placement: spec.placement,
    data: { copy, progress: progressLabel(language, stage), languageStep, secondary: stage === "translation" } satisfies MessageData };
  const training = {
    id: "preview-dilum", name: "Dilum NL", language: languageDisplayName(language, "nl"),
    description: `${ui.trainingOverview.exerciseType.Words} · ${ui.trainingOverview.direction.Direct}`,
    summary: `${languageDisplayName(language, "nl")} · ${ui.trainingOverview.exerciseType.Words} · ${ui.trainingOverview.direction.Direct}`,
    completedToday: 0, meaningCount: 12, sessionSize: 10, cardFilter: "both" as const, canLaunch: true,
  };
  const initialModel = buildTrainingSenseCardModel({ group: gateSingleSenseGroup, entry: gateFurnitureEntry, interfaceLanguage: language });
  // Synthetic content; no account repositories, training controller or learning writes.
  const model = { ...initialModel, repeatCount: 0, reviewCapabilities: [],
    entryTranslation: preferences.translationLanguage === "off" ? undefined : sampleWordTranslations[preferences.translationLanguage],
    entryTranslationAlternatives: [], requestTranslationCapability: undefined,
    definitions: preferences.translationLanguage === "ru" ? initialModel.definitions : withoutTranslations(initialModel.definitions),
    examples: preferences.translationLanguage === "ru" ? initialModel.examples : withoutTranslations(initialModel.examples),
    learnCapability: { actionId: "start-learning", elementId: "preview-learn", messageKey: "senseCard.learning.start",
      target: { kind: "sense-card", entryId: gateFurnitureEntry.entryId, cardTypeId: "word-to-definition", stateRevision: "preview-state" } } as NonNullable<typeof initialModel.learnCapability> };

  if (!ready) return null;
  return <div className={`${theme.theme} ${styles.root}`} lang={language}>
    <div className={styles.previewBar}><span>{copy.preview}</span>
      <button onClick={replay}><RotateCcw size={14}/>{copy.replay}</button></div>
    <AppFrame activeDestination={languageStep ? "settings" : "training"} settingsActive={languageStep} interfaceLanguage={language} themePreference="system" immersive={stage === "card"}
      onNavigate={() => { setNotice("scope"); setRunning(false); }}
      onCycleTheme={() => { setNotice("themeLater"); setRunning(false); }} onOpenSettings={replay}>
      {languageStep ? <div className={styles.languages}>
        <h1>{ui.settings.languages}</h1>
        <SettingsPanel title={ui.settings.title}>
          <div id="preview-interface" className={styles.languageTarget}>
            <SettingsRow title={ui.settings.interfaceLanguage} hint={copy.interfaceHint} className={styles.languageRow}>
              <select className={settingsStyle.select} aria-label={ui.settings.interfaceLanguage} value={language}
                onChange={event => choose({ interfaceLanguage: event.target.value as OnboardingLanguage })}>
                {previewLanguageOptions.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
              {stage === "interface" && <button className={styles.confirm} onClick={() => confirm("translation")}>{copy.interfaceConfirm}</button>}
            </SettingsRow>
            {stage === "interface" && saveError && <p role="alert" className={styles.error}>{copy.saveError}</p>}
          </div>
          <div id="preview-translation" className={styles.languageTarget}>
            <SettingsRow title={ui.settings.translationLanguage} className={styles.languageRow}>
              <select className={settingsStyle.select} aria-label={ui.settings.translationLanguage} value={preferences.translationLanguage}
                onChange={event => choose({ translationLanguage: event.target.value as PreviewTranslationLanguage })}>
                <option value="off">{ui.settings.off}</option>
                {previewTranslationLanguages.map(code => <option key={code} value={code}>{languageDisplayName(language, code)}</option>)}
              </select>
              {stage === "translation" && <button className={styles.confirm} onClick={() => confirm("overview")}>{copy.translationConfirm}</button>}
            </SettingsRow>
            {stage === "translation" && saveError && <p role="alert" className={styles.error}>{copy.saveError}</p>}
          </div>
          <SettingsRow title={ui.settings.secondaryTranslationLanguage} hint={copy.secondaryMention} className={styles.languageRow}>
            <span className={styles.later}>{copy.later}</span>
          </SettingsRow>
        </SettingsPanel>
        <p className={styles.localOnly}>{copy.localOnly}</p>
      </div> : stage === "overview" ? <div id="preview-overview" className={styles.overview}>
        <TrainingOverview interfaceLanguage={language} state={{ status: "ready", trainings: [training], mainId: training.id,
          availability: { trainingId: training.id, status: "ready", dueToday: 0, totalReviews: 0, stillNew: 12 } }}
          onLaunch={start} onResume={start} onSelect={() => {}} onCreate={() => { setRunning(false); setNotice("createLater"); }}
          onEdit={() => { setRunning(false); setNotice("editLater"); }} onRetry={replay}/>
      </div> : <div className={styles.session}>
        <div className={styles.sessionHeader}><span>Dilum NL</span><span>0 / 10</span><button aria-label={copy.closeSession} onClick={() => { setRunning(false); setStage("overview"); }}><X size={18}/></button></div>
        <div id="preview-card" className={styles.card}>
          <TrainingSenseCardStage model={model} mode="word-to-definition" interfaceLanguage={language} side={revealed ? "answer" : "face"}
            onSideChange={side => { setRunning(false); setRevealed(side === "answer"); if (side === "answer") setNotice("finish"); }}
            onAction={() => setNotice("noLearningWrite")}/>
        </div>
      </div>}
      {notice && <p role="status" className={styles.notice}>{copy[notice]}</p>}
    </AppFrame>
    <Joyride key={`${stage}:${language}`} run={running && !revealed} steps={[step]} tooltipComponent={TourMessage}
      onEvent={data => { if (data.status === "skipped" || data.status === "finished") setRunning(false); }}
      options={{ skipBeacon: true, blockTargetInteraction: false, disableFocusTrap: true, overlayClickAction: false,
        dismissKeyAction: "close", closeButtonAction: "skip", overlayColor: "rgba(24, 19, 34, .52)",
        spotlightPadding: 8, spotlightRadius: 15, arrowColor: "#fff", arrowSize: 8, arrowBase: 16,
        width: 340, zIndex: 10000, scrollDuration: 0, primaryColor: "#71608d" }}/>
  </div>;
}
