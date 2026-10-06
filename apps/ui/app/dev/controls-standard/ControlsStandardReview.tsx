"use client";
import React, { useState, useEffect, useLayoutEffect, useRef } from "react";

import {hasUnsavedTrainingChanges} from "@/lib/training/setups/unsavedChanges";
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
  const [savedRecipe,setSavedRecipe] = useState({id:"preview",name:"Translation",languageCode:"nl",draft:initialDraft});
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
      <div className="review-toolbar">
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
          hasUnsavedChanges={hasUnsavedTrainingChanges(savedRecipe,{name,languageCode:language,draft})}
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
            setSavedRecipe({id:"preview",name:name.trim(),languageCode:language,draft});
            setMessage("Preview: saved changes");
            return true;
          }}
          onSaveAs={async (newName) => {
            setName(newName);
            setSavedRecipe({id:"preview",name:newName,languageCode:language,draft});
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
    </>
  );
}
