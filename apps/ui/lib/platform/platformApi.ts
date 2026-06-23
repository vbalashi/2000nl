import type { AuthenticatedSupabase, ServiceSupabase } from "./serverSupabase";
import type { ListCardPolicy, ReviewResult, TrainingMode } from "@/lib/types";
import crypto from "crypto";

const TRAINING_MODES = new Set<TrainingMode>([
  "word-to-definition",
  "definition-to-word",
  "listen-recognize",
  "listen-type",
]);
const REVIEW_RESULTS = new Set<ReviewResult>([
  "fail",
  "hard",
  "success",
  "easy",
  "freeze",
  "hide",
]);

export type PlatformAction =
  | "fetch-entry"
  | "record-view"
  | "review-card"
  | "mark-known"
  | "mark-unknown"
  | "start-learning"
  | "add-to-list"
  | "remove-from-list"
  | "copy-to-user-dictionary"
  | "create-user-entry"
  | "update-user-entry"
  | "delete-user-entry"
  | "create-user-list"
  | "update-user-list"
  | "delete-user-list";

export type PlatformActionBody = {
  action?: unknown;
  entryId?: unknown;
  cardTypeId?: unknown;
  result?: unknown;
  turnId?: unknown;
  clientEventId?: unknown;
  sourceContext?: unknown;
  listId?: unknown;
  targetDictionaryId?: unknown;
  dictionaryId?: unknown;
  entry?: unknown;
  overrides?: unknown;
  name?: unknown;
  description?: unknown;
  languageCode?: unknown;
  primaryLanguageCode?: unknown;
  defaultScenarioId?: unknown;
  cardPolicy?: unknown;
  cardTypeIds?: unknown;
};

type DictionaryLookupPayload = {
  id: string;
  dictionary_id?: string | null;
  language_code?: string | null;
  headword: string;
  meaning_id?: number | null;
  part_of_speech?: string | null;
  gender?: string | null;
  raw: unknown;
  is_nt2_2000?: boolean | null;
  meanings_count?: number | null;
  dictionary?: DictionaryMetadataRow | null;
  dictionary_name?: string | null;
  dictionary_slug?: string | null;
  dictionary_kind?: string | null;
  search_match_group?: string | null;
  search_matched_text?: string | null;
};

type TranslationCacheRow = {
  id?: string | null;
  word_entry_id: string;
  target_lang: string;
  provider: string;
  status: "pending" | "ready" | "failed";
  overlay: Record<string, unknown> | null;
  note?: string | null;
  source_fingerprint?: string | null;
  error_message?: string | null;
};

type LookupTranslationMetadata = {
  status: "ready" | "pending" | "failed" | "not_requested" | "not_available";
  targetLanguageCode?: string;
  translationId?: string;
  translationPolicyVersion?: string;
  error?: {
    code: string;
    message?: string;
  };
};

type DictionaryMetadataRow = {
  id: string;
  language_code: string;
  slug: string;
  name: string;
  kind: string;
  visibility: string;
  owner_user_id?: string | null;
  is_editable?: boolean | null;
  schema_key: string | null;
  schema_version: number | null;
};

type InternalListMembershipRow = {
  entry_id?: string | null;
  lists?: Array<{
    id?: string | null;
    kind?: string | null;
    name?: string | null;
    description?: string | null;
    primary_language_code?: string | null;
    default_scenario_id?: string | null;
    card_policy?: string | null;
    card_type_ids?: string[] | null;
    item_count?: number | null;
  }>;
};

type EntryListMembership = {
  entryId: string;
  lists: Array<{
    id: string | null;
    kind: string;
    name: string;
    description: string | null;
    primaryLanguageCode: string | null;
    defaultScenarioId: string | null;
    cardPolicy: string;
    cardTypeIds: string[] | null;
    itemCount: number;
  }>;
};

type PlatformUserCardStatePayload = {
  cardTypeId: TrainingMode;
  entryId: string;
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

export type PlatformOperationResult = {
  payload: unknown;
  status: number;
};

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asTrainingMode(value: unknown): TrainingMode | null {
  const mode = asString(value);
  return mode && TRAINING_MODES.has(mode as TrainingMode)
    ? (mode as TrainingMode)
    : null;
}

function asReviewResult(value: unknown): ReviewResult | null {
  const result = asString(value);
  return result && REVIEW_RESULTS.has(result as ReviewResult)
    ? (result as ReviewResult)
    : null;
}

function asClientEventId(value: unknown): string | null {
  const eventId = asString(value);
  return eventId && /^[A-Za-z0-9._:-]{1,128}$/.test(eventId) ? eventId : null;
}

function asUuid(value: unknown): string | null {
  const uuid = asString(value);
  return uuid &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)
    ? uuid
    : null;
}

type SourceContextParseResult =
  | { ok: true; value: Record<string, unknown> | null; version: "none" | "v1" | "v2" }
  | { ok: false; error: string; status: number };

function parseSourceContext(value: unknown): SourceContextParseResult {
  if (value === undefined || value === null) {
    return { ok: true, value: null, version: "none" };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "invalid_source_context", status: 400 };
  }

  const size = JSON.stringify(value).length;
  if (size > 16_384) {
    return { ok: false, error: "source_context_too_large", status: 413 };
  }

  const record = value as Record<string, unknown>;
  if (record.contractVersion !== "source-context-v2") {
    return { ok: true, value: record, version: "v1" };
  }

  const normalized = normalizeSourceContextV2(record);
  if (!normalized.ok) return normalized;
  return { ok: true, value: normalized.value, version: "v2" };
}

function normalizeSourceContextV2(
  record: Record<string, unknown>,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string; status: number } {
  const source = asRecord(record.source);
  const kind = asString(source.kind);
  if (kind !== "youtube_video") {
    return { ok: false, error: "unsupported_source_kind", status: 400 };
  }

  const provider = asString(source.provider);
  const externalId = asString(source.externalId);
  if (provider !== "youtube" || !externalId || !/^[A-Za-z0-9_-]{11}$/.test(externalId)) {
    return { ok: false, error: "invalid_youtube_source", status: 400 };
  }

  const languageCode = normalizeOptionalLanguageCode(source.languageCode);
  const artifact = normalizeV2Artifact(record.artifact);
  if (!artifact.ok) return artifact;
  const location = normalizeV2Location(record.location);
  if (!location.ok) return location;
  const selection = normalizeV2Selection(record.selection);
  if (!selection.ok) return selection;

  return {
    ok: true,
    value: stripUndefined({
      contractVersion: "source-context-v2",
      source: stripUndefined({
        kind: "youtube_video",
        provider: "youtube",
        externalId,
        url: `https://www.youtube.com/watch?v=${externalId}`,
        languageCode,
      }),
      artifact: artifact.value,
      location: location.value,
      selection: selection.value,
      context: selection.context,
    }),
  };
}

function normalizeV2Artifact(
  value: unknown,
): { ok: true; value?: Record<string, unknown> } | { ok: false; error: string; status: number } {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "invalid_source_artifact", status: 400 };
  }
  const artifact = value as Record<string, unknown>;
  const artifactKind = asString(artifact.artifactKind);
  if (artifactKind !== "caption_phrase_set") {
    return { ok: false, error: "unsupported_source_artifact", status: 400 };
  }
  const producer = boundedString(artifact.producer, 80);
  if (!producer) return { ok: false, error: "missing_artifact_producer", status: 400 };
  return {
    ok: true,
    value: stripUndefined({
      artifactKind,
      producer,
      snapshotRevisionId: boundedString(artifact.snapshotRevisionId, 160),
      textSourceId: boundedString(artifact.textSourceId, 160),
      textSourceRevisionId: boundedString(artifact.textSourceRevisionId, 160),
      textContentFingerprint: boundedString(artifact.textContentFingerprint, 160),
      timingEvidenceRevisionId: boundedString(artifact.timingEvidenceRevisionId, 160),
      phraseSetRevisionId: boundedString(artifact.phraseSetRevisionId, 160),
      builderVersion: boundedString(artifact.builderVersion, 80),
      languageCode: normalizeOptionalLanguageCode(artifact.languageCode),
      quality: boundedString(artifact.quality, 80),
    }),
  };
}

function normalizeV2Location(
  value: unknown,
): { ok: true; value?: Record<string, unknown> } | { ok: false; error: string; status: number } {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "invalid_source_location", status: 400 };
  }
  const location = value as Record<string, unknown>;
  const kind = asString(location.kind);
  if (kind !== "caption_phrase") {
    return { ok: false, error: "unsupported_source_location", status: 400 };
  }
  const startMs = optionalNonNegativeInt(location.startMs);
  const endMs = optionalNonNegativeInt(location.endMs);
  if (startMs === false || endMs === false) {
    return { ok: false, error: "invalid_source_timing", status: 400 };
  }
  if (typeof startMs === "number" && typeof endMs === "number" && endMs < startMs) {
    return { ok: false, error: "invalid_source_timing", status: 400 };
  }
  const phraseIndex = optionalNonNegativeInt(location.phraseIndex);
  if (phraseIndex === false) {
    return { ok: false, error: "invalid_phrase_index", status: 400 };
  }
  const locatorConfidence = asString(location.locatorConfidence);
  if (
    locatorConfidence &&
    !["canonical", "derived", "approximate"].includes(locatorConfidence)
  ) {
    return { ok: false, error: "invalid_locator_confidence", status: 400 };
  }
  return {
    ok: true,
    value: stripUndefined({
      kind,
      startMs: startMs ?? undefined,
      endMs: endMs ?? undefined,
      phraseIndex: phraseIndex ?? undefined,
      locatorConfidence,
      phraseTextHash: boundedString(location.phraseTextHash, 160),
      timingQuality: boundedString(location.timingQuality, 80),
    }),
  };
}

function normalizeV2Selection(
  value: unknown,
):
  | { ok: true; value?: Record<string, unknown>; context?: Record<string, unknown> }
  | { ok: false; error: string; status: number } {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "invalid_source_selection", status: 400 };
  }
  const selection = value as Record<string, unknown>;
  const clickedForm = boundedString(selection.clickedForm, 160);
  const tokenIndex = optionalNonNegativeInt(selection.tokenIndex);
  const charStart = optionalNonNegativeInt(selection.charStart);
  const charEnd = optionalNonNegativeInt(selection.charEnd);
  if (tokenIndex === false || charStart === false || charEnd === false) {
    return { ok: false, error: "invalid_source_selection", status: 400 };
  }
  if (typeof charStart === "number" && typeof charEnd === "number" && charEnd < charStart) {
    return { ok: false, error: "invalid_source_selection", status: 400 };
  }
  const contextText = boundedString(selection.contextText, 1000);
  return {
    ok: true,
    value: stripUndefined({
      clickedForm,
      tokenIndex: tokenIndex ?? undefined,
      charStart: charStart ?? undefined,
      charEnd: charEnd ?? undefined,
      contextTextHash: boundedString(selection.contextTextHash, 160),
    }),
    context:
      clickedForm || contextText
        ? stripUndefined({ clickedForm, text: contextText })
        : undefined,
  };
}

function boundedString(value: unknown, maxLength: number) {
  const text = asString(value);
  return text ? text.slice(0, maxLength) : undefined;
}

function normalizeOptionalLanguageCode(value: unknown) {
  const text = boundedString(value, 16);
  return text ? text.replace("_", "-").toLowerCase() : undefined;
}

function optionalNonNegativeInt(value: unknown): number | null | false {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 0) return false;
  return value as number;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null),
  ) as T;
}

function asListCardPolicy(value: unknown): ListCardPolicy | null {
  const policy = asString(value);
  return policy && ["inherit", "prefer", "restrict"].includes(policy)
    ? (policy as ListCardPolicy)
    : null;
}

function asOptionalStringArray(
  value: unknown,
): { ok: true; value: string[] | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (!Array.isArray(value)) return { ok: false };
  if (value.some((item) => !asString(item))) return { ok: false };
  const values = Array.from(
    new Set(
      value
        .map((item) => asString(item))
        .filter((item): item is string => Boolean(item)),
    ),
  );
  return { ok: true, value: values.length ? values : null };
}

function hasOwnBodyField(body: PlatformActionBody, field: keyof PlatformActionBody) {
  return Object.prototype.hasOwnProperty.call(body, field);
}

async function assertEntryReadable(
  supabase: any,
  entryId: string,
): Promise<true | { error: string; detail?: string }> {
  const { data: entry, error } = await supabase.rpc(
    "fetch_dictionary_entry_by_id_gated",
    {
      p_entry_id: entryId,
    },
  );

  if (error) {
    return { error: "entry_lookup_failed", detail: error.message ?? String(error) };
  }
  if (!entry) {
    return { error: "entry_not_accessible" };
  }

  return true;
}

function latestTimestamp(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}

function earliestTimestamp(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
}

function strengthScore(state: PlatformUserCardStatePayload) {
  return (
    state.fsrs.reps * 1000 +
    (state.fsrs.stability ?? 0) * 10 +
    state.successCount -
    state.fsrs.lapses * 100
  );
}

function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function contentFingerprint(content: unknown) {
  const record = asRecord(content);
  const {
    sourceMeta: _sourceMeta,
    translation: _translation,
    headwordTranslation: _headwordTranslation,
    summary: _summary,
    sections,
    ...restContent
  } = record;
  const fingerprintedSections = Array.isArray(sections)
    ? sections.map((section) => {
        const { translation: _sectionTranslation, ...restSection } = asRecord(section);
        return restSection;
      })
    : sections;
  const learnerVisibleContent = {
    ...restContent,
    ...(fingerprintedSections ? { sections: fingerprintedSections } : {}),
  };
  return crypto
    .createHash("sha256")
    .update(stableJson(learnerVisibleContent))
    .digest("hex");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string");
  return items.length ? items : undefined;
}

function normalizeLangForDb(lang: string) {
  return lang.trim().replace("_", "-").toLowerCase();
}

function normalizeTranslationProvider(value: string | undefined | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "deepl" || normalized === "openai" || normalized === "gemini"
    ? normalized
    : "openai";
}

function sectionId(kind: string, index: number, childIndex?: number) {
  return childIndex === undefined
    ? `${kind}-${index + 1}`
    : `${kind}-${index + 1}-${childIndex + 1}`;
}

function overlayTranslationAtSourcePath(
  overlay: Record<string, unknown> | null | undefined,
  sourcePath: string,
) {
  if (!overlay) return undefined;
  const meanings = Array.isArray(overlay.meanings) ? overlay.meanings : [];
  const match = sourcePath.match(
    /^raw\.meanings\[(\d+)\]\.(definition|context|examples\[(\d+)\]|idioms\[(\d+)\])$/,
  );
  if (!match) {
    if (sourcePath === "raw.definition") return asString(overlay.definition);
    return undefined;
  }

  const meaning = asRecord(meanings[Number(match[1])]);
  const field = match[2];
  if (field === "definition") return asString(meaning.definition);
  if (field === "context") return asString(meaning.context);
  if (field.startsWith("examples")) {
    const examples = Array.isArray(meaning.examples) ? meaning.examples : [];
    return asString(examples[Number(match[3])]);
  }
  if (field.startsWith("idioms")) {
    const idioms = Array.isArray(meaning.idioms) ? meaning.idioms : [];
    const idiom = idioms[Number(match[4])];
    if (typeof idiom === "string") return asString(idiom);
    const idiomRecord = asRecord(idiom);
    return asString(idiomRecord.expression) ?? asString(idiomRecord.explanation);
  }
  return undefined;
}

function buildContentSummary(
  sections: Array<{
    kind: "meaning" | "context" | "example" | "idiom" | "form" | "note";
    text: string;
    translation?: string;
  }>,
) {
  const definitionSection =
    sections.find((section) => section.kind === "meaning") ?? sections[0];
  const exampleSection = sections.find((section) => section.kind === "example");
  return {
    definition: definitionSection?.text ?? "",
    ...(definitionSection?.translation
      ? { definitionTranslation: definitionSection.translation }
      : {}),
    ...(exampleSection?.text ? { example: exampleSection.text } : {}),
    ...(exampleSection?.translation
      ? { exampleTranslation: exampleSection.translation }
      : {}),
  };
}

function translationText(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const parts = value.filter((item): item is string => typeof item === "string");
    return parts.length ? parts.join("; ") : undefined;
  }
  return undefined;
}

function buildContentSections(
  rawMeanings: unknown[],
  fallbackDefinition: string | null,
  translationOverlay?: Record<string, unknown> | null,
) {
  const sections: Array<{
    id: string;
    sourcePath: string;
    kind: "meaning" | "context" | "example" | "idiom" | "form" | "note";
    label?: string;
    text: string;
    translation?: string;
  }> = [];

  rawMeanings.forEach((meaning, meaningIndex) => {
    const item = asRecord(meaning);
    const definition =
      typeof item.definition === "string"
        ? item.definition
        : typeof item.text === "string"
          ? item.text
          : null;
    const translations = asRecord(item.translations);
    const firstTranslation = Object.values(translations)
      .map((value) => translationText(value))
      .find((value): value is string => Boolean(value));

    if (definition) {
      const sourcePath = `raw.meanings[${meaningIndex}].definition`;
      const overlayTranslation = overlayTranslationAtSourcePath(
        translationOverlay,
        sourcePath,
      );
      sections.push({
        id: sectionId("meaning", meaningIndex),
        sourcePath,
        kind: "meaning",
        text: definition,
        ...(overlayTranslation ?? firstTranslation
          ? { translation: overlayTranslation ?? firstTranslation }
          : {}),
      });
    }

    if (typeof item.context === "string") {
      const sourcePath = `raw.meanings[${meaningIndex}].context`;
      const overlayTranslation = overlayTranslationAtSourcePath(
        translationOverlay,
        sourcePath,
      );
      sections.push({
        id: sectionId("context", meaningIndex),
        sourcePath,
        kind: "context",
        text: item.context,
        ...(overlayTranslation ? { translation: overlayTranslation } : {}),
      });
    }

    const pushExampleSection = (example: string, exampleIndex: number) => {
      const sourcePath = `raw.meanings[${meaningIndex}].examples[${exampleIndex}]`;
      const overlayTranslation = overlayTranslationAtSourcePath(
        translationOverlay,
        sourcePath,
      );
      sections.push({
        id: sectionId("example", meaningIndex, exampleIndex),
        sourcePath,
        kind: "example",
        text: example,
        ...(overlayTranslation ? { translation: overlayTranslation } : {}),
      });
    };

    const pushIdiomSection = (idiom: unknown, idiomIndex: number) => {
      const idiomRecord = asRecord(idiom);
      const text =
        typeof idiom === "string"
          ? idiom
          : typeof idiomRecord.expression === "string"
            ? idiomRecord.expression
            : null;
      if (!text) return;
      const sourcePath = `raw.meanings[${meaningIndex}].idioms[${idiomIndex}]`;
      const overlayTranslation = overlayTranslationAtSourcePath(
        translationOverlay,
        sourcePath,
      );
      sections.push({
        id: sectionId("idiom", meaningIndex, idiomIndex),
        sourcePath,
        kind: "idiom",
        text,
        ...(overlayTranslation ? { translation: overlayTranslation } : {}),
        ...(typeof idiomRecord.explanation === "string"
          ? { label: idiomRecord.explanation }
          : {}),
      });
    };

    const examples = asStringArray(item.examples) ?? [];
    const idioms = Array.isArray(item.idioms) ? item.idioms : [];
    if (idioms.length) {
      if (examples[0]) pushExampleSection(examples[0], 0);
      const detailCount = Math.max(
        idioms.length,
        Math.max(0, examples.length - 1),
      );
      for (let detailIndex = 0; detailIndex < detailCount; detailIndex += 1) {
        if (detailIndex < idioms.length) {
          pushIdiomSection(idioms[detailIndex], detailIndex);
        }
        const pairedExample = examples[detailIndex + 1];
        if (pairedExample) {
          pushExampleSection(pairedExample, detailIndex + 1);
        }
      }
    } else {
      examples.forEach(pushExampleSection);
    }
  });

  if (sections.length === 0 && fallbackDefinition) {
    const overlayTranslation = overlayTranslationAtSourcePath(
      translationOverlay,
      "raw.definition",
    );
    sections.push({
      id: "meaning-1",
      sourcePath: "raw.definition",
      kind: "meaning",
      text: fallbackDefinition,
      ...(overlayTranslation ? { translation: overlayTranslation } : {}),
    });
  }

  return sections;
}

function normalizeDictionaryContent(
  entry: DictionaryLookupPayload,
  translation?: {
    metadata: LookupTranslationMetadata;
    overlay?: Record<string, unknown> | null;
  } | null,
) {
  const raw = asRecord(entry.raw);
  const rawMeanings = Array.isArray(raw.meanings) ? raw.meanings : [];
  const translationOverlay =
    translation?.metadata.status === "ready" ? translation.overlay ?? null : null;
  const fallbackDefinition =
    typeof raw.definition === "string"
      ? raw.definition
      : typeof raw.notes === "string"
        ? raw.notes
        : null;
  const meanings =
    rawMeanings.length > 0
      ? rawMeanings.map((meaning) => {
          const item = asRecord(meaning);
          return {
            definition:
              typeof item.definition === "string"
                ? item.definition
                : typeof item.text === "string"
                  ? item.text
                  : null,
            context: typeof item.context === "string" ? item.context : null,
            examples: asStringArray(item.examples),
            translations: asRecord(item.translations),
            idioms: Array.isArray(item.idioms) ? item.idioms : undefined,
          };
        })
      : [
          {
            definition: fallbackDefinition,
            translations:
              raw.translation && typeof raw.translation === "object"
                ? {
                    [String((raw.translation as any).languageCode ?? "unknown")]:
                      String((raw.translation as any).text ?? ""),
                  }
                : {},
          },
        ];

  const content = {
    headword: typeof raw.headword === "string" ? raw.headword : entry.headword,
    languageCode:
      typeof raw.languageCode === "string"
        ? raw.languageCode
        : typeof raw.language_code === "string"
          ? raw.language_code
          : entry.language_code ?? null,
    meaningId:
      typeof raw.meaning_id === "number"
        ? raw.meaning_id
        : typeof raw.meaningId === "number"
          ? raw.meaningId
          : entry.meaning_id ?? null,
    partOfSpeech:
      typeof raw.part_of_speech === "string"
        ? raw.part_of_speech
        : typeof raw.partOfSpeech === "string"
          ? raw.partOfSpeech
          : entry.part_of_speech ?? null,
    gender: typeof raw.gender === "string" ? raw.gender : entry.gender ?? null,
    meanings,
    audioLinks:
      raw.audio_links && typeof raw.audio_links === "object"
        ? (raw.audio_links as Record<string, string | null>)
        : undefined,
    images: asStringArray(raw.images),
    morphology:
      raw.morphology && typeof raw.morphology === "object"
        ? (raw.morphology as Record<string, unknown>)
        : undefined,
    headwordTranslation: asString(translationOverlay?.headword) ?? undefined,
    sections: buildContentSections(
      rawMeanings,
      fallbackDefinition,
      translationOverlay,
    ),
    translation: translation?.metadata,
    sourceMeta: asRecord(raw._metadata ?? raw.sourceMeta),
  };

  return {
    ...content,
    summary: buildContentSummary(content.sections),
  };
}

function buildProgressSummary(
  statesByCardType: Record<string, PlatformUserCardStatePayload>,
) {
  const states = Object.values(statesByCardType);
  if (states.length === 0) {
    return {
      status: "new",
      trackedCardCount: 0,
      reviewedCardCount: 0,
      learningCardCount: 0,
      hiddenCardCount: 0,
      strongestCardTypeId: null,
      weakestCardTypeId: null,
      lastReviewedAt: null,
      nextReviewAt: null,
    };
  }

  const reviewed = states.filter((state) => state.fsrs.reps > 0);
  const learning = states.filter((state) => state.inLearning);
  const hidden = states.filter((state) => state.hidden);
  const scored = [...states].sort((a, b) => strengthScore(a) - strengthScore(b));
  const status =
    hidden.length === states.length
      ? "hidden"
      : learning.length > 0
        ? "learning"
        : reviewed.length === states.length
          ? "reviewing"
          : reviewed.length > 0
            ? "mixed"
            : "seen";

  return {
    status,
    trackedCardCount: states.length,
    reviewedCardCount: reviewed.length,
    learningCardCount: learning.length,
    hiddenCardCount: hidden.length,
    weakestCardTypeId: scored[0]?.cardTypeId ?? null,
    strongestCardTypeId: scored[scored.length - 1]?.cardTypeId ?? null,
    lastReviewedAt: latestTimestamp(states.map((state) => state.lastReviewedAt)),
    nextReviewAt: earliestTimestamp(states.map((state) => state.nextReviewAt)),
  };
}

function buildCardCapability(
  state: PlatformUserCardStatePayload | undefined,
) {
  const now = Date.now();
  const frozenUntilMs = state?.frozenUntil ? Date.parse(state.frozenUntil) : NaN;
  const phase =
    state?.hidden
      ? "hidden"
      : Number.isFinite(frozenUntilMs) && frozenUntilMs > now
        ? "frozen"
        : state?.inLearning
          ? "learning"
          : (state?.fsrs.reps ?? 0) > 0
            ? "reviewing"
            : (state?.seenCount ?? 0) > 0 || (state?.clickCount ?? 0) > 0
              ? "encountered"
              : "not-started";
  const actions: PlatformAction[] =
    phase === "not-started" || phase === "encountered"
      ? ["start-learning", "mark-known"]
      : phase === "learning" || phase === "reviewing"
        ? ["review-card"]
        : [];

  return {
    phase,
    actions,
    ...(actions.includes("review-card")
      ? { reviewResults: ["fail", "hard", "success", "easy"] as const }
      : {}),
    frozenUntil: state?.frozenUntil ?? null,
  };
}

function lookupMatchRelation(entry: DictionaryLookupPayload, query: string) {
  const group = entry.search_match_group;
  if (group === "exact-headword") return "exact";
  if (group === "lemma-or-inflection") return "inflection";
  if (entry.headword.trim().toLocaleLowerCase() === query.trim().toLocaleLowerCase()) {
    return "exact";
  }
  return "unknown";
}

function lookupMatchedForm(entry: DictionaryLookupPayload, query: string) {
  if (entry.search_matched_text) return entry.search_matched_text;
  if (entry.search_match_group === "lemma-or-inflection") return query;
  if (lookupMatchRelation(entry, query) === "exact") return entry.headword;
  return undefined;
}

function dictionarySummaryFromLookupPayload(entry: DictionaryLookupPayload) {
  const dictionary = entry.dictionary ?? null;
  if (dictionary) {
    return {
      id: dictionary.id,
      languageCode: dictionary.language_code,
      slug: dictionary.slug,
      name: dictionary.name,
      kind: dictionary.kind,
      visibility: dictionary.visibility,
      schemaKey: dictionary.schema_key,
      schemaVersion: dictionary.schema_version,
      isEditable: dictionary.is_editable ?? null,
    };
  }

  if (!entry.dictionary_id) return null;
  return {
    id: entry.dictionary_id,
    languageCode: entry.language_code ?? null,
    slug: entry.dictionary_slug ?? "",
    name: entry.dictionary_name ?? "",
    kind: entry.dictionary_kind ?? "curated",
    visibility: "system",
    schemaKey: null,
    schemaVersion: null,
    isEditable: null,
  };
}

function dictionaryCanBeEditedByUser(
  entry: DictionaryLookupPayload,
  userId: string,
) {
  const dictionary = entry.dictionary ?? null;
  return (
    dictionary?.kind === "user" &&
    dictionary.is_editable === true &&
    dictionary.owner_user_id === userId
  );
}

async function resolveLookupTranslationContext(
  auth: AuthenticatedSupabase,
  service: ServiceSupabase,
  entryIds: string[],
): Promise<
  | {
      ok: true;
      targetLanguageCode: string | null;
      artifactsByEntryId: Map<
        string,
        { metadata: LookupTranslationMetadata; overlay?: Record<string, unknown> | null }
      >;
    }
  | { ok: false; payload: unknown; status: number }
> {
  const { data: settings, error: settingsError } = await auth.supabase
    .from("user_settings")
    .select("translation_lang")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (settingsError) {
    return {
      ok: false,
      payload: {
        error: "translation_preference_failed",
        detail: settingsError.message ?? String(settingsError),
      },
      status: 500,
    };
  }

  const targetLanguageCode = settings?.translation_lang ?? "en";
  if (targetLanguageCode === "off") {
    return {
      ok: true,
      targetLanguageCode: null,
      artifactsByEntryId: new Map(
        entryIds.map((entryId) => [
          entryId,
          { metadata: { status: "not_available" as const } },
        ]),
      ),
    };
  }

  const provider = normalizeTranslationProvider(process.env.TRANSLATION_PROVIDER);
  const dbLang = normalizeLangForDb(targetLanguageCode);
  const { data: rows, error: translationError } = await service.supabase
    .from("word_entry_translations")
    .select(
      "id,word_entry_id,target_lang,provider,status,overlay,note,source_fingerprint,error_message",
    )
    .in("word_entry_id", entryIds)
    .eq("target_lang", dbLang)
    .eq("provider", provider);

  if (translationError) {
    return {
      ok: false,
      payload: {
        error: "translation_cache_failed",
        detail: translationError.message ?? String(translationError),
      },
      status: 500,
    };
  }

  const rowsByEntryId = new Map<string, TranslationCacheRow>();
  for (const row of Array.isArray(rows) ? (rows as TranslationCacheRow[]) : []) {
    if (row?.word_entry_id) rowsByEntryId.set(row.word_entry_id, row);
  }

  const artifactsByEntryId = new Map<
    string,
    { metadata: LookupTranslationMetadata; overlay?: Record<string, unknown> | null }
  >();
  for (const entryId of entryIds) {
    const row = rowsByEntryId.get(entryId);
    if (!row) {
      artifactsByEntryId.set(entryId, {
        metadata: {
          status: "not_available",
          targetLanguageCode,
        },
      });
      continue;
    }

    const translationId = asString(row.id ?? undefined) ?? undefined;
    const base = {
      targetLanguageCode,
      ...(translationId ? { translationId } : {}),
      ...(row.source_fingerprint
        ? { translationPolicyVersion: row.source_fingerprint }
        : {}),
    };
    if (row.status === "ready" && row.overlay) {
      artifactsByEntryId.set(entryId, {
        metadata: {
          status: "ready",
          ...base,
        },
        overlay: row.overlay,
      });
      continue;
    }
    if (row.status === "pending") {
      artifactsByEntryId.set(entryId, {
        metadata: {
          status: "pending",
          ...base,
        },
      });
      continue;
    }
    artifactsByEntryId.set(entryId, {
      metadata: {
        status: "failed",
        ...base,
        error: {
          code: "translation_failed",
          ...(row.error_message ? { message: row.error_message } : {}),
        },
      },
    });
  }

  return { ok: true, targetLanguageCode, artifactsByEntryId };
}

async function recordReview(auth: AuthenticatedSupabase, params: {
  entryId: string;
  mode: TrainingMode;
  result: ReviewResult;
  turnId?: string | null;
}) {
  return auth.supabase.rpc("handle_card_review", {
    p_user_id: auth.user.id,
    p_entry_id: params.entryId,
    p_card_type_id: params.mode,
    p_result: params.result,
    p_turn_id: params.turnId ?? null,
  });
}

async function performProvenanceAwareCardAction(auth: AuthenticatedSupabase, params: {
  entryId: string;
  mode: TrainingMode;
  action: "record-view" | "start-learning" | "mark-known" | "mark-unknown" | "review-card";
  result?: ReviewResult | null;
  turnId?: string | null;
  clientEventId: string;
  sourceContext?: Record<string, unknown> | null;
}) {
  return auth.supabase.rpc("perform_platform_card_action", {
    p_user_id: auth.user.id,
    p_entry_id: params.entryId,
    p_card_type_id: params.mode,
    p_action: params.action,
    p_result: params.result ?? null,
    p_turn_id: params.turnId ?? null,
    p_client_event_id: params.clientEventId,
    p_source_context: params.sourceContext ?? null,
    p_auth_kind: auth.principal.authKind,
    p_connected_client_id: auth.principal.connectedClientId,
  });
}

function sourceContextClientId(sourceContext: Record<string, unknown> | null) {
  const client = asRecord(sourceContext?.client);
  return asString(client.id);
}

function mapUserEntryRpcError(
  fallbackError: string,
  error: { message?: string } | unknown,
): PlatformOperationResult {
  const detail =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: string }).message ?? error)
      : String(error);

  if (detail.includes("entry_not_found")) {
    return { payload: { error: "entry_not_found" }, status: 404 };
  }
  if (detail.includes("target_dictionary_not_editable")) {
    return { payload: { error: "target_dictionary_not_editable" }, status: 403 };
  }
  if (detail.includes("duplicate_user_entry")) {
    return { payload: { error: "duplicate_user_entry", detail }, status: 409 };
  }
  if (
    detail.includes("invalid_user_entry") ||
    detail.includes("language_not_found") ||
    detail.includes("language_mismatch")
  ) {
    return { payload: { error: "invalid_user_entry", detail }, status: 400 };
  }

  return { payload: { error: fallbackError, detail }, status: 500 };
}

function mapUserListRpcPayload(row: any) {
  if (!row || typeof row !== "object") return null;
  const count = Array.isArray(row.user_word_list_items)
    ? row.user_word_list_items[0]?.count
    : undefined;

  return {
    id: row.id,
    kind: "user",
    name: row.name,
    description: row.description ?? null,
    primaryLanguageCode: row.primary_language_code ?? row.language_code ?? null,
    defaultScenarioId: row.default_scenario_id ?? null,
    cardPolicy: row.card_policy ?? "inherit",
    cardTypeIds: row.card_type_ids ?? null,
    itemCount: typeof count === "number" ? count : 0,
  };
}

function mapListMembershipRpcRows(rows: unknown): EntryListMembership[] {
  if (!Array.isArray(rows)) return [];

  return (rows as InternalListMembershipRow[])
    .filter((row) => Boolean(row?.entry_id) && Array.isArray(row.lists))
    .map((row) => ({
      entryId: row.entry_id as string,
      lists: (row.lists ?? []).map((list) => ({
        id: list.id ?? null,
        kind: list.kind ?? "user",
        name: list.name ?? "",
        description: list.description ?? null,
        primaryLanguageCode: list.primary_language_code ?? null,
        defaultScenarioId: list.default_scenario_id ?? null,
        cardPolicy: list.card_policy ?? "inherit",
        cardTypeIds: list.card_type_ids ?? null,
        itemCount: list.item_count ?? 0,
      })),
    }));
}

export async function performPlatformLookup(
  auth: AuthenticatedSupabase,
  params: {
    query: string;
    includeUserState: boolean;
    includeTranslations?: boolean;
    languageCode?: string | null;
    contextText?: string | null;
    intent?: string | null;
    service?: ServiceSupabase | null;
  },
): Promise<PlatformOperationResult> {
  const {
    query,
    includeUserState,
    includeTranslations = false,
    languageCode = null,
    contextText = null,
  } = params;
  const intent =
    params.intent === "dictionary-lookup" ||
    params.intent === "training-review" ||
    params.intent === "external-click"
      ? params.intent
      : null;
  if (!query) {
    return { payload: { error: "missing_query" }, status: 400 };
  }

  const requestMetadata = {
    languageCode,
    contextText,
    intent,
  };

  const usesSearchSemantics =
    intent === "external-click" || Boolean(languageCode) || Boolean(contextText);
  const { data, error } = usesSearchSemantics
    ? await auth.supabase.rpc("search_word_entries_gated", {
        p_query: query,
        p_part_of_speech: null,
        p_is_nt2: null,
        p_filter_frozen: null,
        p_filter_hidden: null,
        p_page: 1,
        p_page_size: 10,
        p_language_code: languageCode,
        p_dictionary_ids: null,
      })
    : await auth.supabase.rpc("fetch_dictionary_entry_gated", {
        p_headword: query,
      });

  if (error) {
    return {
      payload: { error: "lookup_failed", detail: error.message ?? String(error) },
      status: 500,
    };
  }

  const rawEntries = usesSearchSemantics
    ? asRecord(data).items
    : data;
  const entries = Array.isArray(rawEntries)
    ? (rawEntries as DictionaryLookupPayload[])
    : rawEntries
      ? [rawEntries as DictionaryLookupPayload]
      : [];

  if (entries.length === 0) {
    return {
      payload: {
        query,
        request: requestMetadata,
        items: [],
      },
      status: 200,
    };
  }

  const userStateByEntryId = new Map<string, Record<string, PlatformUserCardStatePayload>>();
  const listMembershipsByEntryId = new Map<string, unknown[]>();
  if (includeUserState) {
    const { data: membershipRows, error: membershipError } = await auth.supabase.rpc(
      "get_user_list_memberships_for_entries",
      {
        p_user_id: auth.user.id,
        p_entry_ids: entries.map((entry) => entry.id),
      },
    );

    if (membershipError) {
      return {
        payload: {
          error: "list_memberships_failed",
          detail: membershipError.message ?? String(membershipError),
        },
        status: 500,
      };
    }

    for (const membership of mapListMembershipRpcRows(membershipRows)) {
      listMembershipsByEntryId.set(membership.entryId, membership.lists);
    }

    const { data: stateRows, error: stateError } = await auth.supabase.rpc(
      "get_user_card_states_for_entries",
      {
        p_user_id: auth.user.id,
        p_entry_ids: entries.map((entry) => entry.id),
        p_card_type_ids: Array.from(TRAINING_MODES),
      },
    );

    if (stateError) {
      return {
        payload: {
          error: "user_state_failed",
          detail: stateError.message ?? String(stateError),
        },
        status: 500,
      };
    }

    for (const row of Array.isArray(stateRows) ? stateRows : []) {
      const entryId = asString(row?.entry_id);
      const mode = asTrainingMode(row?.card_type_id);
      if (!entryId || !mode) continue;

      const states = userStateByEntryId.get(entryId) ?? {};
      states[mode] = {
        cardTypeId: mode,
        entryId,
        clickCount: row.click_count ?? 0,
        seenCount: row.seen_count ?? 0,
        successCount: row.success_count ?? 0,
        lastSeenAt: row.last_seen_at ?? null,
        lastReviewedAt: row.last_reviewed_at ?? null,
        nextReviewAt: row.next_review_at ?? null,
        hidden: row.hidden ?? false,
        frozenUntil: row.frozen_until ?? null,
        inLearning: row.in_learning ?? false,
        learningDueAt: row.learning_due_at ?? null,
        fsrs: {
          stability: row.fsrs_stability ?? null,
          difficulty: row.fsrs_difficulty ?? null,
          reps: row.fsrs_reps ?? 0,
          lapses: row.fsrs_lapses ?? 0,
          lastGrade: row.fsrs_last_grade ?? null,
          lastInterval: row.fsrs_last_interval ?? null,
          paramsVersion: row.fsrs_params_version ?? null,
        },
      };
      userStateByEntryId.set(entryId, states);
    }
  }

  const translationArtifactsByEntryId = new Map<
    string,
    { metadata: LookupTranslationMetadata; overlay?: Record<string, unknown> | null }
  >();
  if (includeTranslations) {
    if (!params.service) {
      return {
        payload: { error: "translation_cache_not_configured" },
        status: 500,
      };
    }
    const resolvedTranslations = await resolveLookupTranslationContext(
      auth,
      params.service,
      entries.map((entry) => entry.id),
    );
    if (!resolvedTranslations.ok) {
      return {
        payload: resolvedTranslations.payload,
        status: resolvedTranslations.status,
      };
    }
    for (const [entryId, artifact] of resolvedTranslations.artifactsByEntryId) {
      translationArtifactsByEntryId.set(entryId, artifact);
    }
  }

  const items = entries.map((entry) => {
    const availableActions: PlatformAction[] = [
      "record-view",
      "start-learning",
      "mark-known",
      "mark-unknown",
      "review-card",
      "add-to-list",
      "remove-from-list",
      "copy-to-user-dictionary",
      "create-user-entry",
    ];
    if (dictionaryCanBeEditedByUser(entry, auth.user.id)) {
      availableActions.push("update-user-entry", "delete-user-entry");
    }
    const statesByCardType = userStateByEntryId.get(entry.id) ?? {};
    const translation = includeTranslations
      ? translationArtifactsByEntryId.get(entry.id) ?? {
          metadata: { status: "not_available" as const },
        }
      : null;
    const content = normalizeDictionaryContent(entry, translation);
    const matchedForm = lookupMatchedForm(entry, query);

    return {
      entry: {
        id: entry.id,
        dictionaryId: entry.dictionary_id ?? null,
        languageCode: entry.language_code ?? null,
        headword: entry.headword,
        meaningId: entry.meaning_id ?? null,
        partOfSpeech: entry.part_of_speech ?? null,
        gender: entry.gender ?? null,
        content,
        contentFingerprint: contentFingerprint(content),
        raw: entry.raw,
        isNt22000: entry.is_nt2_2000 ?? null,
        meaningsCount: entry.meanings_count ?? null,
      },
      dictionary: dictionarySummaryFromLookupPayload(entry),
      ...(includeUserState
        ? {
            userStateByCardType: statesByCardType,
            progressSummary: buildProgressSummary(statesByCardType),
            cardCapabilitiesByType: {
              "word-to-definition": buildCardCapability(
                statesByCardType["word-to-definition"],
              ),
            },
            listMemberships: listMembershipsByEntryId.get(entry.id) ?? [],
          }
        : {}),
      ...(translation ? { translation: translation.metadata } : {}),
      match: {
        queriedForm: query,
        ...(matchedForm ? { matchedForm } : {}),
        relation: lookupMatchRelation(entry, query),
      },
      availableActions,
    };
  });

  return {
    payload: {
      query,
      request: requestMetadata,
      items,
    },
    status: 200,
  };
}

export async function performPlatformCatalogLookup(
  service: ServiceSupabase,
  params: {
    query: string;
    languageCode?: string | null;
    contextText?: string | null;
    includeTranslations?: boolean;
    intent?: string | null;
  },
): Promise<PlatformOperationResult> {
  const {
    query,
    languageCode = null,
    contextText = null,
    includeTranslations = false,
  } = params;
  const intent =
    params.intent === "dictionary-lookup" ||
    params.intent === "training-review" ||
    params.intent === "external-click"
      ? params.intent
      : null;
  if (!query) {
    return { payload: { error: "missing_query" }, status: 400 };
  }

  const requestMetadata = {
    languageCode,
    contextText,
    intent,
  };

  const { data, error } = await service.supabase.rpc(
    "search_public_catalog_entries",
    {
      p_query: query,
      p_language_code: languageCode,
      p_page: 1,
      p_page_size: 10,
    },
  );

  if (error) {
    return {
      payload: {
        error: "catalog_lookup_failed",
        detail: error.message ?? String(error),
      },
      status: 500,
    };
  }

  const rawEntries = asRecord(data).items;
  const entries = Array.isArray(rawEntries)
    ? (rawEntries as unknown as DictionaryLookupPayload[])
    : Array.isArray(data)
    ? (data as unknown as DictionaryLookupPayload[])
    : rawEntries
      ? [rawEntries as unknown as DictionaryLookupPayload]
      : data
      ? [data as unknown as DictionaryLookupPayload]
      : [];

  return {
    payload: {
      query,
      request: requestMetadata,
      items: entries.flatMap((entry) => {
        const dictionary = Array.isArray(entry.dictionary)
          ? entry.dictionary[0] ?? null
          : entry.dictionary ?? null;
        if (
          dictionary &&
          dictionary.visibility !== "system" &&
          dictionary.visibility !== "public"
        ) {
          return [];
        }
        const translation = includeTranslations
          ? { metadata: { status: "not_available" as const } }
          : null;
        const content = normalizeDictionaryContent(entry, translation);
        const matchedForm = lookupMatchedForm(entry, query);

        return [{
          entry: {
            id: entry.id,
            dictionaryId: entry.dictionary_id ?? null,
            languageCode: entry.language_code ?? null,
            headword: entry.headword,
            meaningId: entry.meaning_id ?? null,
            partOfSpeech: entry.part_of_speech ?? null,
            gender: entry.gender ?? null,
            content,
            contentFingerprint: contentFingerprint(content),
            raw: entry.raw,
            isNt22000: entry.is_nt2_2000 ?? null,
            meaningsCount: entry.meanings_count ?? null,
          },
          dictionary: dictionary
            ? {
                id: dictionary.id,
                languageCode: dictionary.language_code,
                slug: dictionary.slug,
                name: dictionary.name,
                kind: dictionary.kind,
                visibility: dictionary.visibility,
                schemaKey: dictionary.schema_key,
                schemaVersion: dictionary.schema_version,
                isEditable: dictionary.is_editable ?? null,
              }
            : null,
          ...(translation ? { translation: translation.metadata } : {}),
          match: {
            queriedForm: query,
            ...(matchedForm ? { matchedForm } : {}),
            relation: lookupMatchRelation(entry, query),
          },
        }];
      }),
    },
    status: 200,
  };
}

export async function performPlatformAction(
  auth: AuthenticatedSupabase,
  body: PlatformActionBody | null,
): Promise<PlatformOperationResult> {
  const action = asString(body?.action) as PlatformAction | null;
  const entryId = asString(body?.entryId);
  const clientEventId = asClientEventId(body?.clientEventId);
  const parsedSourceContext = parseSourceContext(body?.sourceContext);
  const sourceContext = parsedSourceContext.ok ? parsedSourceContext.value : null;
  const sourceContextVersion = parsedSourceContext.ok ? parsedSourceContext.version : "none";

  if (!action) {
    return { payload: { error: "missing_action" }, status: 400 };
  }
  if (
    ![
      "fetch-entry",
      "record-view",
      "review-card",
      "mark-known",
      "mark-unknown",
      "start-learning",
      "add-to-list",
      "remove-from-list",
      "copy-to-user-dictionary",
      "create-user-entry",
      "update-user-entry",
      "delete-user-entry",
      "create-user-list",
      "update-user-list",
      "delete-user-list",
    ].includes(action)
  ) {
    return { payload: { error: "unsupported_action" }, status: 400 };
  }
  if (body?.clientEventId !== undefined && !clientEventId) {
    return { payload: { error: "invalid_client_event_id" }, status: 400 };
  }
  if (!parsedSourceContext.ok) {
    return {
      payload: { error: parsedSourceContext.error },
      status: parsedSourceContext.status,
    };
  }
  if (sourceContext && !clientEventId) {
    return { payload: { error: "missing_client_event_id" }, status: 400 };
  }
  if (
    sourceContextVersion === "v2" &&
    (action === "review-card" || action === "mark-known" || action === "mark-unknown")
  ) {
    const eventUuid = asUuid(clientEventId);
    const explicitTurnUuid = body?.turnId === undefined ? null : asUuid(body.turnId);
    if (!eventUuid) {
      return { payload: { error: "v2_client_event_id_must_be_uuid" }, status: 400 };
    }
    if (body?.turnId !== undefined && explicitTurnUuid !== eventUuid) {
      return { payload: { error: "v2_turn_id_mismatch" }, status: 400 };
    }
  }
  if (auth.principal.authKind === "connected_client") {
    const reportedClientId = sourceContextClientId(sourceContext);
    if (
      reportedClientId &&
      reportedClientId !== auth.principal.connectedClientId
    ) {
      return {
        payload: {
          error: "client_identity_mismatch",
          detail: "sourceContext.client.id must match the authenticated Connected Client.",
        },
        status: 403,
      };
    }
  }

  if (action === "fetch-entry") {
    if (!entryId) {
      return { payload: { error: "missing_entry_id" }, status: 400 };
    }

    const { data, error } = await auth.supabase.rpc(
      "fetch_dictionary_entry_by_id_gated",
      {
        p_entry_id: entryId,
      },
    );

    if (error) {
      return {
        payload: {
          error: "entry_lookup_failed",
          detail: error.message ?? String(error),
        },
        status: 500,
      };
    }
    if (!data) {
      return { payload: { error: "entry_not_accessible" }, status: 404 };
    }

    return {
      payload: {
        ok: true,
        action,
        entryId,
        entry: data,
      },
      status: 200,
    };
  }

  if (action === "create-user-list") {
    const name = asString(body?.name);
    if (!name) {
      return { payload: { error: "missing_list_name" }, status: 400 };
    }

    const languageCode = asString(body?.languageCode) ?? "nl";
    if (body?.cardPolicy !== undefined && !asListCardPolicy(body.cardPolicy)) {
      return { payload: { error: "invalid_user_list" }, status: 400 };
    }
    const cardTypeIds = asOptionalStringArray(body?.cardTypeIds);
    if (!cardTypeIds.ok) {
      return { payload: { error: "invalid_user_list" }, status: 400 };
    }
    const cardPolicy = asListCardPolicy(body?.cardPolicy) ?? "inherit";
    const { data, error } = await auth.supabase.rpc("create_user_word_list", {
      p_user_id: auth.user.id,
      p_name: name,
      p_description: asString(body?.description),
      p_language_code: languageCode,
      p_primary_language_code: asString(body?.primaryLanguageCode) ?? languageCode,
      p_default_scenario_id: asString(body?.defaultScenarioId),
      p_card_policy: cardPolicy,
      p_card_type_ids: cardTypeIds.value,
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("duplicate_user_list")) {
        return { payload: { error: "duplicate_user_list", detail }, status: 409 };
      }
      if (
        detail.includes("invalid_list_name") ||
        detail.includes("language_not_found") ||
        detail.includes("invalid_card_policy") ||
        detail.includes("scenario_not_found") ||
        detail.includes("invalid_card_type_ids")
      ) {
        return { payload: { error: "invalid_user_list", detail }, status: 400 };
      }
      return { payload: { error: "create_user_list_failed", detail }, status: 500 };
    }

    return {
      payload: {
        ok: true,
        action,
        listId: data?.id ?? null,
        list: mapUserListRpcPayload(data),
      },
      status: 200,
    };
  }

  if (action === "delete-user-list") {
    const listId = asString(body?.listId);
    if (!listId) {
      return { payload: { error: "missing_list_id" }, status: 400 };
    }

    const { error } = await auth.supabase.rpc("delete_user_word_list", {
      p_user_id: auth.user.id,
      p_list_id: listId,
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("list_not_found")) {
        return { payload: { error: "list_not_found" }, status: 404 };
      }
      return { payload: { error: "delete_user_list_failed", detail }, status: 500 };
    }

    return { payload: { ok: true, action, listId }, status: 200 };
  }

  if (action === "update-user-list") {
    const listId = asString(body?.listId);
    if (!listId) {
      return { payload: { error: "missing_list_id" }, status: 400 };
    }

    const languageCode = asString(body?.languageCode);
    if (body?.cardPolicy !== undefined && !asListCardPolicy(body.cardPolicy)) {
      return { payload: { error: "invalid_user_list" }, status: 400 };
    }
    const cardTypeIds = asOptionalStringArray(body?.cardTypeIds);
    if (!cardTypeIds.ok) {
      return { payload: { error: "invalid_user_list" }, status: 400 };
    }
    const cardPolicy = asListCardPolicy(body?.cardPolicy);
    const { data, error } = await auth.supabase.rpc("update_user_word_list", {
      p_user_id: auth.user.id,
      p_list_id: listId,
      p_name: asString(body?.name),
      p_description:
        typeof body?.description === "string" ? body.description : null,
      p_language_code: languageCode,
      p_primary_language_code:
        asString(body?.primaryLanguageCode) ?? languageCode,
      p_default_scenario_id: asString(body?.defaultScenarioId),
      p_card_policy: cardPolicy,
      p_card_type_ids: cardTypeIds.value,
      p_clear_default_scenario:
        hasOwnBodyField(body ?? {}, "defaultScenarioId") &&
        body?.defaultScenarioId === null,
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("list_not_found")) {
        return { payload: { error: "list_not_found" }, status: 404 };
      }
      if (detail.includes("duplicate_user_list")) {
        return { payload: { error: "duplicate_user_list", detail }, status: 409 };
      }
      if (
        detail.includes("invalid_list_name") ||
        detail.includes("language_not_found") ||
        detail.includes("invalid_card_policy") ||
        detail.includes("scenario_not_found") ||
        detail.includes("invalid_card_type_ids")
      ) {
        return { payload: { error: "invalid_user_list", detail }, status: 400 };
      }
      return { payload: { error: "update_user_list_failed", detail }, status: 500 };
    }

    return {
      payload: {
        ok: true,
        action,
        listId,
        list: mapUserListRpcPayload(data),
      },
      status: 200,
    };
  }

  if (action === "create-user-entry") {
    const dictionaryId = asString(body?.dictionaryId);
    const entry =
      body?.entry && typeof body.entry === "object" && !Array.isArray(body.entry)
        ? body.entry
        : null;
    if (!entry) {
      return { payload: { error: "missing_entry_payload" }, status: 400 };
    }

    const { data, error } = await auth.supabase.rpc("create_user_dictionary_entry", {
      p_user_id: auth.user.id,
      p_dictionary_id: dictionaryId,
      p_entry: entry,
    });

    if (error) {
      return mapUserEntryRpcError("create_user_entry_failed", error);
    }

    return {
      payload: {
        ok: true,
        action,
        entryId: data,
        dictionaryId: dictionaryId ?? null,
      },
      status: 200,
    };
  }

  if (!entryId) {
    return { payload: { error: "missing_entry_id" }, status: 400 };
  }

  if (action === "update-user-entry") {
    const entry =
      body?.entry && typeof body.entry === "object" && !Array.isArray(body.entry)
        ? body.entry
        : null;
    if (!entry) {
      return { payload: { error: "missing_entry_payload" }, status: 400 };
    }

    const { data, error } = await auth.supabase.rpc("update_user_dictionary_entry", {
      p_user_id: auth.user.id,
      p_entry_id: entryId,
      p_entry: entry,
    });

    if (error) {
      return mapUserEntryRpcError("update_user_entry_failed", error);
    }

    return { payload: { ok: true, action, entryId: data }, status: 200 };
  }

  if (action === "delete-user-entry") {
    const { error } = await auth.supabase.rpc("delete_user_dictionary_entry", {
      p_user_id: auth.user.id,
      p_entry_id: entryId,
    });

    if (error) {
      return mapUserEntryRpcError("delete_user_entry_failed", error);
    }

    return { payload: { ok: true, action, entryId }, status: 200 };
  }

  if (action === "remove-from-list") {
    const listId = asString(body?.listId);
    if (!listId) {
      return { payload: { error: "missing_list_id" }, status: 400 };
    }

    const { error } = await auth.supabase.rpc("remove_entries_from_user_list", {
      p_user_id: auth.user.id,
      p_list_id: listId,
      p_entry_ids: [entryId],
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("list_not_found")) {
        return { payload: { error: "list_not_found" }, status: 404 };
      }
      return { payload: { error: "remove_from_list_failed", detail }, status: 500 };
    }

    return { payload: { ok: true, action, entryId, listId }, status: 200 };
  }

  const readable = await assertEntryReadable(auth.supabase, entryId);
  if (readable !== true) {
    const status =
      readable.error === "entry_not_found"
        ? 404
        : readable.error === "entry_lookup_failed"
          ? 500
          : 403;
    return { payload: readable, status };
  }

  if (action === "add-to-list") {
    const listId = asString(body?.listId);
    if (!listId) {
      return { payload: { error: "missing_list_id" }, status: 400 };
    }

    const { error } = await auth.supabase.rpc("add_entry_to_user_list", {
      p_user_id: auth.user.id,
      p_list_id: listId,
      p_entry_id: entryId,
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("list_not_found")) {
        return { payload: { error: "list_not_found" }, status: 404 };
      }
      if (detail.includes("entry_not_found")) {
        return { payload: { error: "entry_not_found" }, status: 404 };
      }
      if (detail.includes("entry_not_accessible")) {
        return { payload: { error: "entry_not_accessible" }, status: 403 };
      }
      return { payload: { error: "add_to_list_failed", detail }, status: 500 };
    }

    return { payload: { ok: true, action, entryId, listId }, status: 200 };
  }

  if (action === "copy-to-user-dictionary") {
    const targetDictionaryId = asString(body?.targetDictionaryId);
    const overrides =
      body?.overrides && typeof body.overrides === "object" && !Array.isArray(body.overrides)
        ? body.overrides
        : {};

    const { data, error } = await auth.supabase.rpc("copy_entry_to_user_dictionary", {
      p_user_id: auth.user.id,
      p_source_entry_id: entryId,
      p_target_dictionary_id: targetDictionaryId,
      p_overrides: overrides,
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("entry_not_found")) {
        return { payload: { error: "entry_not_found" }, status: 404 };
      }
      if (detail.includes("entry_not_accessible")) {
        return { payload: { error: "entry_not_accessible" }, status: 403 };
      }
      if (detail.includes("target_dictionary_not_editable")) {
        return { payload: { error: "target_dictionary_not_editable" }, status: 403 };
      }
      if (
        detail.includes("invalid_user_entry") ||
        detail.includes("language_not_found") ||
        detail.includes("language_mismatch")
      ) {
        return { payload: { error: "invalid_user_entry", detail }, status: 400 };
      }
      return {
        payload: { error: "copy_to_user_dictionary_failed", detail },
        status: 500,
      };
    }

    return {
      payload: {
        ok: true,
        action,
        entryId,
        copiedEntryId: data,
        targetDictionaryId: targetDictionaryId ?? null,
      },
      status: 200,
    };
  }

  const mode = asTrainingMode(body?.cardTypeId);
  if (!mode) {
    return { payload: { error: "missing_or_invalid_card_type_id" }, status: 400 };
  }

  if (action === "record-view" || action === "start-learning") {
    if (clientEventId) {
      const { data, error } = await performProvenanceAwareCardAction(auth, {
        entryId,
        mode,
        action,
        clientEventId,
        sourceContext,
      });

      if (error) {
        const detail = error.message ?? String(error);
        if (detail.includes("platform_action_idempotency_conflict")) {
          return { payload: { error: "idempotency_conflict", detail }, status: 409 };
        }
        return {
          payload: { error: `${action}_failed`, detail },
          status: 500,
        };
      }
      return {
        payload: {
          ok: true,
          action,
          entryId,
          cardTypeId: mode,
          clientEventId,
          provenance: data ?? null,
        },
        status: 200,
      };
    }

    const { error } =
      action === "start-learning"
        ? await auth.supabase.rpc("start_learning_entry_card", {
            p_user_id: auth.user.id,
            p_entry_id: entryId,
            p_card_type_id: mode,
          })
        : await auth.supabase.rpc("record_card_view", {
            p_user_id: auth.user.id,
            p_entry_id: entryId,
            p_card_type_id: mode,
          });

    if (error) {
      return {
        payload: { error: `${action}_failed`, detail: error.message ?? String(error) },
        status: 500,
      };
    }
    return { payload: { ok: true, action, entryId, cardTypeId: mode }, status: 200 };
  }

  const result =
    action === "mark-unknown"
      ? "fail"
      : action === "mark-known"
        ? "easy"
        : asReviewResult(body?.result);
  if (!result) {
    return { payload: { error: "missing_or_invalid_result" }, status: 400 };
  }

  const turnId = asString(body?.turnId);
  const provenanceTurnId = clientEventId ? asUuid(body?.turnId) ?? asUuid(clientEventId) : null;
  if (clientEventId && body?.turnId !== undefined && !asUuid(body.turnId)) {
    return { payload: { error: "invalid_turn_id" }, status: 400 };
  }

  if (clientEventId) {
    const { data, error } = await performProvenanceAwareCardAction(auth, {
      entryId,
      mode,
      action,
      result,
      turnId: provenanceTurnId,
      clientEventId,
      sourceContext,
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("platform_action_idempotency_conflict")) {
        return { payload: { error: "idempotency_conflict", detail }, status: 409 };
      }
      if (detail.includes("platform_review_turn_already_consumed")) {
        return {
          payload: { error: "review_turn_already_consumed", detail },
          status: 409,
        };
      }
      return {
        payload: { error: `${action}_failed`, detail },
        status: 500,
      };
    }

    return {
      payload: {
        ok: true,
        action,
        entryId,
        cardTypeId: mode,
        result,
        turnId: provenanceTurnId,
        clientEventId,
        provenance: data ?? null,
      },
      status: 200,
    };
  }

  const { error } = await recordReview(auth, {
    entryId,
    mode,
    result,
    turnId,
  });

  if (error) {
    return {
      payload: { error: `${action}_failed`, detail: error.message ?? String(error) },
      status: 500,
    };
  }

  return {
    payload: {
      ok: true,
      action,
      entryId,
      cardTypeId: mode,
      result,
      turnId: turnId ?? null,
    },
    status: 200,
  };
}
