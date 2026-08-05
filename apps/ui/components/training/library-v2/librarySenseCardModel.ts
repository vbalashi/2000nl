import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import type {
  PlatformContentNodeKindV2,
  PlatformHeadwordGroupV2,
  PlatformSenseCardCapabilityV2,
  PlatformSenseCardEntryV2,
} from "../../../../../packages/shared/types/platformV2";

type StartOrMarkCapability = Extract<
  PlatformSenseCardCapabilityV2,
  { actionId: "start-learning" | "mark-known" }
>;

export type LibraryStartLearningCapability = StartOrMarkCapability & {
  actionId: "start-learning";
};
export type LibraryMarkKnownCapability = StartOrMarkCapability & {
  actionId: "mark-known";
};
export type LibraryUndoKnownCapability = Extract<
  PlatformSenseCardCapabilityV2,
  { actionId: "undo-known" }
>;
export type LibraryReviewCapability = Extract<
  PlatformSenseCardCapabilityV2,
  { actionId: "review-card" }
>;
export type LibraryMutationCapability =
  | LibraryStartLearningCapability
  | LibraryMarkKnownCapability
  | LibraryUndoKnownCapability
  | LibraryReviewCapability;

export type LibrarySenseContent = {
  contentNodeId: string;
  kind: PlatformContentNodeKindV2;
  text: string;
  translation: string | null;
};

export type LibrarySenseCardModel = {
  entryId: string;
  displayOrdinal: number | null;
  definition: LibrarySenseContent | null;
  entryTranslation: string | null;
  details: LibrarySenseContent[];
  phase: PlatformSenseCardEntryV2["card"] extends infer _Card
    ? NonNullable<PlatformSenseCardEntryV2["card"]>["scheduler"]["phase"] | null
    : never;
  repeatCount: number;
  startLearning: LibraryStartLearningCapability | null;
  markKnown: LibraryMarkKnownCapability | null;
  undoKnown: LibraryUndoKnownCapability | null;
  reviewActions: LibraryReviewCapability[];
};

export type LibrarySenseCardGroupModel = {
  headwordGroupId: string;
  article: string | null;
  headword: string;
  pronunciation: string | null;
  partOfSpeech: string | null;
  coreVocabularyLabel: string | null;
  meaningCountLabel: string;
  meanings: LibrarySenseCardModel[];
};

export type LibrarySenseCardViewState = Record<
  string,
  { expanded: boolean; translationVisible: boolean }
>;

export function reconcileLibrarySenseCardViewState(
  current: LibrarySenseCardViewState,
  entries: PlatformSenseCardEntryV2[],
): LibrarySenseCardViewState {
  return Object.fromEntries(
    entries.map((entry, index) => [
      entry.entryId,
      current[entry.entryId] ?? {
        expanded: index === 0,
        translationVisible: false,
      },
    ]),
  );
}

export function buildLibrarySenseCardGroupModel(
  group: PlatformHeadwordGroupV2,
  interfaceLanguage: OnboardingLanguage,
): LibrarySenseCardGroupModel {
  const senseEntries = group.entries.filter(
    (entry): entry is PlatformSenseCardEntryV2 => entry.kind === "sense-card",
  );
  const t = (key: string, variables?: Record<string, string | number>) =>
    platformV2Message(interfaceLanguage, key, variables);
  const partOfSpeech = group.header.partOfSpeech;
  const coreVocabulary = group.indicators.find(
    (indicator) => indicator.indicatorId === "core-vocabulary",
  );

  return {
    headwordGroupId: group.headwordGroupId,
    article: group.header.article ?? null,
    headword: group.header.displayPronunciation ?? group.header.text,
    pronunciation:
      group.header.displayPronunciation &&
      group.header.displayPronunciation !== group.header.text
        ? group.header.pronunciation ?? null
        : group.header.pronunciation ?? null,
    partOfSpeech: partOfSpeech
      ? t(partOfSpeech.messageKey) === partOfSpeech.messageKey
        ? partOfSpeech.sourceValue ?? null
        : t(partOfSpeech.messageKey)
      : null,
    coreVocabularyLabel: coreVocabulary
      ? t(coreVocabulary.messageKey)
      : null,
    meaningCountLabel: t("senseCard.sections.meanings"),
    meanings: senseEntries.map((entry) =>
      buildMeaning(entry, group.senseCount),
    ),
  };
}

function buildMeaning(
  entry: PlatformSenseCardEntryV2,
  senseCount: number,
): LibrarySenseCardModel {
  const nodes = [...entry.contentNodes].sort(
    (left, right) => left.order - right.order,
  );
  const content = nodes.map((node): LibrarySenseContent => ({
    contentNodeId: node.contentNodeId,
    kind: node.kind,
    text: node.text,
    translation:
      node.translations.find(
        (translation) =>
          translation.status === "ready" && Boolean(translation.text),
      )?.text ?? null,
  }));
  const summaryId = entry.summaryContentNodeId;
  const definition =
    content.find((node) => node.contentNodeId === summaryId) ??
    content.find((node) => node.kind === "definition") ??
    content[0] ??
    null;

  return {
    entryId: entry.entryId,
    displayOrdinal: senseCount > 1 ? entry.meaningOrdinal : null,
    definition,
    entryTranslation:
      entry.translation?.status === "ready" && entry.translation.isFresh
        ? entry.translation.text ?? null
        : null,
    details: content.filter(
      (node) => node.contentNodeId !== definition?.contentNodeId,
    ),
    phase: entry.card?.scheduler.phase ?? null,
    repeatCount: entry.card?.scheduler.repeatCount ?? 0,
    startLearning: capability(entry, "start-learning"),
    markKnown: capability(entry, "mark-known"),
    undoKnown: capability(entry, "undo-known"),
    reviewActions: entry.capabilities.filter(
      (candidate): candidate is LibraryReviewCapability =>
        candidate.actionId === "review-card",
    ),
  };
}

function capability(
  entry: PlatformSenseCardEntryV2,
  actionId: "start-learning",
): LibraryStartLearningCapability | null;
function capability(
  entry: PlatformSenseCardEntryV2,
  actionId: "mark-known",
): LibraryMarkKnownCapability | null;
function capability(
  entry: PlatformSenseCardEntryV2,
  actionId: "undo-known",
): LibraryUndoKnownCapability | null;
function capability(
  entry: PlatformSenseCardEntryV2,
  actionId: "start-learning" | "mark-known" | "undo-known",
): LibraryMutationCapability | null {
  return (entry.capabilities.find(
    (candidate) => candidate.actionId === actionId,
  ) ?? null) as LibraryMutationCapability | null;
}
