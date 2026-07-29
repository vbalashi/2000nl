import type {
  DictionaryLookupResult,
  DictionarySummary,
} from "../../../../../packages/shared/types/platform";
import type {
  PlatformContentNodeKindV2,
  PlatformContentNodeTranslationV2,
  PlatformEntryTranslationStateV2,
  PlatformLookupV2Response,
  PlatformSemanticTermV2,
  PlatformSenseCardCapabilityV2,
  PlatformSenseCardStateV2,
  PlatformWordDetailsV2,
} from "../../../../../packages/shared/types/platformV2";

type ProjectionCardState = {
  stateRevision: string;
  clickCount: number;
  seenCount: number;
  successCount: number;
  lastSeenAt: string | null;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  hidden: boolean;
  frozenUntil: string | null;
  inLearning: boolean;
  learningDueAt: string | null;
  fsrs: {
    stability: number | null;
    difficulty: number | null;
    reps: number;
    lapses: number;
    lastGrade: number | null;
    lastInterval: number | null;
    paramsVersion: string | null;
  };
};

export type PlatformContentNodeBindingV2Input = {
  contentNodeId: string;
  sourcePath: string;
  kind: PlatformContentNodeKindV2;
  parentContentNodeId?: string | null;
  sourceTextFingerprint: string;
  translations?: PlatformContentNodeTranslationV2[];
};

export type PlatformLookupV2ProjectionEntry = {
  headwordGroupId: string;
  entry: DictionaryLookupResult["entry"];
  dictionary: DictionarySummary;
  contentNodeBindings: PlatformContentNodeBindingV2Input[];
  cardState?: ProjectionCardState | null;
  entryTranslation?: PlatformEntryTranslationStateV2 | null;
  wordDetails?: PlatformWordDetailsV2;
};

export type PlatformLookupV2ProjectionInput = {
  query: string;
  request: PlatformLookupV2Response["request"];
  entries: PlatformLookupV2ProjectionEntry[];
  page: PlatformLookupV2Response["page"];
};

export class PlatformV2ProjectionError extends Error {
  constructor(
    public readonly code:
      | "missing_dictionary"
      | "missing_content_node_binding"
      | "duplicate_content_node_binding"
      | "mixed_dictionary_group",
    message: string,
  ) {
    super(message);
    this.name = "PlatformV2ProjectionError";
  }
}

export function projectPlatformLookupV2(
  input: PlatformLookupV2ProjectionInput,
): PlatformLookupV2Response {
  const groups = new Map<string, PlatformLookupV2ProjectionEntry[]>();

  for (const item of input.entries) {
    const groupEntries = groups.get(item.headwordGroupId) ?? [];
    groupEntries.push(item);
    groups.set(item.headwordGroupId, groupEntries);
  }

  return {
    contractVersion: "platform-lookup-v2",
    query: input.query,
    request: input.request,
    groups: Array.from(groups, ([headwordGroupId, entries]) =>
      projectHeadwordGroup(headwordGroupId, entries, input.request),
    ),
    page: input.page,
  };
}

function projectHeadwordGroup(
  headwordGroupId: string,
  entries: PlatformLookupV2ProjectionEntry[],
  request: PlatformLookupV2Response["request"],
): PlatformLookupV2Response["groups"][number] {
  const first = entries[0];
  if (!first?.dictionary?.id || !first.dictionary.languageCode) {
    throw new PlatformV2ProjectionError(
      "missing_dictionary",
      `Headword Group ${headwordGroupId} has no public dictionary owner`,
    );
  }
  if (entries.some((item) => item.dictionary.id !== first.dictionary.id)) {
    throw new PlatformV2ProjectionError(
      "mixed_dictionary_group",
      `Headword Group ${headwordGroupId} spans dictionaries`,
    );
  }

  const uniformPartOfSpeech = uniformString(
    entries.map((item) => item.entry.partOfSpeech ?? null),
  );
  const uniformArticle = uniformString(
    entries.map((item) => item.entry.gender ?? null),
  );
  const sourceMeta = asRecord(first.entry.content.sourceMeta);
  const displayPronunciation = asString(
    sourceMeta.pronunciation_with_stress ?? sourceMeta.displayPronunciation,
  );
  const pronunciation = asString(
    sourceMeta.pronunciation ?? sourceMeta.pronunciation_ipa,
  );
  const homographNumber = asPositiveInteger(
    sourceMeta.homograph_number ?? sourceMeta.homographNumber,
  );

  return {
    headwordGroupId,
    dictionary: {
      dictionaryId: first.dictionary.id,
      sourceLanguageCode: first.dictionary.languageCode,
      messageKey: dictionaryMessageKey(first.dictionary),
    },
    header: {
      text: first.entry.headword,
      ...(homographNumber ? { homographNumber } : {}),
      ...(displayPronunciation ? { displayPronunciation } : {}),
      ...(pronunciation ? { pronunciation } : {}),
      ...(uniformArticle ? { article: uniformArticle } : {}),
      ...(uniformPartOfSpeech
        ? { partOfSpeech: semanticTerm("part-of-speech", uniformPartOfSpeech) }
        : {}),
    },
    senseCount: entries.length,
    entryCount: entries.length,
    indicators: entries.every((item) => item.entry.isNt22000 === true)
      ? [
          {
            indicatorId: "core-vocabulary",
            value: "nt2-2000",
            messageKey: "indicator.coreVocabulary.nt22000",
          },
        ]
      : [],
    entries: entries.map((item) => projectSenseCard(item, request)),
  };
}

function projectSenseCard(
  item: PlatformLookupV2ProjectionEntry,
  request: PlatformLookupV2Response["request"],
): PlatformLookupV2Response["groups"][number]["entries"][number] {
  const bindingsByPath = new Map<string, PlatformContentNodeBindingV2Input>();
  for (const binding of item.contentNodeBindings) {
    if (bindingsByPath.has(binding.sourcePath)) {
      throw new PlatformV2ProjectionError(
        "duplicate_content_node_binding",
        `Entry ${item.entry.id} has duplicate binding for ${binding.sourcePath}`,
      );
    }
    bindingsByPath.set(binding.sourcePath, binding);
  }

  const contentNodes = item.entry.content.sections.flatMap((section, order) => {
    const kind = publicContentKind(section.kind);
    if (!kind) return [];
    const binding = bindingsByPath.get(section.sourcePath);
    if (!binding || binding.kind !== kind) {
      throw new PlatformV2ProjectionError(
        "missing_content_node_binding",
        `Entry ${item.entry.id} has no ${kind} binding for ${section.sourcePath}`,
      );
    }
    return [
      {
        contentNodeId: binding.contentNodeId,
        parentContentNodeId: binding.parentContentNodeId ?? null,
        kind,
        order,
        text: section.text,
        sourceTextFingerprint: binding.sourceTextFingerprint,
        translations: binding.translations ?? [],
      },
    ];
  });
  const card = item.cardState
    ? projectCardState(item.cardState, item.entry.id, request.cardTypeId)
    : null;
  const entryTarget = {
    kind: "entry" as const,
    entryId: item.entry.id,
    contentRevision: item.entry.contentFingerprint,
  };

  return {
    kind: "sense-card",
    entryId: item.entry.id,
    meaningOrdinal: item.entry.meaningId ?? null,
    ...(item.entry.partOfSpeech
      ? {
          partOfSpeech: semanticTerm(
            "part-of-speech",
            item.entry.partOfSpeech,
          ),
        }
      : {}),
    card,
    contentRevision: item.entry.contentFingerprint,
    summaryContentNodeId:
      contentNodes.find((node) => node.kind === "definition")?.contentNodeId ??
      contentNodes[0]?.contentNodeId ??
      null,
    contentNodes,
    translation: item.entryTranslation ?? null,
    capabilities: capabilitiesFor({
      card,
      entryTarget,
      targetLanguageCode: request.translationTargetLanguageCode,
    }),
    ...(item.wordDetails ? { wordDetails: item.wordDetails } : {}),
  };
}

function projectCardState(
  state: ProjectionCardState,
  entryId: string,
  cardTypeId: string,
): PlatformSenseCardStateV2 {
  return {
    cardTypeId,
    scheduler: {
      phase: schedulerPhase(state),
      repeatCount: state.clickCount,
      lastSeenAt: state.lastSeenAt,
      ...(state.frozenUntil ? { frozenUntil: state.frozenUntil } : {}),
    },
    knownMark: null,
    stateRevision: state.stateRevision,
  };
}

function schedulerPhase(
  state: ProjectionCardState,
): PlatformSenseCardStateV2["scheduler"]["phase"] {
  if (state.hidden) return "hidden";
  if (state.frozenUntil) return "frozen";
  if (state.inLearning) return "learning";
  if (state.fsrs.reps > 0 || state.lastReviewedAt) return "reviewing";
  if (state.seenCount > 0 || state.clickCount > 0) return "encountered";
  return "not-started";
}

function capabilitiesFor(params: {
  card: PlatformSenseCardStateV2 | null;
  entryTarget: {
    kind: "entry";
    entryId: string;
    contentRevision: string;
  };
  targetLanguageCode: string | null;
}): PlatformSenseCardCapabilityV2[] {
  const capabilities: PlatformSenseCardCapabilityV2[] = [];
  const card = params.card;
  if (card) {
    const target = {
      kind: "sense-card" as const,
      entryId: params.entryTarget.entryId,
      cardTypeId: card.cardTypeId,
      stateRevision: card.stateRevision,
    };
    if (
      card.scheduler.phase === "learning" ||
      card.scheduler.phase === "reviewing"
    ) {
      for (const reviewResult of [
        "fail",
        "hard",
        "success",
        "easy",
      ] as const) {
        capabilities.push({
          actionId: "review-card",
          elementId: `sense-card.review.${reviewResult}`,
          messageKey: `senseCard.review.${reviewResult}`,
          target,
          reviewResult,
        });
      }
    } else if (
      card.scheduler.phase === "not-started" ||
      card.scheduler.phase === "encountered"
    ) {
      capabilities.push({
        actionId: "start-learning",
        elementId: "sense-card.learning.start",
        messageKey: "senseCard.learning.start",
        target,
      });
    }
  }
  if (params.targetLanguageCode) {
    capabilities.push({
      actionId: "request-translation",
      elementId: "sense-card.translation.request",
      messageKey: "senseCard.translation.request",
      target: params.entryTarget,
      targetLanguageCode: params.targetLanguageCode,
    });
  }
  capabilities.push({
    actionId: "report-content",
    elementId: "sense-card.report",
    messageKey: "senseCard.report",
    target: params.entryTarget,
  });
  return capabilities;
}

function publicContentKind(
  kind: DictionaryLookupResult["entry"]["content"]["sections"][number]["kind"],
): PlatformContentNodeKindV2 | null {
  if (kind === "meaning") return "definition";
  if (kind === "context") return "usage-pattern";
  if (kind === "example") return "example";
  if (kind === "idiom") return "idiom";
  if (kind === "note") return "usage-note";
  return null;
}

function semanticTerm(namespace: string, value: string): PlatformSemanticTermV2 {
  return {
    termId: `${namespace}.${value}`,
    messageKey:
      namespace === "part-of-speech"
        ? `partOfSpeech.${value}`
        : `${namespace}.${value}`,
    sourceValue: value,
  };
}

function dictionaryMessageKey(dictionary: DictionarySummary) {
  const key = dictionary.slug.trim() || dictionary.id;
  return `dictionary.${key}`;
}

function uniformString(values: Array<string | null>) {
  const normalized = values.map((value) => value?.trim() || null);
  const first = normalized[0] ?? null;
  return first && normalized.every((value) => value === first) ? first : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}
