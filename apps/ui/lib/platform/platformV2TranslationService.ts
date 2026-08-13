import crypto from "node:crypto";
import type {
  PlatformContentNodeTranslationV2,
  PlatformEntryTranslationStateV2,
} from "../../../../packages/shared/types/platformV2";
import {
  contentFingerprint,
  normalizeDictionaryContent,
  verifyDictionaryContentAudioLinks,
} from "./projections/dictionaryContent";
import type { PlatformContentNodeBindingV2Input } from "./projections/senseCardV2";
import type { ServiceSupabase } from "./serverSupabase";
import type { DictionaryLookupPayload } from "./lookupService";
import { translationPolicyVersion } from "../translation/translationPolicy";
import type { TranslationProviderName } from "../translation/types";

type TranslationRow = {
  id: string;
  word_entry_id: string;
  target_lang: string;
  provider: TranslationProviderName;
  status: "pending" | "ready" | "failed";
  overlay: Record<string, unknown> | null;
  source_content_revision: string | null;
  translation_policy_version: string | null;
  provider_revision: string | null;
  error_message: string | null;
};

export type PlatformV2TranslationProjection = {
  entryTranslation: PlatformEntryTranslationStateV2 | null;
  nodeTranslationsById: Map<string, PlatformContentNodeTranslationV2[]>;
};

export async function resolvePlatformV2Translations(
  service: ServiceSupabase,
  params: {
    entries: DictionaryLookupPayload[];
    bindingsByEntryId: Map<string, PlatformContentNodeBindingV2Input[]>;
    targetLanguageCode: string;
  },
): Promise<
  | {
      ok: true;
      byEntryId: Map<string, PlatformV2TranslationProjection>;
    }
  | {
      ok: false;
      error: string;
    }
> {
  const provider = translationProvider(process.env.TRANSLATION_PROVIDER);
  const targetLanguageCode = normalizeLanguageCode(
    params.targetLanguageCode,
  );
  const { data, error } = await service.supabase
    .from("word_entry_translations")
    .select(
      "id,word_entry_id,target_lang,provider,status,overlay,source_content_revision,translation_policy_version,provider_revision,error_message",
    )
    .in(
      "word_entry_id",
      params.entries.map((entry) => entry.id),
    )
    .eq("target_lang", targetLanguageCode)
    .eq("provider", provider);

  if (error) {
    return {
      ok: false,
      error: error.message ?? String(error),
    };
  }

  const rowsByEntryId = new Map<string, TranslationRow>();
  for (const row of Array.isArray(data) ? data : []) {
    const candidate = row as TranslationRow;
    if (candidate.word_entry_id) {
      rowsByEntryId.set(candidate.word_entry_id, candidate);
    }
  }

  const byEntryId = new Map<string, PlatformV2TranslationProjection>();
  for (const entry of params.entries) {
    const row = rowsByEntryId.get(entry.id);
    const nodeTranslationsById = new Map<
      string,
      PlatformContentNodeTranslationV2[]
    >();
    if (!row) {
      byEntryId.set(entry.id, {
        entryTranslation: null,
        nodeTranslationsById,
      });
      continue;
    }

    const content = await verifyDictionaryContentAudioLinks(
      normalizeDictionaryContent(entry),
    );
    const currentContentRevision = contentFingerprint(content);
    const currentPolicyVersion = translationPolicyVersion(provider);
    const isFresh =
      row.source_content_revision === currentContentRevision &&
      row.translation_policy_version === currentPolicyVersion;
    const bindings = params.bindingsByEntryId.get(entry.id) ?? [];

    if (!isFresh) {
      byEntryId.set(entry.id, {
        entryTranslation: {
          translationId: row.id,
          entryId: entry.id,
          targetLanguageCode,
          status: "not-available",
          sourceContentFingerprint:
            row.source_content_revision ?? currentContentRevision,
          translationPolicyVersion:
            row.translation_policy_version ?? currentPolicyVersion,
          ...(row.provider_revision
            ? { providerRevision: row.provider_revision }
            : {}),
          errorCode: "stale-source",
          isFresh: false,
        },
        nodeTranslationsById,
      });
      continue;
    }

    const entryText =
      row.status === "ready"
        ? translatedTextAtSourcePath(row.overlay, "raw.headword")
        : null;
    const structuredEntry = asRecord(row.overlay?.entryTranslation);
    const alternativeTexts = asStringArray(structuredEntry.alternativeTexts);
    const baseText = asNullableString(structuredEntry.baseText);
    const note = asNullableString(structuredEntry.note);
    const status =
      row.status === "ready" && !entryText
        ? "not-available"
        : row.status;
    const errorCode =
      row.status === "failed"
        ? "translation-failed"
        : status === "not-available"
          ? "entry-translation-not-available"
          : undefined;
    const entryTranslation: PlatformEntryTranslationStateV2 = {
      translationId: row.id,
      entryId: entry.id,
      targetLanguageCode,
      status,
      ...(entryText ? { text: entryText } : {}),
      ...(alternativeTexts ? { alternativeTexts } : {}),
      ...(structuredEntry.baseText !== undefined ? { baseText } : {}),
      ...(structuredEntry.note !== undefined ? { note } : {}),
      sourceContentFingerprint: currentContentRevision,
      translationPolicyVersion: currentPolicyVersion,
      ...(row.provider_revision
        ? { providerRevision: row.provider_revision }
        : {}),
      ...(errorCode ? { errorCode } : {}),
      isFresh: true,
    };

    for (const binding of bindings) {
      const text =
        row.status === "ready"
          ? translatedTextAtSourcePath(row.overlay, binding.sourcePath)
          : null;
      const nodeStatus =
        row.status === "ready" && !text ? "not-available" : row.status;
      nodeTranslationsById.set(binding.contentNodeId, [
        {
          translationId: contentNodeTranslationId(
            row.id,
            binding.contentNodeId,
          ),
          targetLanguageCode,
          status: nodeStatus,
          ...(text ? { text } : {}),
          sourceTextFingerprint: binding.sourceTextFingerprint,
          translationPolicyVersion: currentPolicyVersion,
          ...(row.provider_revision
            ? { providerRevision: row.provider_revision }
            : {}),
          ...(row.status === "failed"
            ? { errorCode: "translation-failed" }
            : nodeStatus === "not-available"
              ? { errorCode: "node-translation-not-available" }
              : {}),
        },
      ]);
    }

    byEntryId.set(entry.id, {
      entryTranslation,
      nodeTranslationsById,
    });
  }

  return { ok: true, byEntryId };
}

function translatedTextAtSourcePath(
  overlay: Record<string, unknown> | null,
  sourcePath: string,
): string | null {
  if (!overlay) return null;
  if (sourcePath === "raw.headword") {
    return asString(overlay.headword);
  }
  let path = sourcePath;
  if (path === "raw.definition") path = "raw.meanings[0].definition";
  if (path === "raw.example.source") {
    path = "raw.meanings[0].examples[0]";
  }
  if (path === "raw.notes") path = "raw.meanings[0].context";
  const match = path.match(/^raw\.meanings\[(\d+)\]\.(.+)$/);
  if (!match) return null;

  const meaningIndex = Number(match[1]);
  const tail = match[2];
  const meanings = Array.isArray(overlay.meanings)
    ? overlay.meanings
    : [];
  let value: unknown = meanings[meaningIndex];
  for (const token of pathTokens(tail)) {
    if (typeof token === "number") {
      value = Array.isArray(value) ? value[token] : undefined;
    } else {
      const record = asRecord(value);
      value = record[token];
    }
  }
  if (
    tail.startsWith("idioms[") &&
    !tail.includes(".") &&
    value &&
    typeof value === "object"
  ) {
    value = asRecord(value).expression;
  }
  return asString(value);
}

function pathTokens(path: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  for (const match of path.matchAll(/([^.[]+)|\[(\d+)\]/g)) {
    if (match[1]) tokens.push(match[1]);
    if (match[2]) tokens.push(Number(match[2]));
  }
  return tokens;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.filter(
    (item): item is string => typeof item === "string" && Boolean(item.trim()),
  );
  return strings.length === value.length ? strings.map((item) => item.trim()) : null;
}

function asNullableString(value: unknown): string | null {
  if (value === null) return null;
  return asString(value);
}

function contentNodeTranslationId(
  translationId: string,
  contentNodeId: string,
) {
  return crypto
    .createHash("sha256")
    .update(`${translationId}:${contentNodeId}`)
    .digest("hex");
}

function translationProvider(
  value: string | undefined,
): TranslationProviderName {
  const normalized = value?.trim().toLowerCase();
  return normalized === "deepl" ||
    normalized === "gemini" ||
    normalized === "openai"
    ? normalized
    : "openai";
}

function normalizeLanguageCode(value: string) {
  return value.trim().replace("_", "-").toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}
