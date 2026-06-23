import crypto from "crypto";
import type { AuthenticatedSupabase } from "./serverSupabase";
import type { PlatformOperationResult } from "./platformApi";
import { parseSourceContext } from "./sourceContext";
import { loadTranslationConfigFromEnv } from "@/lib/translation/translationProvider";

const PROMPT_VERSION = "generated-user-entry-v1";
const DEFAULT_OPENAI_MODEL = "gpt-5.2";
const DEFAULT_OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export type GeneratedEntryDraftBody = {
  clickedForm?: unknown;
  languageCode?: unknown;
  contextText?: unknown;
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

  const draftGenerated = stripNil({
    definition: asString(generated.definition),
    example: asString(generated.example)
      ? { source: asString(generated.example) }
      : undefined,
    partOfSpeech: asString(generated.partOfSpeech),
    notes: asString(generated.notes),
    provider: "openai",
    model,
    promptVersion: PROMPT_VERSION,
    generatedAt: new Date().toISOString(),
  });
  const contentFingerprint = fingerprint({
    clickedForm,
    languageCode,
    contextText,
    generated: draftGenerated,
  });

  return {
    payload: {
      ok: true,
      draft: {
        clickedForm,
        languageCode,
        ...(contextText ? { contextText } : {}),
        ...(sourceContext.value ? { sourceContext: sourceContext.value } : {}),
        generated: {
          ...draftGenerated,
          contentFingerprint,
        },
      },
      generation: {
        status: "draft",
        provider: "openai",
        model,
        promptVersion: PROMPT_VERSION,
        requiresExplicitSave: true,
      },
      nextActions: ["save-generated-entry"],
    },
    status: 200,
  };
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
