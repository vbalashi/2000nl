import { describe, expect, test } from "vitest";
import {
  planDictionaryTranslationParts,
  aggregateDictionaryTranslationParts,
} from "@/lib/translation/dictionaryTranslationParts";
import {
  buildDictionaryMeaningTranslationRequest,
  buildDictionaryMeaningTranslationInventory,
} from "@/lib/translation/dictionaryMeaningTranslationContract";
describe("full source inventory", () => {
  test("retains every field past provider budgets without truncating long source text", () => {
    const definition = "lang ".repeat(400);
    const examples = Array.from(
      { length: 160 },
      (_, i) => `voorbeeld ${i} ` + "zin ".repeat(100),
    );
    const request = buildDictionaryMeaningTranslationRequest({
      entryId: "large",
      sourceContentFingerprint: "revision",
      sourceLanguageCode: "nl",
      targetLanguageCode: "ru",
      word: {
        headword: "woord",
        raw: { meanings: [{ definition, examples }] },
      },
      fullSource: true,
    } as Parameters<typeof buildDictionaryMeaningTranslationRequest>[0]);
    expect(request.content).toHaveLength(161);
    expect(
      request.content.find((item) => item.fieldId === "definition")?.text,
    ).toBe(definition.trim());
    expect(request.content.at(-1)?.text).toBe(examples.at(-1)?.trim());
  });
});

test("part ownership covers the entire Unicode inventory and aggregate rejects missing parts", () => {
  const request = buildDictionaryMeaningTranslationRequest({
    entryId: "large",
    sourceContentFingerprint: "r",
    sourceLanguageCode: "nl",
    targetLanguageCode: "ru",
    fullSource: true,
    word: {
      headword: "woord",
      raw: {
        meanings: [
          {
            definition: "🦆 ".repeat(1000),
            examples: Array.from(
              { length: 150 },
              (_, i) => `zin ${i} ` + "a".repeat(580),
            ),
            idioms: [
              {
                expression: "uitdrukking",
                explanation: "betekenis",
                examples: ["voorbeeld"],
              },
            ],
            note: "slotnoot",
          },
        ],
      },
    },
  });
  const parts = planDictionaryTranslationParts(request);
  expect(parts.length).toBeGreaterThan(1);
  expect(planDictionaryTranslationParts(request)).toEqual(parts);
  for (const field of request.content) {
    const units = parts
      .flatMap((p) =>
        p.owned.map((o, i) => ({ ...o, text: p.request.content[i].text })),
      )
      .filter((u) => u.sourceFieldId === field.fieldId)
      .sort((a, b) => a.segment - b.segment);
    expect(units.map((u) => u.text).join("")).toBe(field.text);
  }
  for (const part of parts) {
    expect(
      part.request.content.length + (part.request.context?.length ?? 0),
    ).toBeLessThanOrEqual(128);
    expect(
      part.request.content.every((f) => Array.from(f.text).length <= 600),
    ).toBe(true);
    const values = [
      ...part.request.content,
      ...(part.request.context ?? []),
    ].flatMap((f) => [f.fieldId, f.role, f.text]);
    expect(
      values.reduce((n, v) => n + new TextEncoder().encode(v).length, 0),
    ).toBeLessThanOrEqual(10000);
  }
  const results = parts.map((part) => ({
    entryTranslation: {
      primaryText: "слово",
      alternativeTexts: [],
      baseText: null,
      note: null,
    },
    contentTranslations: part.request.content.map((f) => ({
      fieldId: f.fieldId,
      text: "перевод " + f.fieldId,
    })),
  }));
  expect(() =>
    aggregateDictionaryTranslationParts(request, parts, results.slice(1)),
  ).toThrow("incomplete");
  const { overlay } = aggregateDictionaryTranslationParts(
    request,
    parts,
    results,
  );
  expect(overlay.meanings?.[0].examples).toHaveLength(150);
  expect(overlay.meanings?.[0].note).toContain("usage-note");
});
test("a small meaning stays a single identical provider request", () => {
  const request = buildDictionaryMeaningTranslationRequest({
    entryId: "small",
    sourceContentFingerprint: "r",
    sourceLanguageCode: "nl",
    targetLanguageCode: "ru",
    fullSource: true,
    word: {
      headword: "woord",
      raw: { meanings: [{ definition: "definitie", examples: ["zin"] }] },
    },
  });
  expect(planDictionaryTranslationParts(request)[0].request).toEqual(request);
  expect(planDictionaryTranslationParts(request)).toHaveLength(1);
});

test("full inventory includes later meanings and preserves their target paths", () => {
  const inventory = buildDictionaryMeaningTranslationInventory({
    entryId: "multi",
    sourceContentFingerprint: "r",
    sourceLanguageCode: "nl",
    targetLanguageCode: "ru",
    word: {
      headword: "woord",
      raw: {
        meanings: [
          { definition: "first" },
          {
            definition: "second",
            examples: ["later example"],
            note: "later note",
            synonyms: ["synoniem"],
          },
        ],
      },
    },
  });
  expect(inventory.content.map((f) => f.fieldId)).toEqual([
    "definition",
    "meaning:1:definition",
    "meaning:1:example:0",
    "meaning:1:synonym:0",
    "meaning:1:usage-note",
  ]);
  const parts = planDictionaryTranslationParts(inventory);
  const results = parts.map((part) => ({
    entryTranslation: {
      primaryText: "слово",
      alternativeTexts: [],
      baseText: null,
      note: null,
    },
    contentTranslations: part.request.content.map((f) => ({
      fieldId: f.fieldId,
      text: f.fieldId,
    })),
  }));
  const { overlay } = aggregateDictionaryTranslationParts(
    inventory,
    parts,
    results,
  );
  expect(overlay.meanings?.[1]).toMatchObject({
    definition: "meaning:1:definition",
    examples: ["meaning:1:example:0"],
    note: "meaning:1:usage-note",
    synonyms: ["meaning:1:synonym:0"],
  });
});
