import type { AuthenticatedSupabase } from "./serverSupabase";
import type { PlatformAction, PlatformOperationResult } from "./platformApi";
import { parseSourceContext } from "./sourceContext";

export type GeneratedUserDictionaryEntryBody = {
  clickedForm?: unknown;
  headword?: unknown;
  languageCode?: unknown;
  contextText?: unknown;
  sourceContext?: unknown;
  dictionaryId?: unknown;
  draftSetId?: unknown;
  candidateId?: unknown;
  revision?: unknown;
  item?: unknown;
  generated?: unknown;
};

export async function createUserDictionaryEntry(
  auth: AuthenticatedSupabase,
  params: {
    action: PlatformAction;
    dictionaryId: string | null;
    entry: Record<string, unknown>;
  },
): Promise<PlatformOperationResult> {
  const { data, error } = await auth.supabase.rpc("create_user_dictionary_entry", {
    p_user_id: auth.user.id,
    p_dictionary_id: params.dictionaryId,
    p_entry: params.entry,
  });

  if (error) {
    return mapUserEntryRpcError("create_user_entry_failed", error);
  }

  return {
    payload: {
      ok: true,
      action: params.action,
      entryId: data,
      dictionaryId: params.dictionaryId ?? null,
    },
    status: 200,
  };
}

export async function updateUserDictionaryEntry(
  auth: AuthenticatedSupabase,
  params: {
    action: PlatformAction;
    entryId: string;
    entry: Record<string, unknown>;
  },
): Promise<PlatformOperationResult> {
  const { data, error } = await auth.supabase.rpc("update_user_dictionary_entry", {
    p_user_id: auth.user.id,
    p_entry_id: params.entryId,
    p_entry: params.entry,
  });

  if (error) {
    return mapUserEntryRpcError("update_user_entry_failed", error);
  }

  return { payload: { ok: true, action: params.action, entryId: data }, status: 200 };
}

export async function deleteUserDictionaryEntry(
  auth: AuthenticatedSupabase,
  params: {
    action: PlatformAction;
    entryId: string;
  },
): Promise<PlatformOperationResult> {
  const { error } = await auth.supabase.rpc("delete_user_dictionary_entry", {
    p_user_id: auth.user.id,
    p_entry_id: params.entryId,
  });

  if (error) {
    return mapUserEntryRpcError("delete_user_entry_failed", error);
  }

  return { payload: { ok: true, action: params.action, entryId: params.entryId }, status: 200 };
}

export async function createGeneratedUserDictionaryEntry(
  auth: AuthenticatedSupabase,
  body: GeneratedUserDictionaryEntryBody | null,
): Promise<PlatformOperationResult> {
  const record = asRecord(body);
  const clickedForm = asString(record.clickedForm) ?? asString(record.headword);
  const languageCode = asString(record.languageCode);
  const draftSetId = asString(record.draftSetId);
  const candidateId = asString(record.candidateId);
  const revision = asPositiveInteger(record.revision);
  const candidateItem = asRecord(record.item);
  const candidateEntry = asRecord(candidateItem.entry);
  const candidateContent = asRecord(candidateEntry.content);
  const generated = asRecord(record.generated);
  const definition =
    asString(asRecord(candidateContent.summary).definition) ??
    firstSectionText(candidateContent.sections, "meaning") ??
    asString(generated.definition);
  const notes =
    firstSectionText(candidateContent.sections, "note") ??
    asString(generated.notes);
  const example = asRecord(generated.example);
  const exampleSource =
    asString(asRecord(candidateContent.summary).example) ??
    firstSectionText(candidateContent.sections, "example") ??
    asString(example.source) ??
    asString(record.contextText);
  const selectedHeadword =
    asString(candidateContent.headword) ??
    asString(candidateEntry.headword) ??
    clickedForm;
  const selectedLanguageCode =
    asString(candidateContent.languageCode) ??
    asString(candidateEntry.languageCode) ??
    languageCode;

  if (!selectedHeadword) {
    return { payload: { error: "missing_clicked_form" }, status: 400 };
  }
  if (!selectedLanguageCode) {
    return { payload: { error: "missing_language_code" }, status: 400 };
  }
  if (!draftSetId || !candidateId || revision === null || !candidateContent.headword) {
    return { payload: { error: "missing_draft_candidate" }, status: 400 };
  }
  if (!definition && !notes && !exampleSource) {
    return { payload: { error: "missing_generated_content" }, status: 400 };
  }

  const sourceContext = parseSourceContext(record.sourceContext, auth.user.id);
  if (!sourceContext.ok) {
    return { payload: { error: sourceContext.error }, status: sourceContext.status };
  }

  const entry = stripUndefined({
    headword: selectedHeadword,
    languageCode: selectedLanguageCode,
    definition,
    example: exampleSource
      ? stripUndefined({
          source: exampleSource,
          translation: asString(example.translation),
        })
      : undefined,
    partOfSpeech:
      asString(candidateContent.partOfSpeech) ?? asString(generated.partOfSpeech),
    gender: asString(candidateContent.gender) ?? asString(generated.gender),
    notes,
    tags: uniqueStringArray(["generated", ...asStringArray(generated.tags)]),
    generation: stripUndefined({
      kind: "llm",
      draftSetId,
      candidateId,
      revision,
      provider:
        asString(asRecord(candidateItem.generation).provider) ??
        asString(generated.provider),
      model:
        asString(asRecord(candidateItem.generation).model) ??
        asString(generated.model),
      promptVersion:
        asString(asRecord(candidateItem.generation).promptVersion) ??
        asString(generated.promptVersion),
      generatedAt: asString(generated.generatedAt) ?? new Date().toISOString(),
      contentFingerprint:
        asString(candidateEntry.contentFingerprint) ??
        asString(asRecord(candidateItem.generation).contentFingerprint) ??
        asString(generated.contentFingerprint),
      source: stripUndefined({
        clickedForm: selectedHeadword,
        languageCode: selectedLanguageCode,
        contextText: asString(record.contextText),
        connectedClientId: auth.principal.connectedClientId,
        sourceContextVersion: sourceContext.version,
        sourceContext: sourceContext.value,
      }),
    }),
  });

  const dictionaryId = asString(record.dictionaryId);
  const { data, error } = await auth.supabase.rpc("create_user_dictionary_entry", {
    p_user_id: auth.user.id,
    p_dictionary_id: dictionaryId,
    p_entry: entry,
  });

  if (error) {
    return mapUserEntryRpcError("create_generated_user_entry_failed", error);
  }

  return {
    payload: {
      ok: true,
      entryId: data,
      dictionaryId: dictionaryId ?? null,
      entry,
      generation: {
        status: "persisted",
        draftSetId,
        candidateId,
        revision,
        requiresExplicitStartLearning: true,
      },
      nextActions: ["start-learning"],
    },
    status: 200,
  };
}

export function mapUserEntryRpcError(
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asPositiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function firstSectionText(value: unknown, kind: string): string | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const section = asRecord(item);
    if (section.kind === kind) {
      const text = asString(section.text);
      if (text) return text;
    }
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item));
}

function uniqueStringArray(values: string[]): string[] {
  return Array.from(new Set(values));
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null),
  ) as T;
}
