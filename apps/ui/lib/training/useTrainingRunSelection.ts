"use client";

import { useCallback, useRef, useState } from "react";
import type {
  CardFilter, TrainingExerciseFamily, TrainingFocusFilter, TrainingMode,
  TrainingSessionSize, WordListType,
} from "@/lib/types";

/** Selection belongs to a run, not to the account defaults that created it.
 * Progress, access checks and plan revisions remain live server-owned data. */
export type TrainingRunSelection = {
  sessionId: string;
  family: TrainingExerciseFamily;
  languageCode: string;
  scenarioId: string;
  modes: TrainingMode[];
  cardFilter: CardFilter;
  newReviewRatio: number;
  listId: string | null;
  listType: WordListType | null;
  listLabel?: string;
  focusFilter: TrainingFocusFilter;
  sessionSize: TrainingSessionSize;
};

/** Start/resume and explicit replacement are the only selection transitions.
 * Owned copies prevent a setup draft or a later response mutating the run. */
export function useTrainingRunSelection() {
  const [selection, setSelection] = useState<TrainingRunSelection | null>(null);
  const owner = useRef<TrainingRunSelection | null>(null);
  const latch = useCallback((run: TrainingRunSelection) => {
    const owned = structuredClone(run);
    owner.current = owned;
    setSelection(owned);
  }, []);
  const release = useCallback(() => {
    owner.current = null;
    setSelection(null);
  }, []);
  const isCurrent = useCallback((sessionId: string, family: TrainingExerciseFamily) =>
    owner.current?.sessionId === sessionId && owner.current.family === family, []);
  return { selection, latch, release, isCurrent };
}
