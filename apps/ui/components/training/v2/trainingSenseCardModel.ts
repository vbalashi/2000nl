import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import {
  localizePlatformSemanticTerm,
  projectPlatformV2SenseContent,
  type PlatformV2SenseContentNode,
} from "@/lib/platform/projections/platformV2SenseContent";
import type {
  PlatformAudioCapabilityV2,
  PlatformHeadwordGroupV2,
  PlatformSenseCardCapabilityV2,
  PlatformSenseCardEntryV2,
} from "../../../../../packages/shared/types/platformV2";

export type TrainingSenseCardContent = PlatformV2SenseContentNode;

export type TrainingSenseCardModel = {
  entryId: string;
  headword: string;
  article?: string;
  partOfSpeech?: string;
  coreVocabularyLabel?: "2K";
  entryTranslation?: string;
  entryTranslationAlternatives?: string[];
  requestTranslationCapability?: Extract<
    PlatformSenseCardCapabilityV2,
    { actionId: "request-translation" }
  >;
  definitions: TrainingSenseCardContent[];
  examples: TrainingSenseCardContent[];
  repeatCount: number;
  isKnown: boolean;
  audioCapability?: PlatformAudioCapabilityV2;
  learnCapability?: PlatformSenseCardCapabilityV2 & {
    actionId: "start-learning";
  };
  markKnownCapability?: PlatformSenseCardCapabilityV2 & {
    actionId: "mark-known";
  };
  undoKnownCapability?: Extract<
    PlatformSenseCardCapabilityV2,
    { actionId: "undo-known" }
  >;
  reviewCapabilities: Array<
    Extract<PlatformSenseCardCapabilityV2, { actionId: "review-card" }>
  >;
  reportCapabilities: Array<
    Extract<PlatformSenseCardCapabilityV2, { actionId: "report-content" }>
  >;
};

const reviewOrder = ["fail", "hard", "success", "easy"] as const;
const definitionKinds = new Set<PlatformV2SenseContentNode["kind"]>([
  "definition",
  "usage-pattern",
  "usage-note",
]);
const exampleKinds = new Set<PlatformV2SenseContentNode["kind"]>([
  "example",
  "idiom",
  "idiom-explanation",
]);

export function buildTrainingSenseCardModel({
  group,
  entry,
  interfaceLanguage,
}: {
  group: PlatformHeadwordGroupV2;
  entry: PlatformSenseCardEntryV2;
  interfaceLanguage: OnboardingLanguage;
}): TrainingSenseCardModel {
  const { rootNodes: rootContent } = projectPlatformV2SenseContent(entry);
  const capability = <T extends PlatformSenseCardCapabilityV2["actionId"]>(
    actionId: T,
  ) =>
    entry.capabilities.find(
      (candidate): candidate is PlatformSenseCardCapabilityV2 & {
        actionId: T;
      } => candidate.actionId === actionId,
    );
  const pos = entry.partOfSpeech ?? group.header.partOfSpeech;
  const partOfSpeech = localizePlatformSemanticTerm(pos, interfaceLanguage);
  const has2k = group.indicators.some(
    (indicator) =>
      indicator.indicatorId === "core-vocabulary.nt2-2000" ||
      indicator.messageKey === "indicator.coreVocabulary.nt22000",
  );
  const entryTranslation =
    entry.translation?.status === "ready" &&
    entry.translation.isFresh &&
    entry.translation.text
      ? entry.translation.text
      : undefined;

  return {
    entryId: entry.entryId,
    headword: group.header.displayPronunciation ?? group.header.text,
    ...(group.header.article ? { article: group.header.article } : {}),
    ...(partOfSpeech ? { partOfSpeech } : {}),
    ...(has2k ? { coreVocabularyLabel: "2K" as const } : {}),
    ...(entryTranslation ? { entryTranslation } : {}),
    entryTranslationAlternatives:
      entry.translation?.status === "ready" && entry.translation.isFresh
        ? (entry.translation.alternativeTexts ?? [])
        : [],
    ...(capability("request-translation")
      ? { requestTranslationCapability: capability("request-translation") }
      : {}),
    definitions: rootContent.filter((item) => definitionKinds.has(item.kind)),
    examples: rootContent.filter((item) => exampleKinds.has(item.kind)),
    repeatCount: entry.card?.scheduler.repeatCount ?? 0,
    isKnown: Boolean(entry.card?.knownMark),
    ...(group.header.audio ? { audioCapability: group.header.audio } : {}),
    ...(capability("start-learning")
      ? { learnCapability: capability("start-learning") }
      : {}),
    ...(capability("mark-known")
      ? { markKnownCapability: capability("mark-known") }
      : {}),
    ...(capability("undo-known")
      ? { undoKnownCapability: capability("undo-known") }
      : {}),
    reviewCapabilities: reviewOrder.flatMap((reviewResult) => {
      const match = entry.capabilities.find(
        (candidate): candidate is Extract<
          PlatformSenseCardCapabilityV2,
          { actionId: "review-card" }
        > =>
          candidate.actionId === "review-card" &&
          candidate.reviewResult === reviewResult,
      );
      return match ? [match] : [];
    }),
    reportCapabilities: entry.capabilities.filter(
      (candidate): candidate is Extract<
        PlatformSenseCardCapabilityV2,
        { actionId: "report-content" }
      > => candidate.actionId === "report-content",
    ),
  };
}
