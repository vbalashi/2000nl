import type {
  PlatformContentNodeV2,
  PlatformEntryPresentationV2,
  PlatformHeadwordGroupV2,
  PlatformLookupV2Response,
  PlatformSemanticTermV2,
  PlatformSenseCardCapabilityV2,
  PlatformWordDetailsV2,
} from "./platformV2";

const CARD_TYPES = new Set([
  "word-to-definition",
  "definition-to-word",
  "listen-recognize",
  "listen-type",
]);
const INTENTS = new Set(["dictionary-lookup", "training-review", "external-click"]);
const NODE_KINDS = new Set([
  "definition", "usage-pattern", "example", "idiom", "idiom-explanation", "usage-note",
]);
const TRANSLATION_STATES = new Set(["ready", "pending", "failed", "not-available"]);
const CARD_PHASES = new Set(["not-started", "encountered", "learning", "reviewing", "hidden", "frozen"]);
const REVIEW_RESULTS = new Set(["fail", "hard", "success", "easy"]);

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const string = (value: unknown): value is string => typeof value === "string";
const optionalString = (value: unknown) => value === undefined || string(value);
const nullableString = (value: unknown) => value === null || string(value);
const finiteNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const optionalFiniteNumber = (value: unknown) => value === undefined || finiteNumber(value);
const arrayOf = <T>(value: unknown, guard: (item: unknown) => item is T): value is T[] =>
  Array.isArray(value) && value.every(guard);

function semanticTerm(value: unknown): value is PlatformSemanticTermV2 {
  return record(value) && string(value.termId) && string(value.messageKey) &&
    optionalString(value.sourceValue);
}

function translation(value: unknown, entryId?: string) {
  if (!record(value) || !string(value.translationId) ||
      !string(value.targetLanguageCode) || !TRANSLATION_STATES.has(String(value.status)) ||
      !optionalString(value.text) || !string(value.translationPolicyVersion) ||
      !optionalString(value.providerRevision) || !optionalString(value.errorCode)) return false;
  if (entryId === undefined) return string(value.sourceTextFingerprint);
  return value.entryId === entryId && string(value.sourceContentFingerprint) &&
    (value.alternativeTexts === undefined || arrayOf(value.alternativeTexts, string)) &&
    (value.baseText === undefined || nullableString(value.baseText)) &&
    (value.note === undefined || nullableString(value.note)) && typeof value.isFresh === "boolean";
}

function target(value: unknown, kind: string) {
  if (!record(value) || value.kind !== kind || !string(value.entryId)) return false;
  if (kind === "sense-card") return CARD_TYPES.has(String(value.cardTypeId)) && string(value.stateRevision);
  if (kind === "entry") return string(value.contentRevision);
  if (kind === "content-node") return string(value.contentNodeId) && string(value.sourceTextFingerprint);
  return kind === "translation" && string(value.translationId) &&
    optionalString(value.contentNodeId) && string(value.sourceTextFingerprint);
}

function capability(value: unknown): value is PlatformSenseCardCapabilityV2 {
  if (!record(value) || !string(value.elementId) || !string(value.messageKey)) return false;
  switch (value.actionId) {
    case "start-learning":
    case "mark-known":
      return target(value.target, "sense-card");
    case "undo-known":
      return target(value.target, "sense-card") && record(value.target) &&
        string(value.target.activeKnownMarkId) && string(value.target.knownMarkRevision);
    case "review-card":
      return target(value.target, "sense-card") && REVIEW_RESULTS.has(String(value.reviewResult));
    case "request-translation":
      return target(value.target, "entry") && string(value.targetLanguageCode);
    case "report-content":
      return target(value.target, "entry") || target(value.target, "content-node") ||
        target(value.target, "translation");
    case "open-word-details":
      return target(value.target, "entry");
    default:
      return false;
  }
}

function contentNode(value: unknown): value is PlatformContentNodeV2 {
  return record(value) && string(value.contentNodeId) && nullableString(value.parentContentNodeId) &&
    NODE_KINDS.has(String(value.kind)) && finiteNumber(value.order) && string(value.text) &&
    string(value.sourceTextFingerprint) && arrayOf(value.translations, (item): item is never => translation(item));
}

function detailText(value: unknown) {
  return record(value) && string(value.detailId) && string(value.text) && optionalString(value.contentNodeId);
}

function wordDetails(value: unknown, entryId: string): value is PlatformWordDetailsV2 {
  return record(value) && value.entryId === entryId &&
    arrayOf(value.lexicalRelations, (item): item is never => record(item) &&
      string(item.relationId) && (item.kind === "synonym" || item.kind === "antonym") &&
      string(item.text) && optionalString(item.targetEntryId)) &&
    arrayOf(value.labels, semanticTerm) && arrayOf(value.grammarNotes, (item): item is never => detailText(item)) &&
    arrayOf(value.usageNotes, (item): item is never => detailText(item)) &&
    arrayOf(value.pronunciationNotes, (item): item is never => detailText(item)) &&
    arrayOf(value.forms, (item): item is never => record(item) && string(item.formId) &&
      semanticTerm(item.kind) && string(item.text) && arrayOf(item.features, semanticTerm)) &&
    arrayOf(value.references, (item): item is never => record(item) && string(item.referenceId) &&
      semanticTerm(item.kind) && string(item.text) && optionalString(item.targetEntryId));
}

function card(value: unknown) {
  return record(value) && CARD_TYPES.has(String(value.cardTypeId)) && record(value.scheduler) &&
    CARD_PHASES.has(String(value.scheduler.phase)) && optionalFiniteNumber(value.scheduler.repeatCount) &&
    (value.scheduler.lastSeenAt === undefined || nullableString(value.scheduler.lastSeenAt)) &&
    (value.scheduler.frozenUntil === undefined || nullableString(value.scheduler.frozenUntil)) &&
    (value.knownMark === null || (record(value.knownMark) && string(value.knownMark.markId) &&
      string(value.knownMark.revision) && string(value.knownMark.markedAt))) && string(value.stateRevision);
}

function entry(value: unknown): value is PlatformEntryPresentationV2 {
  if (!record(value)) return false;
  if (value.kind === "cross-reference") {
    return string(value.crossReferenceId) && (value.meaningOrdinal === null || finiteNumber(value.meaningOrdinal)) &&
      (value.label === null || semanticTerm(value.label)) && string(value.text) && record(value.target) &&
      string(value.target.query) && optionalString(value.target.headwordGroupId) && optionalString(value.target.entryId) &&
      arrayOf(value.capabilities, (item): item is never => record(item) &&
        item.actionId === "follow-cross-reference" && string(item.elementId) && string(item.messageKey));
  }
  if (value.kind !== "sense-card" || !string(value.entryId)) return false;
  return (value.meaningOrdinal === null || finiteNumber(value.meaningOrdinal)) &&
    (value.partOfSpeech === undefined || semanticTerm(value.partOfSpeech)) &&
    (value.card === null || card(value.card)) && string(value.contentRevision) &&
    nullableString(value.summaryContentNodeId) && arrayOf(value.contentNodes, contentNode) &&
    (value.translation === null || translation(value.translation, value.entryId)) &&
    arrayOf(value.capabilities, capability) &&
    (value.wordDetails === undefined || wordDetails(value.wordDetails, value.entryId));
}

function group(value: unknown): value is PlatformHeadwordGroupV2 {
  return record(value) && string(value.headwordGroupId) && record(value.dictionary) &&
    string(value.dictionary.dictionaryId) && string(value.dictionary.sourceLanguageCode) &&
    string(value.dictionary.displayName) && string(value.dictionary.messageKey) &&
    record(value.header) && string(value.header.text) && optionalFiniteNumber(value.header.homographNumber) &&
    optionalString(value.header.displayPronunciation) && optionalString(value.header.pronunciation) &&
    optionalString(value.header.article) &&
    (value.header.partOfSpeech === undefined || semanticTerm(value.header.partOfSpeech)) &&
    (value.header.audio === undefined || (record(value.header.audio) && string(value.header.audio.audioId) &&
      value.header.audio.actionId === "play-audio" && string(value.header.audio.contentLanguageCode))) &&
    Number.isInteger(value.senseCount) && Number.isInteger(value.entryCount) &&
    arrayOf(value.indicators, (item): item is never => record(item) && string(item.indicatorId) &&
      string(item.value) && string(item.messageKey)) && arrayOf(value.entries, entry);
}

export function isPlatformLookupV2Response(value: unknown): value is PlatformLookupV2Response {
  return record(value) && value.contractVersion === "platform-lookup-v2" && string(value.query) &&
    record(value.request) && nullableString(value.request.contentLanguageCode) &&
    nullableString(value.request.translationTargetLanguageCode) && CARD_TYPES.has(String(value.request.cardTypeId)) &&
    INTENTS.has(String(value.request.intent)) && arrayOf(value.groups, group) && record(value.page) &&
    typeof value.page.selectedTierComplete === "boolean" && nullableString(value.page.nextGroupCursor);
}
