"use client";
import React from "react";
import { TrainingExerciseCard } from "@/components/training/v2/TrainingExerciseCard";
import { buildIdiomCardPresentation } from "@/lib/training/idiomCardPresentation";
import { gateFurnitureEntry } from "@/lib/platform/fixtures/senseCardV1GateFixture";
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
    <main className={`${dark ? "dark" : ""} h-dvh`}>
      <div className="flex h-full flex-col gap-3 bg-slate-100 p-4 dark:bg-[#11141A]">
        <nav className="flex shrink-0 flex-wrap gap-3 text-sm dark:text-white">
          <span>Presentation fixture</span>
          <button
            onClick={() => {
              setDirection("direct");
              setRevealed(false);
            }}
          >
            Direct
          </button>
          <button
            onClick={() => {
              setDirection("reverse");
              setRevealed(false);
            }}
          >
            Reverse
          </button>
          <button onClick={() => setDark((v) => !v)}>Light / dark</button>
        </nav>
        <TrainingExerciseCard
          key={direction}
          presentation={buildIdiomCardPresentation({
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
        />
      </div>
    </main>
  );
}
