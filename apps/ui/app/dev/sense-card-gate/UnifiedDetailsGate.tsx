"use client";

import React from "react";
import { LibraryWordDetail } from "@/components/training/library-v2/LibraryWordDetail";
import { TrainingMoreSenseCardV2Session } from "@/components/training/library-v2/LibrarySenseCardV2Session";
import { gateFinanceEntry, gateFurnitureEntry } from "@/lib/platform/fixtures/senseCardV1GateFixture";
import { readingSizeStyles, type ReadingSize } from "@/lib/reading/readingSize";
import { TrainingDetailsDrawer } from "@/components/training/TrainingDetailsDrawer";
import { WordDetailDrawer } from "@/components/training/wordlist/WordDetailDrawer";

// Real Details modules; browser tests replace only lookup HTTP responses and
// record copy requests without mutating a dictionary or learning state.
export function UnifiedDetailsGate({ size = "normal", drawer = false }: { size?: ReadingSize; drawer?: boolean }) {
  const [entryId, setEntryId] = React.useState(gateFurnitureEntry.entryId);
  const [training, setTraining] = React.useState(false);
  const [copied, setCopied] = React.useState("");
  const props = {
    entryId,
    headword: "bank",
    contentLanguageCode: "nl",
    translationTargetLanguageCode: "en",
    interfaceLanguage: "nl" as const,
    onCopyToUserDictionary: async (selected: string) => { setCopied(selected); },
  };
  return (
    <main style={readingSizeStyles[size]} className="flex h-dvh flex-col gap-2 bg-background-light p-2 text-slate-900 dark:bg-background-dark dark:text-slate-100">
      <nav className="flex shrink-0 flex-wrap gap-3">
        <button onClick={() => setEntryId(gateFurnitureEntry.entryId)}>Single group</button>
        <button onClick={() => setEntryId(gateFinanceEntry.entryId)}>Multi group</button>
        <button onClick={() => setTraining(!training)}>Toggle Training Details</button>
      </nav>
      <div data-testid="details-viewport" className="relative mx-auto min-h-0 w-full max-w-[680px] flex-1 [transform:translateZ(0)]">
        {training ? (
          <TrainingDetailsDrawer open onClose={() => setTraining(false)} interfaceLanguage="nl">
            <TrainingMoreSenseCardV2Session
              {...props}
              trainingActionEntryId={entryId}
              onTrainingAction={() => undefined}
            />
          </TrainingDetailsDrawer>
        ) : drawer ? (
          <WordDetailDrawer selection={{ entryId, headword: "bank" }} open onClose={() => setTraining(false)} userId="" userLists={[]} contentLanguageCode="nl" translationLang="en" interfaceLanguage="nl" onCopyToUserDictionary={props.onCopyToUserDictionary} />
        ) : <LibraryWordDetail {...props} />}
      </div>
      <output data-testid="copied-entry" className="shrink-0 text-xs">{copied}</output>
    </main>
  );
}
