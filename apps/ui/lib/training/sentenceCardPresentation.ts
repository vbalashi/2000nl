import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { localizePlatformSemanticTerm, projectPlatformV2SenseContent } from "@/lib/platform/projections/platformV2SenseContent";
import type { TrainingExercisePresentation } from "./exerciseCardPresentation";
import { resolveSentencePrompt, type SentenceExerciseContent } from "./sentenceExerciseContent";

/** Missing translations remain preparation states; never reveal the source as a fallback prompt. */
export function buildSentenceCardPresentation({
  content,
  interfaceLanguage,
  translationTargetLanguageCode,
  repeatCount = 0,
}: {
  content: SentenceExerciseContent;
  interfaceLanguage: OnboardingLanguage;
  translationTargetLanguageCode: string;
  repeatCount?: number;
}): TrainingExercisePresentation | null {
  const prompt = resolveSentencePrompt(content, translationTargetLanguageCode);
  if (prompt.status !== "ready") return null;
  const { rootNodes } = projectPlatformV2SenseContent({
    capabilities: content.entry.capabilities,
    contentNodes: [{
      ...content.sentence,
      translations: content.sentence.translations.filter(
        (translation) => translation.translationId === prompt.translationId,
      ),
    }],
  });
  return {
    label: { en: "Translate into Dutch", nl: "Vertaal naar het Nederlands", ru: "Переведите на нидерландский" }[interfaceLanguage],
    prompt: { kind: "explanation", text: prompt.text },
    answerTranslationInitiallyVisible: true,
    answer: {
      headword: content.group.header.text,
      article: content.group.header.article ?? undefined,
      partOfSpeech: localizePlatformSemanticTerm(content.entry.partOfSpeech ?? content.group.header.partOfSpeech, interfaceLanguage) ?? undefined,
      repeatCount,
      definitions: [],
      examples: rootNodes,
    },
  };
}
