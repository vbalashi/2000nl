import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import {
  localizePlatformSemanticTerm,
  projectPlatformV2SenseContent,
} from "@/lib/platform/projections/platformV2SenseContent";
import type { TrainingExercisePresentation } from "./trainingCardPresentation";
import type { IdiomExerciseContent } from "./idiomExerciseContent";

/** Only the resolved target and its owned children enter the shared templates. */
export function buildIdiomCardPresentation({
  content,
  direction,
  interfaceLanguage,
  translationTargetLanguageCode,
  repeatCount = 0,
}: {
  content: IdiomExerciseContent;
  direction: "direct" | "reverse";
  interfaceLanguage: OnboardingLanguage;
  translationTargetLanguageCode: string | null;
  repeatCount?: number;
}): TrainingExercisePresentation {
  const { rootNodes } = projectPlatformV2SenseContent({
    capabilities: [],
    contentNodes: [
      content.expression,
      content.explanation,
      ...content.examples,
    ].map((node) => ({
      ...node,
      translations: node.translations.filter(
        (t) => t.targetLanguageCode === translationTargetLanguageCode,
      ),
    })),
  });
  return {
    label: { en: "Idiom", nl: "Uitdrukking", ru: "Идиома" }[interfaceLanguage],
    prompt:
      direction === "direct"
        ? { kind: "expression", text: content.expression.text }
        : { kind: "explanation", text: content.explanation.text },
    hint: content.headword.trim()
      ? {
          text: content.headword,
          label: { en: "Headword", nl: "Trefwoord", ru: "Словарная статья" }[
            interfaceLanguage
          ],
        }
      : undefined,
    answer: {
      headword: content.headword,
      article: content.article,
      coreVocabularyLabel: content.coreVocabularyLabel,
      partOfSpeech:
        localizePlatformSemanticTerm(
          content.partOfSpeech ?? content.entry.partOfSpeech,
          interfaceLanguage,
        ) ?? undefined,
      repeatCount,
      definitions: [],
      examples: rootNodes,
    },
  };
}
