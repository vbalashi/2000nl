import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import type {
  PlatformContentNodeV2,
  PlatformAudioCapabilityV2,
  PlatformHeadwordGroupV2,
  PlatformSenseCardCapabilityV2,
  PlatformSenseCardEntryV2,
} from "../../../../../packages/shared/types/platformV2";

export type TrainingSenseCardContent = {
  contentNodeId: string;
  kind: PlatformContentNodeV2["kind"];
  text: string;
  translation?: string;
};

export type TrainingSenseCardModel = {
  entryId: string;
  headword: string;
  article?: string;
  partOfSpeech?: string;
  coreVocabularyLabel?: "2K";
  entryTranslation?: string;
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
const definitionKinds = new Set<PlatformContentNodeV2["kind"]>([
  "definition",
  "usage-pattern",
  "usage-note",
]);
const exampleKinds = new Set<PlatformContentNodeV2["kind"]>([
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
  const nodes = [...entry.contentNodes].sort((left, right) => left.order - right.order);
  const content = (node: PlatformContentNodeV2): TrainingSenseCardContent => {
    const translation = node.translations.find(
      (candidate) => candidate.status === "ready" && candidate.text,
    )?.text;
    return {
      contentNodeId: node.contentNodeId,
      kind: node.kind,
      text: node.text,
      ...(translation ? { translation } : {}),
    };
  };
  const capability = <T extends PlatformSenseCardCapabilityV2["actionId"]>(
    actionId: T,
  ) =>
    entry.capabilities.find(
      (candidate): candidate is PlatformSenseCardCapabilityV2 & {
        actionId: T;
      } => candidate.actionId === actionId,
    );
  const pos = entry.partOfSpeech ?? group.header.partOfSpeech;
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
    ...(pos
      ? { partOfSpeech: platformV2Message(interfaceLanguage, pos.messageKey) }
      : {}),
    ...(has2k ? { coreVocabularyLabel: "2K" as const } : {}),
    ...(entryTranslation ? { entryTranslation } : {}),
    ...(capability("request-translation")
      ? { requestTranslationCapability: capability("request-translation") }
      : {}),
    definitions: nodes.filter((node) => definitionKinds.has(node.kind)).map(content),
    examples: nodes.filter((node) => exampleKinds.has(node.kind)).map(content),
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
