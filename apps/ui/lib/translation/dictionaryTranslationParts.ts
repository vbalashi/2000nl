import crypto from "node:crypto";
import {
  DICTIONARY_MEANING_TRANSLATION_LIMITS as limits,
  isIdiomOnlyDictionaryMeaningRequest,
  type DictionaryMeaningTranslationRequestV1 as Request,
  type DictionaryMeaningTranslationResultV1 as Result,
} from "./dictionaryMeaningTranslationContract";
import { buildDictionaryMeaningTranslationArtifact } from "./dictionaryMeaningTranslationArtifact";
import { dictionaryMeaningTranslationCoverage } from "./dictionaryMeaningTranslationReadiness";

type Field = Request["content"][number];
export type DictionaryTranslationPart = {
  key: string;
  fingerprint: string;
  request: Request;
  owned: Array<{ fieldId: string; sourceFieldId: string; segment: number }>;
};
const digest = (value: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function fits(request: Request) {
  const values = [
    request.contractVersion,
    request.entryId,
    request.sourceContentFingerprint,
    request.sourceLanguageCode,
    request.targetLanguageCode,
    ...Object.values(request.headword).filter(
      (v): v is string => typeof v === "string",
    ),
  ];
  const contentValues = request.content.flatMap((item) => [
    item.fieldId,
    item.role,
    item.text,
  ]);
  const chars = (v: string) => Array.from(v).length;
  const tokens = (v: string) => Buffer.byteLength(v, "utf8");
  return (
    request.content.length <= limits.contentItems &&
    request.content.every(
      (item) => chars(item.text) <= limits.contentItemCharacters,
    ) &&
    contentValues.reduce((n, v) => n + chars(v), 0) <=
      limits.contentCharacters &&
    contentValues.reduce((n, v) => n + tokens(v), 0) <=
      limits.contentTokenUpperBound &&
    [...values, ...contentValues].reduce((n, v) => n + chars(v), 0) <=
      limits.requestStringCharacters &&
    [...values, ...contentValues].reduce((n, v) => n + tokens(v), 0) <=
      limits.requestStringTokenUpperBound
  );
}
/** Deterministic segmentation preserves every character (including inter-segment spaces). */
function segments(text: string): string[] {
  const chars = Array.from(text),
    out: string[] = [];
  for (let start = 0; start < chars.length; ) {
    let end = Math.min(start + limits.contentItemCharacters, chars.length);
    if (end < chars.length)
      for (let i = end - 1; i > start + limits.contentItemCharacters / 2; i--) {
        if (/\s/u.test(chars[i])) {
          end = i + 1;
          break;
        }
      }
    out.push(chars.slice(start, end).join(""));
    start = end;
  }
  return out;
}
function semanticGroup(fieldId: string) {
  return (
    fieldId.match(/^(?:meaning:\d+:)?idiom:\d+/)?.[0] ??
    fieldId.match(/^meaning:\d+:/)?.[0] ??
    "ordinary"
  );
}
export function planDictionaryTranslationParts(
  inventory: Request,
): DictionaryTranslationPart[] {
  const part = (
    request: Request,
    owned: DictionaryTranslationPart["owned"],
    index: number,
  ): DictionaryTranslationPart => ({
    key: `part:${index}`,
    fingerprint: digest({ request, owned }),
    request,
    owned,
  });
  if (fits(inventory))
    return [
      part(
        inventory,
        inventory.content.map((f) => ({
          fieldId: f.fieldId,
          sourceFieldId: f.fieldId,
          segment: 0,
        })),
        0,
      ),
    ];
  // Carry the ordinary meaning and examples, or this idiom's meaning constraints,
  // as bounded read-only context. Context is not part of the output inventory.
  const out: DictionaryTranslationPart[] = [];
  const units = inventory.content.flatMap((field) => {
    const pieces = segments(field.text);
    return pieces.map((text, segment) => ({
      field: {
        ...field,
        text,
        fieldId:
          pieces.length === 1
            ? field.fieldId
            : `${field.fieldId}#segment:${segment}`,
      } as Field,
      sourceFieldId: field.fieldId,
      segment,
    }));
  });
  let current: typeof units = [];
  const contextFor = (unit: (typeof units)[number]) => {
    const prefix = unit.sourceFieldId.match(/^meaning:\d+:/)?.[0] ?? "";
    const idiom = unit.sourceFieldId.match(/^(?:meaning:\d+:)?idiom:\d+/)?.[0];
    return inventory.content
      .filter(
        (f) =>
          f.fieldId === `${prefix}definition` ||
          f.fieldId === `${prefix}usage-pattern` ||
          (!idiom && f.fieldId.startsWith(`${prefix}example:`)) ||
          (idiom &&
            (f.fieldId === idiom || f.fieldId === `${idiom}:explanation`)),
      )
      .slice(0, 6)
      .map((f) => ({ ...f, text: Array.from(f.text).slice(0, 120).join("") }));
  };
  const flush = () => {
    if (!current.length) return;
    const request: Request = {
      ...inventory,
      content: current.map((u) => u.field),
    };
    const context = contextFor(current[0]);
    // Context has its own explicit role; only owned content is returned/validated.
    const withContext = {
      ...request,
      context,
      entryTranslationRequired: !isIdiomOnlyDictionaryMeaningRequest(inventory),
    };
    out.push(
      part(
        withContext,
        current.map((u) => ({
          fieldId: u.field.fieldId,
          sourceFieldId: u.sourceFieldId,
          segment: u.segment,
        })),
        out.length,
      ),
    );
    current = [];
  };
  for (const unit of units) {
    // Reserve a conservative 3600-char/UTF8 context allowance inside each budget.
    const test = {
      ...inventory,
      content: [
        ...current.map((u) => u.field),
        unit.field,
        ...contextFor(current[0] ?? unit),
      ],
    };
    if (
      current.length &&
      (!fits(test) ||
        semanticGroup(current[0].sourceFieldId) !==
          semanticGroup(unit.sourceFieldId))
    )
      flush();
    current.push(unit);
  }
  flush();
  return out;
}

export function aggregateDictionaryTranslationParts(
  inventory: Request,
  parts: DictionaryTranslationPart[],
  results: Result[],
) {
  if (parts.length !== results.length)
    throw new Error("translation_parts_incomplete");
  const fields = new Map<
    string,
    Array<{ segment: number; text: string; literalText?: string | null }>
  >();
  parts.forEach((part, index) => {
    const result = results[index];
    if (result.contentTranslations.length !== part.owned.length)
      throw new Error("translation_parts_incomplete");
    for (const owned of part.owned) {
      const translated = result.contentTranslations.find(
        (item) => item.fieldId === owned.fieldId,
      );
      if (!translated?.text.trim())
        throw new Error("translation_parts_incomplete");
      const entries = fields.get(owned.sourceFieldId) ?? [];
      entries.push({ ...translated, segment: owned.segment });
      fields.set(owned.sourceFieldId, entries);
    }
  });
  const contentTranslations = inventory.content.map((field) => {
    const entries = fields.get(field.fieldId);
    if (!entries?.length) throw new Error("translation_parts_incomplete");
    entries.sort((a, b) => a.segment - b.segment);
    return {
      fieldId: field.fieldId,
      text: entries.map((e) => e.text.trim()).join(" "),
      ...(entries.length === 1 && entries[0].literalText
        ? { literalText: entries[0].literalText }
        : {}),
    };
  });
  const result: Result = {
    entryTranslation: isIdiomOnlyDictionaryMeaningRequest(inventory)
      ? null
      : (results.find((result) => result.entryTranslation)?.entryTranslation ??
        null),
    contentTranslations,
  };
  const overlay = buildDictionaryMeaningTranslationArtifact(result);
  if (!dictionaryMeaningTranslationCoverage(inventory, overlay).requestComplete)
    throw new Error("translation_parts_incomplete");
  return { overlay, note: result.entryTranslation?.note ?? null };
}
