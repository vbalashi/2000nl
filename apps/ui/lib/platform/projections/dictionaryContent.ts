import type { LookupTranslationArtifact } from "../translationService";
import crypto from "crypto";

type DictionaryLookupPayload = {
  id: string;
  dictionary_id?: string | null;
  language_code?: string | null;
  headword: string;
  meaning_id?: number | null;
  part_of_speech?: string | null;
  gender?: string | null;
  raw: unknown;
};

export function contentFingerprint(content: unknown) {
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

export function normalizeDictionaryContent(
  entry: DictionaryLookupPayload,
  translation?: LookupTranslationArtifact | null,
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string");
  return items.length ? items : undefined;
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
