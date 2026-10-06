"use client";
import React, { useState, useEffect, useLayoutEffect, useRef } from "react";

import { useRouter } from "next/navigation";
import { AppDestinationNav } from "@/components/navigation/AppDestinationNav";
import { ApprovedTrainingBuilder } from "@/components/training/pilot/ApprovedTrainingBuilder";
import { mixStepSelection } from "@/components/training/pilot/TrainingMixPicker";
import { getUiMessages } from "@/lib/uiMessages";
import type {
  TrainingMode,
  TrainingExerciseFamily,
  TrainingSessionSize,
} from "@/lib/types";
import type { TrainingSetupOption } from "@/lib/training/setups/availability";
import type { TrainingSetupDraft } from "@/lib/training/setups/types";
import s from "@/components/training/pilot/approvedTrainingBuilder.module.css";
import section from "@/components/practice/builder/builderSection.module.css";
import controls from "@/components/practice/builder/builderControls.module.css";
import theme from "@/components/practice/ui/practiceTheme.module.css";
// Prototype: Start-first footer variants; production Builder remains unchanged.
const footerVariants = [{key:"current",label:"Текущий · 44 px"},{key:"quiet",label:"A · Без фона · 28 px"},{key:"outline",label:"B · Компактная рамка · 28 px"},{key:"wide",label:"C · Широкая рамка · 34 px"}];
const DEFAULT_SESSION_SIZE = 10;
const defaultModesForScenario = (scenario: TrainingSetupOption) => {
  const modes = scenario.modes ?? [];
  if (scenario.value === "idiom" && modes.includes("word-to-definition")) {
    return ["word-to-definition"] satisfies TrainingMode[];
  }
  if (
    scenario.value === "understanding" &&
    modes.includes("word-to-definition")
  ) {
    return ["word-to-definition"] satisfies TrainingMode[];
  }
  return modes;
};

const scenarios: TrainingSetupOption[] = [
  {
    value: "understanding",
    label: "Understanding",
    modes: ["word-to-definition", "definition-to-word"],
  },
  {
    value: "idiom",
    label: "Idioms",
    modes: ["word-to-definition", "definition-to-word"],
  },
];
const initialDraft: TrainingSetupDraft & { sessionSize: TrainingSessionSize } =
  {
    family: "word-in-context",
    scenarioId: "understanding",
    modes: ["definition-to-word"],
    cardFilter: "review",
    newReviewRatio: 2,
    sessionSize: 5,
    listValue: "all",
    materialMode: "selected-dictionaries",
    dictionaryIds: ["vandale-2k"],
    partOfSpeech: [],
    nounArticles: [],
    dateWindow: "all",
    sourceValue: "all",
  };
export function ControlsStandardReview() {
  const router = useRouter();
  const [footerVariant,setFooterVariant] = useState("quiet");
  const changeFooter = (value:string) => {
    setFooterVariant(value);
    const url = new URL(window.location.href);
    url.searchParams.set("variant",value);
    router.replace(url.pathname+url.search,{scroll:false});
  };
  const cycleFooter = (step:number) => changeFooter(footerVariants[(footerVariants.findIndex(v=>v.key===footerVariant)+step+footerVariants.length)%footerVariants.length].key);
  useEffect(()=>{const value=new URL(window.location.href).searchParams.get("variant");if(footerVariants.some(v=>v.key===value))setFooterVariant(value!);},[]);
  useEffect(()=>{const listener=(event:KeyboardEvent)=>{if((event.target as HTMLElement)?.closest("input,textarea,select,[contenteditable]"))return;if(event.key!=="ArrowLeft"&&event.key!=="ArrowRight")return;event.preventDefault();cycleFooter(event.key==="ArrowRight"?1:-1);};window.addEventListener("keydown",listener);return()=>window.removeEventListener("keydown",listener);});
  const [draft, setDraft] = useState(initialDraft),
    [name, setName] = useState("Translation"),
    [language, setLanguage] = useState("nl"),
    [dark, setDark] = useState(false),
    [interfaceLanguage, setInterfaceLanguage] = useState<"en" | "ru" | "nl">(
      "en",
    ),
    [translation, setTranslation] = useState<string | null>("ru"),
    [layout, setLayout] = useState("frame"),
    [width, setWidth] = useState("desktop"),
    [message, setMessage] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const activeFamily = draft.family ?? "meaning",
    selectedScenario = scenarios.find((s) => s.value === draft.scenarioId),
    understandingScenario = scenarios[0],
    idiomScenario = scenarios[1];
  const selectFamily = (family: TrainingExerciseFamily) => {
    const scenario =
      family === "idiom"
        ? idiomScenario
        : family === "sentence"
          ? scenarios.find((option) => option.value === "sentences")
          : understandingScenario;
    if (!scenario) return;
    setDraft((current) => ({
      ...current,
      family,
      scenarioId: scenario.value,
      modes:
        family === "word-in-context"
          ? ["definition-to-word"]
          : defaultModesForScenario(scenario),
      ...(family !== "meaning" && current.sessionSize === "all-due-today"
        ? { sessionSize: DEFAULT_SESSION_SIZE }
        : {}),
    }));
  };
  const toggleMode = (mode: TrainingMode) => {
    if (!selectedScenario?.modes?.includes(mode)) return;
    setDraft((current) => {
      const active = current.modes.includes(mode);
      if (activeFamily === "word-in-context") return current;
      if (activeFamily !== "meaning" && activeFamily !== "idiom") {
        return {
          ...current,
          scenarioId: selectedScenario.value,
          modes: [mode],
        };
      }
      if (active && current.modes.length === 1) return current;
      return {
        ...current,
        scenarioId: selectedScenario.value,
        modes: active
          ? current.modes.filter((candidate) => candidate !== mode)
          : [...current.modes, mode],
      };
    });
  };
  const changeMix = (index: number) =>
    setDraft((current) => {
      const selection = mixStepSelection(index, current.newReviewRatio);
      return {
        ...current,
        ...selection,
        sessionSize:
          selection.cardFilter !== "review" &&
          current.sessionSize === "all-due-today"
            ? DEFAULT_SESSION_SIZE
            : current.sessionSize,
      };
    });

  const b = getUiMessages(interfaceLanguage).builder;
  return (
    <>
      <div className="review-toolbar"><label>Действия <select aria-label="Вариант действий" value={footerVariant} onChange={e=>changeFooter(e.target.value)}>{footerVariants.map(v=><option key={v.key} value={v.key}>{v.label}</option>)}</select></label>
        <label>
          Размер{" "}
          <select value={width} onChange={(e) => setWidth(e.target.value)}>
            <option value="desktop">Десктоп</option>
            <option value="mobile">Мобильный</option>
          </select>
        </label>
        <label>
          Тема{" "}
          <select
            value={dark ? "dark" : "light"}
            onChange={(e) => setDark(e.target.value === "dark")}
          >
            <option value="light">Светлая</option>
            <option value="dark">Тёмная</option>
          </select>
        </label>
        <label>
          Интерфейс{" "}
          <select
            value={interfaceLanguage}
            onChange={(e) => setInterfaceLanguage(e.target.value as any)}
          >
            <option value="en">English</option>
            <option value="ru">Русский</option>
            <option value="nl">Nederlands</option>
          </select>
        </label>
        <label>
          Перевод{" "}
          <select
            value={translation ?? "off"}
            onChange={(e) =>
              setTranslation(e.target.value === "off" ? null : e.target.value)
            }
          >
            <option value="ru">Russian</option>
            <option value="en">English</option>
            <option value="off">Off</option>
          </select>
        </label>
      </div>
      <div
        ref={root}
        style={{
          padding: 8,
          maxWidth: width === "mobile" ? 390 : 1000,
          paddingBottom: 90,
          margin: "auto",
        }}
        className={`${theme.theme}`}
        data-colour-mode={dark ? "dark" : "light"}
        data-layout={layout}
        data-footer-variant={footerVariant}
        data-preview-width={width}
        data-account-palette="indigo"
        data-practice-palette="indigo"
      >
        <div style={{maxWidth:"100%",overflowX:"auto",marginBottom:24}}><AppDestinationNav
          active="training"
          interfaceLanguage={interfaceLanguage}
          onNavigate={() => {}}
        /></div>
        <ApprovedTrainingBuilder
          interfaceLanguage={interfaceLanguage}
          draft={draft}
          languageCode={language}
          languageOptions={[
            { value: "nl", label: "Dutch" },
            { value: "en", label: "English" },
          ]}
          lists={[{ value: "all", label: "VanDale 2k" }]}
          dictionaries={[{ value: "vandale-2k", label: "VanDale 2k" }]}
          sources={[]}
          scenarios={scenarios}
          languagePending={false}
          dictionariesLoading={false}
          translationLanguage={translation}
          name={name}
          onNameChange={setName}
          onLanguageChange={(value) => {
            setLanguage(value);
            setDraft(initialDraft);
          }}
          onDraftChange={setDraft}
          onSelectFamily={selectFamily}
          onToggleMode={toggleMode}
          onMixChange={changeMix}
          onBack={() => setMessage("Preview: Back to Training")}
          onSave={async () => {
            setMessage("Preview: saved changes");
            return true;
          }}
          onSaveAs={async (newName) => {
            setMessage("Preview: saved as " + newName);
            return true;
          }}
          onDelete={async () => {
            setMessage("Preview: deleted saved training");
            return true;
          }}
          deletionChangesMain={false}
          onBeginSave={() => setMessage("")}
          onStart={() => setMessage("Preview: start with the current draft")}
          saveDisabled={
            (draft.family === "word-in-context" && translation === null) ||
            (draft.materialMode === "selected-dictionaries" &&
              !draft.dictionaryIds?.length)
          }
          startDisabled={
            (draft.family === "word-in-context" && translation === null) ||
            (draft.materialMode === "selected-dictionaries" &&
              !draft.dictionaryIds?.length)
          }
          saveLabel={
            interfaceLanguage === "ru"
              ? "Сохранить изменения"
              : interfaceLanguage === "nl"
                ? "Wijzigingen opslaan"
                : "Save changes"
          }
          startLabel={b.start}
          canSave
          editing
          saveAsLabel={
            interfaceLanguage === "ru"
              ? "Сохранить как…"
              : interfaceLanguage === "nl"
                ? "Opslaan als…"
                : "Save as…"
          }
        />
        <output className="review-feedback" aria-live="polite">
          {message}
        </output>
      </div>
      <div className="footer-prototype-switcher" aria-label="Сравнение вариантов действий"><button aria-label="Предыдущий вариант" onClick={()=>cycleFooter(-1)}>←</button><span>{footerVariants.find(v=>v.key===footerVariant)?.label}</span><button aria-label="Следующий вариант" onClick={()=>cycleFooter(1)}>→</button></div>
      <style>{`
.footer-prototype-switcher{position:fixed;z-index:30;bottom:18px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:12px;border-radius:20px;padding:6px 10px;max-width:calc(100vw - 24px);background:#272541;color:white;box-shadow:0 3px 18px #0002;font:13px/20px sans-serif;white-space:nowrap}
.footer-prototype-switcher button{border:0;background:transparent;color:inherit;padding:3px 8px;cursor:pointer}
[data-footer-variant]:not([data-footer-variant=current]) .${s.footer}>div{display:grid!important;grid-template-columns:34px minmax(0,1fr)!important;gap:12px!important;align-items:center!important}
[data-footer-variant]:not([data-footer-variant=current]) .${s.footer}>div>.${s.primary}{grid-column:1/-1!important;grid-row:1!important;width:100%!important}
[data-footer-variant]:not([data-footer-variant=current]) .${s.delete}{grid-column:1!important;grid-row:2!important;width:34px!important;height:28px!important;margin:0!important;justify-content:center!important}
[data-footer-variant]:not([data-footer-variant=current]) .${s.delete}>span{display:none!important}
[data-footer-variant]:not([data-footer-variant=current]) .${s.updateGroup}{grid-column:2!important;grid-row:2!important;justify-self:end!important;flex:none!important;width:var(--builder-action-width,168px)!important;height:28px!important;background:transparent!important;border-radius:11.2px!important;box-sizing:border-box}
[data-footer-variant]:not([data-footer-variant=current]) .${s.updateGroup}>.${s.secondary}{height:100%!important;min-height:0!important;border:0!important;padding:0 10px!important;border-radius:11.2px 0 0 11.2px!important;font-weight:400}
[data-footer-variant]:not([data-footer-variant=current]) .${s.saveMenu} summary{height:100%!important;min-height:0!important;width:28px!important;border:0!important;border-radius:0 11.2px 11.2px 0!important}
[data-footer-variant=outline] .${s.updateGroup},[data-footer-variant=wide] .${s.updateGroup}{border:1px solid var(--practice-border)!important}
[data-footer-variant=wide] .${s.updateGroup}{width:100%!important;height:34px!important;border-radius:13.6px!important}
[data-footer-variant=wide] .${s.delete}{height:34px!important}
[data-footer-variant]:not([data-footer-variant=current]) .${s.updateGroup}:hover{background:var(--practice-surface-subtle)!important}
      `}</style>
    </>
  );
}
