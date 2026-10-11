import {
  parseDictionaryMeaningTranslationResult,
  type DictionaryMeaningTranslationRequestV1,
} from "./dictionaryMeaningTranslationContract";
import type { OpenAITranslationMessage } from "./openaiTranslationContract";
import { loadPromptText } from "./prompts/promptLoader";

/** Repair only an otherwise valid subset with omitted explanations. */
export function planDictionaryExplanationRepair(content: string, request: DictionaryMeaningTranslationRequestV1) {
  try {
    const payload = JSON.parse(content);
    if (!Array.isArray(payload.contentTranslations)) return null;
    const ids = payload.contentTranslations.map((item: { fieldId?: unknown }) => item?.fieldId);
    if (new Set(ids).size !== ids.length) return null;
    const present = request.content.filter(item => ids.includes(item.fieldId));
    const missing = request.content.filter(item => !ids.includes(item.fieldId));
    if (!missing.length || missing.some(item => item.role !== "idiom-explanation")) return null;
    // IDs are authoritative; normalize order without changing translations.
    if (ids.length !== present.length) return null;
    const byId = new Map(payload.contentTranslations.map((item: { fieldId: string }) => [item.fieldId, item]));
    parseDictionaryMeaningTranslationResult(JSON.stringify({ ...payload, contentTranslations: present.map(item => byId.get(item.fieldId)) }), { ...request, content: present });
    const messages: OpenAITranslationMessage[] = [
      { role: "system", content: loadPromptText("openai_dictionary_explanation_repair_v1.txt").trim() },
      { role: "user", content: JSON.stringify({ request, previousResponse: payload, missingFields: missing, responseFormat: { contentTranslations: [{ fieldId: "string", text: "string" }] } }) },
    ];
    return { missing, messages };
  } catch {
    return null;
  }
}

export function mergeDictionaryExplanationRepair(
  original: string,
  patch: string,
  request: DictionaryMeaningTranslationRequestV1,
  missing: DictionaryMeaningTranslationRequestV1["content"],
) {
  const payload = JSON.parse(original);
  const parsed = JSON.parse(patch);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length !== 1 || !Object.hasOwn(parsed, "contentTranslations")) {
    throw new Error("Invalid explanation repair envelope");
  }
  const validated = parseDictionaryMeaningTranslationResult(JSON.stringify({ entryTranslation: null, contentTranslations: parsed.contentTranslations }), { ...request, content: missing });
  const items = new Map([...payload.contentTranslations, ...validated.contentTranslations].map(item => [item.fieldId, item]));
  return parseDictionaryMeaningTranslationResult(JSON.stringify({ ...payload, contentTranslations: request.content.map(item => items.get(item.fieldId)) }), request);
}
