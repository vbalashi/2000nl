import type { PlatformV2SenseContentNode } from "@/lib/platform/projections/platformV2SenseContent";

export type TrainingCardPrompt =
  | { kind: "expression"; text: string; article?: string }
  | { kind: "explanation"; text: string };

export type TrainingCardAnswer = {
  headword: string;
  article?: string;
  partOfSpeech?: string;
  coreVocabularyLabel?: "2K";
  entryTranslation?: string;
  entryTranslationAlternatives?: string[];
  repeatCount: number;
  definitions: PlatformV2SenseContentNode[];
  examples: PlatformV2SenseContentNode[];
};

export type TrainingExercisePresentation = {
  label: string;
  prompt: TrainingCardPrompt;
  hint?: { text: string; label: string };
  answer: TrainingCardAnswer;
};
