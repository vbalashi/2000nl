import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import type {
  PlatformContentNodeKindV2,
  PlatformAudioCapabilityV2,
  PlatformHeadwordGroupV2,
  PlatformSenseCardCapabilityV2,
  PlatformSenseCardEntryV2,
} from "../../../../../packages/shared/types/platformV2";
import type { CardTypeId } from "../../../../../packages/shared/types/platform";

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
export type LibraryReportCapability = Extract<
  PlatformSenseCardCapabilityV2,
  { actionId: "report-content" }
>;
export type LibraryMutationCapability =
  | LibraryStartLearningCapability
  | LibraryMarkKnownCapability
  | LibraryUndoKnownCapability;

export type LibrarySenseContent = {
  contentNodeId: string;
  parentContentNodeId: string | null;
  kind: PlatformContentNodeKindV2;
  text: string;
  translation: string | null;
  reportCapability: LibraryReportCapability | null;
  children: LibrarySenseContent[];
};

export type LibrarySenseCardModel = {
  entryId: string;
  cardTypeId: CardTypeId;
  displayOrdinal: number | null;
  partOfSpeech: string | null;
  definition: LibrarySenseContent | null;
  entryTranslation: string | null;
  entryTranslationAlternatives: string[];
  translationStatus: PlatformSenseCardEntryV2["translation"] extends infer _State
    ? NonNullable<PlatformSenseCardEntryV2["translation"]>["status"] | null
    : never;
  details: LibrarySenseContent[];
  repeatCount: number;
  startLearning: LibraryStartLearningCapability | null;
  markKnown: LibraryMarkKnownCapability | null;
  undoKnown: LibraryUndoKnownCapability | null;
  reportCapability: LibraryReportCapability | null;
};

export type LibraryCrossReferenceModel = {
  crossReferenceId: string;
  displayOrdinal: number | null;
  label: string | null;
  text: string;
  targetQuery: string;
  targetHeadwordGroupId: string | null;
  targetEntryId: string | null;
  sourceDictionaryId: string;
  followLabel: string;
};

export type LibraryGroupPresentation =
  | { kind: "sense-card"; meaning: LibrarySenseCardModel }
  | { kind: "cross-reference"; reference: LibraryCrossReferenceModel };

export type LibrarySenseCardGroupModel = {
  article: string | null;
  headword: string;
  audioCapability: PlatformAudioCapabilityV2 | null;
  partOfSpeech: string | null;
  coreVocabularyLabel: string | null;
  senseCount: number;
  meanings: LibrarySenseCardModel[];
  crossReferences: LibraryCrossReferenceModel[];
  presentations: LibraryGroupPresentation[];
};

export type LibrarySenseCardViewState = Record<
  string,
  { expanded: boolean; translationVisible: boolean }
>;

export function librarySenseCardIdentity(
  entryId: string,
  cardTypeId: CardTypeId,
): string {
  return `${entryId}\u0000${cardTypeId}`;
}

export function reconcileLibrarySenseCardViewState(
  current: LibrarySenseCardViewState,
  meanings: Array<Pick<LibrarySenseCardModel, "entryId" | "cardTypeId">>,
): LibrarySenseCardViewState {
  return Object.fromEntries(
    meanings.map((meaning, index) => {
      const identity = librarySenseCardIdentity(
        meaning.entryId,
        meaning.cardTypeId,
      );
      return [
        identity,
        current[identity] ?? {
          expanded: index === 0,
          translationVisible: false,
        },
      ];
    }),
  );
}

export function buildLibrarySenseCardGroupModel(
  group: PlatformHeadwordGroupV2,
  interfaceLanguage: OnboardingLanguage,
  requestedCardTypeId: CardTypeId = "word-to-definition",
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
  const crossReferences = group.entries
    .filter((entry) => entry.kind === "cross-reference")
    .map((entry) => ({
      crossReferenceId: entry.crossReferenceId,
      displayOrdinal: group.entryCount > 1 ? entry.meaningOrdinal : null,
      label: entry.label
        ? platformV2Message(interfaceLanguage, entry.label.messageKey)
        : null,
      text: entry.text,
      targetQuery: entry.target.query,
      targetHeadwordGroupId: entry.target.headwordGroupId ?? null,
      targetEntryId: entry.target.entryId ?? null,
      sourceDictionaryId: group.dictionary.dictionaryId,
      followLabel: platformV2Message(
        interfaceLanguage,
        entry.capabilities.find(
          (capability) => capability.actionId === "follow-cross-reference",
        )?.messageKey ?? "crossReference.follow",
      ),
    }));

  const meanings = senseEntries.map((entry) =>
    buildMeaning(
      entry,
      group.entryCount,
      requestedCardTypeId,
      interfaceLanguage,
    ),
  );
  const meaningById = new Map(
    meanings.map((meaning) => [meaning.entryId, meaning]),
  );
  const referenceById = new Map(
    crossReferences.map((reference) => [reference.crossReferenceId, reference]),
  );
  return {
    article: group.header.article ?? null,
    headword: group.header.displayPronunciation ?? group.header.text,
    audioCapability: group.header.audio ?? null,
    partOfSpeech: partOfSpeech
      ? t(partOfSpeech.messageKey) === partOfSpeech.messageKey
        ? (partOfSpeech.sourceValue ?? null)
        : t(partOfSpeech.messageKey)
      : null,
    coreVocabularyLabel: coreVocabulary ? t(coreVocabulary.messageKey) : null,
    senseCount: group.senseCount,
    crossReferences,
    meanings,
    presentations: group.entries.flatMap<LibraryGroupPresentation>((entry) =>
      entry.kind === "sense-card"
        ? meaningById.has(entry.entryId)
          ? [
              {
                kind: "sense-card" as const,
                meaning: meaningById.get(entry.entryId)!,
              },
            ]
          : []
        : referenceById.has(entry.crossReferenceId)
          ? [
              {
                kind: "cross-reference" as const,
                reference: referenceById.get(entry.crossReferenceId)!,
              },
            ]
          : [],
    ),
  };
}

function buildMeaning(
  entry: PlatformSenseCardEntryV2,
  entryCount: number,
  requestedCardTypeId: CardTypeId,
  interfaceLanguage: OnboardingLanguage,
): LibrarySenseCardModel {
  const nodes = [...entry.contentNodes].sort(
    (left, right) => left.order - right.order,
  );
  const reportByContentNodeId = new Map(
    entry.capabilities.flatMap((candidate) =>
      candidate.actionId === "report-content" &&
      candidate.target.kind === "content-node"
        ? [[candidate.target.contentNodeId, candidate] as const]
        : [],
    ),
  );
  const contentById = new Map<string, LibrarySenseContent>();
  for (const node of nodes) {
    contentById.set(node.contentNodeId, {
      contentNodeId: node.contentNodeId,
      parentContentNodeId: node.parentContentNodeId,
      kind: node.kind,
      text: node.text,
      translation:
        node.translations.find(
          (translation) =>
            translation.status === "ready" && Boolean(translation.text),
        )?.text ?? null,
      reportCapability: reportByContentNodeId.get(node.contentNodeId) ?? null,
      children: [],
    });
  }
  for (const node of contentById.values()) {
    if (!node.parentContentNodeId) continue;
    contentById.get(node.parentContentNodeId)?.children.push(node);
  }
  const content = [...contentById.values()];
  const summaryId = entry.summaryContentNodeId;
  const definition =
    content.find((node) => node.contentNodeId === summaryId) ??
    content.find((node) => node.kind === "definition") ??
    content[0] ??
    null;

  return {
    entryId: entry.entryId,
    cardTypeId: entry.card?.cardTypeId ?? requestedCardTypeId,
    displayOrdinal: entryCount > 1 ? entry.meaningOrdinal : null,
    partOfSpeech: entry.partOfSpeech
      ? platformV2Message(interfaceLanguage, entry.partOfSpeech.messageKey) ===
        entry.partOfSpeech.messageKey
        ? (entry.partOfSpeech.sourceValue ?? null)
        : platformV2Message(interfaceLanguage, entry.partOfSpeech.messageKey)
      : null,
    definition,
    entryTranslation:
      entry.translation?.status === "ready" && entry.translation.isFresh
        ? (entry.translation.text ?? null)
        : null,
    entryTranslationAlternatives:
      entry.translation?.status === "ready" && entry.translation.isFresh
        ? (entry.translation.alternativeTexts ?? [])
        : [],
    translationStatus: entry.translation?.status ?? null,
    details: content.filter(
      (node) =>
        node.contentNodeId !== definition?.contentNodeId &&
        (!node.parentContentNodeId ||
          !contentById.has(node.parentContentNodeId)),
    ),
    repeatCount: entry.card?.scheduler.repeatCount ?? 0,
    startLearning: capability(entry, "start-learning"),
    markKnown: capability(entry, "mark-known"),
    undoKnown: capability(entry, "undo-known"),
    reportCapability:
      entry.capabilities.find(
        (candidate): candidate is LibraryReportCapability =>
          candidate.actionId === "report-content" &&
          candidate.target.kind === "entry",
      ) ?? null,
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
