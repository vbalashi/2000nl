"use client";
import React from "react";
import {TrainingInteractionPreferencesProvider, useTrainingInteractions, defaultTrainingInteractions} from "@/components/practice/ui/TrainingInteractionPreferences";
const fixtureRepository = {load:async()=>defaultTrainingInteractions,save:async()=>{}};
function InteractionControls(){const {preferences,save}=useTrainingInteractions();return <>{(["animation","translationSwipe","syllableDoubleTap"] as const).map(key=><label key={key}><input type="checkbox" checked={preferences[key]} onChange={event=>void save({...preferences,[key]:event.target.checked})}/>{key}</label>)}</>;}

import practiceTheme from "@/components/practice/ui/practiceTheme.module.css";
import { TrainingSenseCardStage } from "@/components/training/v2/TrainingSenseCardStage";
import { buildTrainingSenseCardModel } from "@/components/training/v2/trainingSenseCardModel";
import { TrainingExerciseCard } from "@/components/training/v2/TrainingExerciseCard";
import { buildIdiomCardPresentation } from "@/lib/training/idiomCardPresentation";
import { buildSentenceCardPresentation } from "@/lib/training/sentenceCardPresentation";
import {
  gateFurnitureEntry,
  gateSingleSenseGroup,
} from "@/lib/platform/fixtures/senseCardV1GateFixture";
import type { IdiomExerciseContent } from "@/lib/training/idiomExerciseContent";

const expressionId = "gate-klaar-idiom";
function node(
  kind: "idiom" | "idiom-explanation" | "example",
  text: string,
  order: number,
) {
  return {
    contentNodeId: `${expressionId}-${order}`,
    parentContentNodeId: order === 0 ? null : `${expressionId}-0`,
    kind,
    text,
    order,
    sourceTextFingerprint: `gate-${order}`,
    translations: [],
  };
}
const content: IdiomExerciseContent = {
  group: gateSingleSenseGroup,
  headword: "klaar",
  entry: {
    ...gateFurnitureEntry,
    partOfSpeech: {
      termId: "part-of-speech.bn",
      messageKey: "partOfSpeech.bn",
      sourceValue: "bn",
    },
  },
  expression: node("idiom", "ergens helemaal klaar mee zijn", 0),
  explanation: node(
    "idiom-explanation",
    "iets helemaal niet meer willen, omdat je het vervelend vindt",
    1,
  ),
  examples: [node("example", "ik ben helemaal klaar met zijn gezeur", 2)],
};

/** Fixed presentation fixture; no session, auth, or learning-state writes. */
export function ExerciseCardGate() {
  const [context, setContext] = React.useState(false);
  const [sentence, setSentence] = React.useState(false);
  const [direction, setDirection] = React.useState<"direct" | "reverse">(
    "direct",
  );
  const [revealed, setRevealed] = React.useState(false);
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    const previous = document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    return () => {
      document.documentElement.classList.toggle("dark", previous);
    };
  }, [dark]);
  return (
    <TrainingInteractionPreferencesProvider userId="fixture" initial={defaultTrainingInteractions} repository={fixtureRepository}><main data-colour-mode={dark ? "dark" : "light"} className={`${practiceTheme.theme} ${dark ? "dark" : ""} h-dvh`}>
      <div className="flex h-full flex-col gap-3 bg-[var(--practice-canvas)] p-4 text-[var(--practice-text)]">
        <nav className="flex shrink-0 flex-wrap gap-3 text-sm dark:text-white">
          <span>Presentation fixture</span><InteractionControls/>
          <button onClick={() => { setContext(false); setSentence(true); setRevealed(false); }}>Sentence</button>
          <button
            onClick={() => {
              setContext(false);
              setDirection("direct");
              setSentence(false);
              setRevealed(false);
            }}
          >
            Direct
          </button>
          <button
            onClick={() => {
              setContext(false);
              setDirection("reverse");
              setSentence(false);
              setRevealed(false);
            }}
          >
            Reverse
          </button>
          <button onClick={() => { setContext(true); setRevealed(false); }}>Word in context</button>
          <button onClick={() => setDark((v) => !v)}>Light / dark</button>
        </nav>
        {context ? <TrainingSenseCardStage
          model={{...buildTrainingSenseCardModel({ group: gateSingleSenseGroup, entry: gateFurnitureEntry, interfaceLanguage: "en" }),
            headword: "wed·strijd", partOfSpeech: "noun", entryTranslation: "матч",
            definitions: [{ contentNodeId: "gate-match-meaning", parentContentNodeId: null, kind: "definition", text: "een sportieve ontmoeting tussen twee teams", children: [] }], examples: []}}
          mode="definition-to-word" interfaceLanguage="en" side={revealed ? "answer" : "face"}
          onSideChange={side => setRevealed(side === "answer")} onAction={() => setRevealed(false)}
          contextPrompt={{ text: "ФК Гронинген выиграл матч", sourceText: "FC Groningen heeft de wedstrijd gewonnen", contentNodeId: "gate-match-example", sourceTextFingerprint: "gate-match" }}
        /> : <TrainingExerciseCard
          key={sentence ? "sentence" : direction}
          presentation={sentence ? buildSentenceCardPresentation({
            content: { group: content.group, entry: content.entry, sentence: {
              ...content.examples[0], parentContentNodeId: null,
              translations: [{ translationId: "gate-sentence-en", targetLanguageCode: "en",
                status: "ready", text: "I am tired of his nagging.",
                sourceTextFingerprint: content.examples[0].sourceTextFingerprint,
                translationPolicyVersion: "gate-v1" }],
            } }, interfaceLanguage: "en", translationTargetLanguageCode: "en",
          })! : buildIdiomCardPresentation({
            content,
            direction,
            interfaceLanguage: "en",
            translationTargetLanguageCode: null,
          })}
          interfaceLanguage="en"
          revealed={revealed}
          onReveal={() => setRevealed(true)}
          busy={false}
          onGrade={() => setRevealed(false)}
        />}
      </div>
    </main></TrainingInteractionPreferencesProvider>
  );
}
