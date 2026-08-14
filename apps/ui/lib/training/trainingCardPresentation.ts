import type { DebugStats, TrainingWord } from "@/lib/types";
import { getAllMeanings, type LinkTerm } from "@/lib/wordUtils";

export type TrainingCardPresentationIdiom = {
  expression: string;
  explanation: string;
};

export type TrainingCardPresentationMeaning = {
  definition: string;
  context?: string;
  examples: string[];
  idioms: TrainingCardPresentationIdiom[];
  links: LinkTerm[];
};

export type TrainingCardPresentation = {
  entryId: string;
  headword: string;
  partOfSpeech?: string;
  gender?: string;
  meanings: TrainingCardPresentationMeaning[];
  meaningCount: number;
  meaningOrdinal?: number;
  debugStats?: DebugStats;
};

const presentationGender = (word: TrainingWord) => {
  const gender = word.gender;
  const normalizedGender = gender?.trim();
  if (!gender || !normalizedGender) return undefined;

  return word.headword
    .trim()
    .toLowerCase()
    .startsWith(`${normalizedGender.toLowerCase()} `)
    ? undefined
    : gender;
};

/**
 * Anti-corruption boundary for the legacy/listening Training renderer.
 *
 * Raw dictionary compatibility stays in wordUtils; the renderer receives only
 * this closed presentation contract and never reads TrainingWord.raw itself.
 */
export const projectTrainingCardPresentation = (
  word: TrainingWord,
): TrainingCardPresentation => {
  const meanings = getAllMeanings(word.raw).map((meaning) => ({
    definition: meaning.definition,
    context: meaning.context,
    examples: [...meaning.examples],
    idioms: meaning.idioms.map((idiom) => ({
      expression: idiom.expression,
      explanation: idiom.explanation,
    })),
    links: meaning.links.map((link) => ({ ...link })),
  }));
  const meaningOrdinal =
    typeof word.raw.meaning_id === "number" ? word.raw.meaning_id : undefined;

  return {
    entryId: word.id,
    headword: word.headword,
    partOfSpeech: word.part_of_speech,
    gender: presentationGender(word),
    meanings,
    meaningCount: word.meanings_count ?? meanings.length,
    meaningOrdinal,
    debugStats: word.debugStats,
  };
};
