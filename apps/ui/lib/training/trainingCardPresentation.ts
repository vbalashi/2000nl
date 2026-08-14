import type { DebugStats, TrainingWord } from "@/lib/types";
import { getAllMeanings, type LinkTerm } from "@/lib/wordUtils";

export type TrainingCardPresentationIdiom = {
  expression: string;
  explanation: string;
};

export type TrainingCardPresentationPrompt =
  | {
      kind: "definition";
      text: string;
      translationTarget: "definition";
      suppressPrimaryIdiomExplanationOnReveal: false;
    }
  | {
      kind: "idiom-explanation";
      text: string;
      translationTarget: { idiomIndex: 0; idiomField: "explanation" };
      suppressPrimaryIdiomExplanationOnReveal: true;
    }
  | {
      kind: "idiom-expression";
      text: string;
      translationTarget: { idiomIndex: 0; idiomField: "expression" };
      suppressPrimaryIdiomExplanationOnReveal: false;
    };

export type TrainingCardPresentationMeaning = {
  definition: string;
  context?: string;
  examples: string[];
  idioms: TrainingCardPresentationIdiom[];
  links: LinkTerm[];
  prompt: TrainingCardPresentationPrompt;
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

const presentationPrompt = (
  definition: string,
  idioms: TrainingCardPresentationIdiom[],
): TrainingCardPresentationPrompt => {
  if (definition.trim()) {
    return {
      kind: "definition",
      text: definition,
      translationTarget: "definition",
      suppressPrimaryIdiomExplanationOnReveal: false,
    };
  }

  const primaryIdiom = idioms[0];
  if (primaryIdiom?.explanation.trim()) {
    return {
      kind: "idiom-explanation",
      text: primaryIdiom.explanation,
      translationTarget: { idiomIndex: 0, idiomField: "explanation" },
      suppressPrimaryIdiomExplanationOnReveal: true,
    };
  }
  if (primaryIdiom?.expression.trim()) {
    return {
      kind: "idiom-expression",
      text: primaryIdiom.expression,
      translationTarget: { idiomIndex: 0, idiomField: "expression" },
      suppressPrimaryIdiomExplanationOnReveal: false,
    };
  }

  return {
    kind: "definition",
    text: definition,
    translationTarget: "definition",
    suppressPrimaryIdiomExplanationOnReveal: false,
  };
};

/**
 * Anti-corruption boundary for the legacy/listening Training renderer.
 *
 * Raw dictionary compatibility stays in wordUtils; the renderer receives only
 * this closed presentation contract and never reads TrainingWord.raw itself.
 * The projection owns the definition -> idiom explanation -> idiom expression
 * prompt fallback plus its translation target and reveal-suppression semantics.
 */
export const projectTrainingCardPresentation = (
  word: TrainingWord,
): TrainingCardPresentation => {
  const meanings = getAllMeanings(word.raw).map((meaning) => {
    const idioms = meaning.idioms.map((idiom) => ({
      expression: idiom.expression,
      explanation: idiom.explanation,
    }));
    return {
      definition: meaning.definition,
      context: meaning.context,
      examples: [...meaning.examples],
      idioms,
      links: meaning.links.map((link) => ({ ...link })),
      prompt: presentationPrompt(meaning.definition, idioms),
    };
  });
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
