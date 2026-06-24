import crypto from "crypto";
import type { AuthenticatedSupabase } from "./serverSupabase";
import type { PlatformOperationResult } from "./platformApi";
import { parseSourceContext } from "./sourceContext";
import {
  contentFingerprint as learnerContentFingerprint,
} from "./projections/dictionaryContent";
import { loadTranslationConfigFromEnv } from "@/lib/translation/translationProvider";

const PROMPT_VERSION = "generated-user-entry-v1";
const DEFAULT_OPENAI_MODEL = "gpt-5.2";
const DEFAULT_OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export type GeneratedEntryDraftBody = {
  clickedForm?: unknown;
  languageCode?: unknown;
  contextText?: unknown;
  draftSetId?: unknown;
  sourceContext?: unknown;
};

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
};

export async function draftGeneratedUserDictionaryEntry(
  auth: AuthenticatedSupabase,
  body: GeneratedEntryDraftBody | null,
): Promise<PlatformOperationResult> {
  const record = asRecord(body);
  const clickedForm = asString(record.clickedForm);
  const languageCode = asString(record.languageCode);
  const contextText = asString(record.contextText);

  if (!clickedForm) {
    return { payload: { error: "missing_clicked_form" }, status: 400 };
  }
  if (!languageCode) {
    return { payload: { error: "missing_language_code" }, status: 400 };
  }
  if (!contextText) {
    return { payload: { error: "missing_context_text" }, status: 400 };
  }

  const sourceContext = parseSourceContext(record.sourceContext, auth.user.id);
  if (!sourceContext.ok) {
    return { payload: { error: sourceContext.error }, status: sourceContext.status };
  }

  const config = loadTranslationConfigFromEnv();
  const apiKey = config.apiKeys.openai?.trim();
  if (!apiKey) {
    return {
      payload: { error: "generated_entry_provider_not_configured" },
      status: 503,
    };
  }

  const apiUrl = resolveChatCompletionsUrl(
    config.apiUrls?.openai ?? DEFAULT_OPENAI_API_URL,
  );
  const model = config.models?.openai ?? DEFAULT_OPENAI_MODEL;

  let generated: Record<string, unknown>;
  try {
    generated = await callOpenAiGeneratedEntry({
      apiKey,
      apiUrl,
      model,
      clickedForm,
      languageCode,
      contextText,
    });
  } catch (error) {
    return {
      payload: {
        error: "generated_entry_provider_failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      status: 502,
    };
  }

  const partOfSpeech = normalizeGeneratedPartOfSpeech({
    languageCode,
    value: asString(generated.partOfSpeech),
  });
  const draftGenerated = stripNil({
    definition: asString(generated.definition),
    example: asString(generated.example)
      ? { source: asString(generated.example) }
      : undefined,
    partOfSpeech,
    notes: asString(generated.notes),
    provider: "openai",
    model,
    promptVersion: PROMPT_VERSION,
    generatedAt: new Date().toISOString(),
  });
  const draftSetId = asString(record.draftSetId) ?? `gds_${fingerprint({
    clickedForm,
    languageCode,
    contextText,
    sourceContext: sourceContext.value ?? null,
  }).slice(0, 32)}`;
  const candidateId = `gdc_${fingerprint({
    clickedForm,
    languageCode,
    contextText,
    generated: draftGenerated,
  }).slice(0, 32)}`;
  const revision = 1;
  const content = normalizeGeneratedDictionaryContent({
    clickedForm,
    languageCode,
    definition: asString(draftGenerated.definition),
    exampleSource: asString(asRecord(draftGenerated.example).source),
    partOfSpeech,
    notes: asString(draftGenerated.notes),
  });
  const contentFingerprint = learnerContentFingerprint(content);
  const generationMetadata = {
    status: "draft",
    provider: "openai",
    model,
    promptVersion: PROMPT_VERSION,
    contentFingerprint,
    requiresExplicitSave: true,
  };

  return {
    payload: {
      ok: true,
      draft: {
        draftSetId,
        candidateId,
        revision,
        clickedForm,
        languageCode,
        ...(contextText ? { contextText } : {}),
        ...(sourceContext.value ? { sourceContext: sourceContext.value } : {}),
        item: {
          draftSetId,
          candidateId,
          revision,
          entry: {
            id: `draft:${candidateId}`,
            dictionaryId: null,
            languageCode,
            headword: clickedForm,
            meaningId: null,
            partOfSpeech,
            gender: null,
            content,
            contentFingerprint,
            raw: {
              schema: "generated-draft-entry-v1",
              headword: clickedForm,
              languageCode,
              definition: asString(draftGenerated.definition),
              example: asRecord(draftGenerated.example),
              partOfSpeech,
              notes: asString(draftGenerated.notes),
              tags: ["generated"],
              generation: {
                kind: "llm",
                ...generationMetadata,
                generatedAt: asString(draftGenerated.generatedAt),
              },
            },
            isGeneratedDraft: true,
          },
          dictionary: {
            id: null,
            languageCode,
            slug: "generated-draft",
            name: "Generated draft",
            kind: "generated",
            visibility: "private",
            schemaKey: "generated-draft-entry-v1",
            schemaVersion: 1,
            isEditable: true,
          },
          match: {
            queriedForm: clickedForm,
            matchedForm: clickedForm,
            relation: "generated",
          },
          cardCapabilitiesByType: {
            "word-to-definition": {
              phase: "draft",
              actions: ["save-and-start-learning"],
            },
          },
          availableActions: ["save-and-start-learning"],
          generation: {
            ...generationMetadata,
            generatedAt: asString(draftGenerated.generatedAt),
          },
        },
      },
      generation: generationMetadata,
      nextActions: ["save-and-start-learning"],
    },
    status: 200,
  };
}

function normalizeGeneratedDictionaryContent(params: {
  clickedForm: string;
  languageCode: string;
  definition: string | null;
  exampleSource: string | null;
  partOfSpeech: string | null;
  notes: string | null;
}) {
  const sections = [
    params.definition
      ? {
          id: "meaning-1",
          kind: "meaning" as const,
          text: params.definition,
          sourcePath: "raw.definition",
        }
      : null,
    params.exampleSource
      ? {
          id: "example-1",
          kind: "example" as const,
          text: params.exampleSource,
          sourcePath: "raw.example.source",
        }
      : null,
    params.notes
      ? {
          id: "note-1",
          kind: "note" as const,
          text: params.notes,
          sourcePath: "raw.notes",
        }
      : null,
  ].filter((section): section is NonNullable<typeof section> => Boolean(section));

  return {
    headword: params.clickedForm,
    languageCode: params.languageCode,
    meaningId: null,
    partOfSpeech: params.partOfSpeech,
    gender: null,
    meanings: [
      {
        definition: params.definition,
        translations: {},
        examples: params.exampleSource ? [params.exampleSource] : undefined,
      },
    ],
    images: undefined,
    sections,
    sourceMeta: {
      kind: "generated",
      provider: "openai",
      promptVersion: PROMPT_VERSION,
    },
    summary: {
      definition: params.definition ?? "",
      ...(params.exampleSource ? { example: params.exampleSource } : {}),
    },
  };
}

function normalizeGeneratedPartOfSpeech(params: {
  languageCode: string;
  value: string | null;
}) {
  const raw = params.value;
  if (!raw) return null;
  const normalized = raw.trim().toLocaleLowerCase();
  if (params.languageCode.toLocaleLowerCase() === "nl") {
    const dutchMap: Record<string, string> = {
      "zn": "zn",
      "noun": "zn",
      "substantief": "zn",
      "zelfstandig naamwoord": "zn",
      "ww": "ww",
      "verb": "ww",
      "werkwoord": "ww",
      "bn": "bn",
      "adjective": "bn",
      "bijvoeglijk naamwoord": "bn",
      "bw": "bw",
      "adverb": "bw",
      "bijwoord": "bw",
    };
    return dutchMap[normalized] ?? raw.trim();
  }
  return raw.trim();
}

async function callOpenAiGeneratedEntry(params: {
  apiKey: string;
  apiUrl: string;
  model: string;
  clickedForm: string;
  languageCode: string;
  contextText: string | null;
}) {
  const includeModel = !/\/openai\/deployments\//i.test(params.apiUrl);
  const response = await fetch(params.apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(looksLikeAzureOpenAI(params.apiUrl)
        ? { "api-key": params.apiKey }
        : { authorization: `Bearer ${params.apiKey}` }),
    },
    body: JSON.stringify({
      ...(includeModel ? { model: params.model } : {}),
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You create concise same-language learner dictionary cards. Return only valid JSON.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Create a same-language explanatory dictionary card.",
            languageCode: params.languageCode,
            clickedForm: params.clickedForm,
            contextText: params.contextText,
            outputShape: {
              definition: "short explanation in the source language",
              example: "short source-language example sentence",
              partOfSpeech: "optional coarse part of speech",
              notes: "optional brief usage note",
            },
            constraints: [
              "Do not translate into another language.",
              "Keep the definition learner-friendly and factual.",
              "Do not invent source provenance.",
            ],
          }),
        },
      ],
    }),
  });

  const payload = (await response.json().catch(() => null)) as OpenAIChatResponse | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `provider_http_${response.status}`);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error("provider_response_missing_content");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("provider_response_invalid_json");
  }
  const generated = asRecord(parsed);
  if (!asString(generated.definition)) {
    throw new Error("provider_response_missing_definition");
  }
  return generated;
}

function resolveChatCompletionsUrl(apiUrl: string) {
  const trimmed = apiUrl.trim();
  if (/\/openai\/v1\/?$/i.test(trimmed)) {
    return `${trimmed.replace(/\/+$/, "")}/chat/completions`;
  }
  return trimmed;
}

function looksLikeAzureOpenAI(apiUrl: string) {
  const url = apiUrl.toLowerCase();
  return url.includes(".openai.azure.com") || url.includes("azure.com/openai/");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stripNil<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null),
  ) as T;
}

function fingerprint(value: unknown) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}
