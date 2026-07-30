import crypto from "node:crypto";
import type {
  PlatformContentNodeKindV2,
  PlatformSemanticTermV2,
  PlatformWordDetailsV2,
} from "../../../../packages/shared/types/platformV2";
import type { DictionaryLookupPayload } from "./lookupService";
import type { PlatformContentNodeBindingV2Input } from "./projections/senseCardV2";

export type PlatformV2ContentSectionInput = {
  sourcePath: string;
  kind: PlatformContentNodeKindV2;
  text: string;
};

export function extractPlatformV2ContentSections(
  entry: DictionaryLookupPayload,
): PlatformV2ContentSectionInput[] {
  const raw = asRecord(entry.raw);
  const meanings = Array.isArray(raw.meanings) ? raw.meanings : [];
  const sections: PlatformV2ContentSectionInput[] = [];
  const push = (
    sourcePath: string,
    kind: PlatformContentNodeKindV2,
    value: unknown,
  ) => {
    const text = asString(value);
    if (text) sections.push({ sourcePath, kind, text });
  };

  meanings.forEach((meaning, meaningIndex) => {
    const item = asRecord(meaning);
    const prefix = `raw.meanings[${meaningIndex}]`;
    push(`${prefix}.definition`, "definition", item.definition ?? item.text);
    push(`${prefix}.context`, "usage-pattern", item.context);
    asStringArray(item.examples).forEach((example, exampleIndex) => {
      push(`${prefix}.examples[${exampleIndex}]`, "example", example);
    });
    const idioms = Array.isArray(item.idioms) ? item.idioms : [];
    idioms.forEach((idiom, idiomIndex) => {
      const idiomPath = `${prefix}.idioms[${idiomIndex}]`;
      if (typeof idiom === "string") {
        push(idiomPath, "idiom", idiom);
        return;
      }
      const idiomRecord = asRecord(idiom);
      push(idiomPath, "idiom", idiomRecord.expression);
      push(
        `${idiomPath}.explanation`,
        "idiom-explanation",
        idiomRecord.explanation,
      );
      asStringArray(idiomRecord.examples).forEach(
        (example, exampleIndex) => {
          push(
            `${idiomPath}.examples[${exampleIndex}]`,
            "example",
            example,
          );
        },
      );
    });
    push(`${prefix}.note`, "usage-note", item.note);
  });

  if (sections.length === 0) {
    push("raw.definition", "definition", raw.definition ?? raw.notes);
    const legacyExample = asRecord(raw.example);
    push("raw.example.source", "example", legacyExample.source);
  }
  return sections;
}

export function platformV2CrossReferenceQuery(
  entry: DictionaryLookupPayload,
): string | null {
  const crossReference = asRecord(entry.raw).cross_reference;
  if (typeof crossReference === "string") return asString(crossReference);
  return asString(asRecord(crossReference).headword);
}

export function projectPlatformV2WordDetails(
  entry: DictionaryLookupPayload,
  bindings: PlatformContentNodeBindingV2Input[],
): PlatformWordDetailsV2 | null {
  const raw = asRecord(entry.raw);
  const meanings = Array.isArray(raw.meanings) ? raw.meanings : [];
  const meaning = asRecord(meanings[0]);
  const bindingByPath = new Map(
    bindings.map((binding) => [binding.sourcePath, binding]),
  );
  const lexicalRelations = [
    ...relationItems(entry.id, "synonym", meaning.synonyms),
    ...relationItems(entry.id, "antonym", meaning.antonyms),
  ];
  const labels = uniqueStrings(meaning.usage_labels).map((label) =>
    semanticTerm("wordDetails.usageLabel", label),
  );
  const grammarNotes = Object.entries(asRecord(meaning.grammar)).flatMap(
    ([key, value]) => {
      const text = displayGrammarValue(key, value);
      return text
        ? [
            {
              detailId: stableId(entry.id, "grammar", key, text),
              text,
            },
          ]
        : [];
    },
  );
  const note = asString(meaning.note);
  const notePath = "raw.meanings[0].note";
  const usageNotes = note
    ? [
        {
          detailId: stableId(entry.id, "usage-note", note),
          text: note,
          ...(bindingByPath.get(notePath)
            ? { contentNodeId: bindingByPath.get(notePath)!.contentNodeId }
            : {}),
        },
      ]
    : [];
  const pronunciationNote = asString(meaning.pronunciation_note);
  const pronunciationNotes = pronunciationNote
    ? [
        {
          detailId: stableId(
            entry.id,
            "pronunciation-note",
            pronunciationNote,
          ),
          text: pronunciationNote,
        },
      ]
    : [];
  const forms = projectForms(entry.id, raw);
  const references = projectReferences(entry.id, meaning, raw);

  if (
    lexicalRelations.length === 0 &&
    labels.length === 0 &&
    grammarNotes.length === 0 &&
    usageNotes.length === 0 &&
    pronunciationNotes.length === 0 &&
    forms.length === 0 &&
    references.length === 0
  ) {
    return null;
  }

  return {
    entryId: entry.id,
    lexicalRelations,
    labels,
    grammarNotes,
    usageNotes,
    pronunciationNotes,
    forms,
    references,
  };
}

export function platformV2ContentRevision(
  entryId: string,
  contentSections: PlatformV2ContentSectionInput[],
  wordDetails: PlatformWordDetailsV2 | null,
  crossReferenceQuery: string | null,
) {
  return crypto
    .createHash("sha256")
    .update(
      stableJson({
        entryId,
        contentSections,
        wordDetails,
        crossReferenceQuery,
      }),
    )
    .digest("hex");
}

function relationItems(
  entryId: string,
  kind: "synonym" | "antonym",
  value: unknown,
): PlatformWordDetailsV2["lexicalRelations"] {
  return uniqueStrings(value).map((text) => ({
    relationId: stableId(entryId, "lexical-relation", kind, text),
    kind,
    text,
  }));
}

function projectForms(
  entryId: string,
  raw: Record<string, unknown>,
): PlatformWordDetailsV2["forms"] {
  const forms: PlatformWordDetailsV2["forms"] = [];
  const push = (
    kind: string,
    value: unknown,
    features: PlatformSemanticTermV2[] = [],
  ) => {
    const text = asString(value);
    if (!text) return;
    forms.push({
      formId: stableId(entryId, "form", kind, text),
      kind: semanticTerm("wordDetails.form", kind),
      text,
      features,
    });
  };

  push("plural", raw.plural);
  push("diminutive", raw.diminutive);
  push("verbForms", raw.verb_forms);
  push("inflectedForm", raw.inflected_form);
  push("comparative", raw.comparative);
  push("superlative", raw.superlative);
  push("derivation", raw.derivations);

  const alternateHeadwords = Array.isArray(raw.alternate_headwords)
    ? raw.alternate_headwords
    : [];
  for (const alternate of alternateHeadwords) {
    if (typeof alternate === "string") {
      push("alternateHeadword", alternate);
      continue;
    }
    const record = asRecord(alternate);
    const features: PlatformSemanticTermV2[] = [];
    const gender = asString(record.gender);
    const plural = asString(record.plural);
    if (gender) {
      features.push(semanticTerm("wordDetails.feature.gender", gender));
    }
    if (plural) {
      features.push(semanticTerm("wordDetails.feature.plural", plural));
    }
    push("alternateHeadword", record.headword, features);
  }
  return forms;
}

function projectReferences(
  entryId: string,
  meaning: Record<string, unknown>,
  raw: Record<string, unknown>,
): PlatformWordDetailsV2["references"] {
  const references: PlatformWordDetailsV2["references"] = [];
  const senseReferences = Array.isArray(meaning.cross_references)
    ? meaning.cross_references
    : [];
  for (const reference of senseReferences) {
    const record = asRecord(reference);
    const text =
      typeof reference === "string"
        ? asString(reference)
        : asString(record.headword);
    if (!text) continue;
    references.push({
      referenceId: stableId(entryId, "reference", "headword", text),
      kind: semanticTerm("wordDetails.reference", "headword"),
      text,
    });
  }

  const tables = Array.isArray(raw.reference_tables)
    ? raw.reference_tables
    : [];
  for (const table of tables) {
    const tableRecord = asRecord(table);
    const title = asString(tableRecord.title);
    const rows = Array.isArray(tableRecord.rows) ? tableRecord.rows : [];
    for (const row of rows) {
      const rowRecord = asRecord(row);
      const label = asString(rowRecord.label);
      const value = asString(rowRecord.value);
      const text = [label, value].filter(Boolean).join(": ");
      if (!text) continue;
      references.push({
        referenceId: stableId(
          entryId,
          "reference-table",
          title ?? "",
          text,
        ),
        kind: semanticTerm("wordDetails.reference", "table"),
        text,
      });
    }
  }
  return references;
}

function semanticTerm(
  namespace: string,
  value: string,
): PlatformSemanticTermV2 {
  const controlledValue =
    namespace === "wordDetails.form" ||
    namespace === "wordDetails.reference";
  return {
    termId: controlledValue
      ? `${namespace}.${value}`
      : `${namespace}.${stableId(value).slice(0, 16)}`,
    messageKey: controlledValue
      ? `${namespace}.${value}`
      : namespace,
    sourceValue: value,
  };
}

function displayGrammarValue(key: string, value: unknown) {
  const values = Array.isArray(value)
    ? value.map(asString).filter((item): item is string => Boolean(item))
    : [asString(value)].filter((item): item is string => Boolean(item));
  return values.length ? values.join(", ") : null;
}

function uniqueStrings(value: unknown) {
  return Array.from(new Set(asStringArray(value)));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter((item): item is string => Boolean(item));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stableId(...parts: string[]) {
  return crypto
    .createHash("sha256")
    .update(parts.join("\u001f"))
    .digest("hex");
}

function stableJson(value: unknown): string {
  if (value === undefined || value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}
