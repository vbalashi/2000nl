import type { LookupTranslationArtifact } from "../translationService";
import type { DictionaryLookupPayload } from "../lookupService";
import crypto from "crypto";
import fs from "fs";
import path from "path";

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
  const legacyExample = asString(asRecord(raw.example).source);
  const legacyNote =
    typeof raw.notes === "string" && raw.notes !== fallbackDefinition
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
        ? normalizeAudioLinks(raw.audio_links)
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
      legacyExample,
      legacyNote,
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

export function normalizeAudioLinks(value: unknown) {
  const links = asRecord(value);
  const normalized: Record<string, string> = {};

  for (const [key, link] of Object.entries(links)) {
    if (typeof link !== "string" || !link.trim()) continue;
    const trimmed = link.trim();
    if (isLocalAudioLink(trimmed) && !localAudioAssetExists(trimmed)) continue;
    normalized[key] = trimmed;
  }

  return Object.keys(normalized).length ? normalized : undefined;
}

export async function verifyDictionaryContentAudioLinks<
  T extends { audioLinks?: Record<string, string> },
>(content: T): Promise<T> {
  const audioLinks = await verifiedAudioLinks(content.audioLinks);
  if (audioLinks === content.audioLinks) return content;
  return {
    ...content,
    audioLinks,
  };
}

async function verifiedAudioLinks(value: unknown) {
  const links = asRecord(value);
  const verified: Record<string, string> = {};
  let changed = false;

  for (const [key, link] of Object.entries(links)) {
    if (typeof link !== "string" || !link.trim()) continue;
    const trimmed = link.trim();
    if (isLocalAudioLink(trimmed) && !(await localAudioAssetIsPlayable(trimmed))) {
      changed = true;
      continue;
    }
    verified[key] = trimmed;
  }

  const next = Object.keys(verified).length ? verified : undefined;
  if (!changed && next && Object.keys(next).length === Object.keys(links).length) {
    return value as Record<string, string>;
  }
  return next;
}

export function localAudioAssetExists(publicUrlPath: string) {
  if (!isLocalAudioLink(publicUrlPath)) return true;

  const pathname = new URL(publicUrlPath, "http://localhost").pathname;
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return false;
  }

  const relativePath = decodedPath.replace(/^\/+/, "");
  if (relativePath.split(/[\\/]/).includes("..")) return false;

  const publicRoot = path.resolve(
    process.env.PLATFORM_AUDIO_PUBLIC_ROOT || path.join(process.cwd(), "public"),
  );
  if (!localAudioRootCanBeInspected(publicRoot)) return true;

  const candidatePath = path.resolve(publicRoot, relativePath);
  if (
    candidatePath !== publicRoot &&
    !candidatePath.startsWith(`${publicRoot}${path.sep}`)
  ) {
    return false;
  }

  try {
    return fs.statSync(candidatePath).isFile();
  } catch {
    return false;
  }
}

async function localAudioAssetIsPlayable(publicUrlPath: string) {
  const publicRoot = path.resolve(
    process.env.PLATFORM_AUDIO_PUBLIC_ROOT || path.join(process.cwd(), "public"),
  );
  if (localAudioRootCanBeInspected(publicRoot)) {
    return localAudioAssetExists(publicUrlPath);
  }
  if (process.env.PLATFORM_AUDIO_PUBLIC_ROOT) return localAudioAssetExists(publicUrlPath);
  return publicAudioAssetExists(publicUrlPath);
}

function isLocalAudioLink(link: string) {
  return link.startsWith("/audio/");
}

function localAudioRootCanBeInspected(publicRoot: string) {
  const audioRoot = path.join(publicRoot, "audio");
  try {
    return fs.statSync(audioRoot).isDirectory();
  } catch {
    return Boolean(process.env.PLATFORM_AUDIO_PUBLIC_ROOT);
  }
}

const publicAudioChecks = new Map<string, { ok: boolean; expiresAt: number }>();
const PUBLIC_AUDIO_CHECK_TTL_MS = 5 * 60 * 1000;

async function publicAudioAssetExists(publicUrlPath: string) {
  const base = publicAudioBaseUrl();
  if (!base) return true;
  let url: string;
  try {
    url = new URL(publicUrlPath, base).toString();
  } catch {
    return false;
  }

  const cached = publicAudioChecks.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.ok;

  const ok = await publicAudioHeadOk(url);
  publicAudioChecks.set(url, {
    ok,
    expiresAt: Date.now() + PUBLIC_AUDIO_CHECK_TTL_MS,
  });
  return ok;
}

async function publicAudioHeadOk(url: string) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return true;
  }
}

function publicAudioBaseUrl() {
  const configured =
    process.env.PLATFORM_AUDIO_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.NODE_ENV === "production" ? "https://2000.dilum.io" : "");
  return configured.replace(/\/+$/, "");
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
    const firstMeaning = asRecord(meanings[0]);
    if (sourcePath === "raw.definition") {
      return asString(overlay.definition) ?? asString(firstMeaning.definition);
    }
    if (sourcePath === "raw.example.source") {
      const examples = Array.isArray(firstMeaning.examples) ? firstMeaning.examples : [];
      return asString(examples[0]);
    }
    if (sourcePath === "raw.notes") {
      return asString(firstMeaning.context) ?? asString(firstMeaning.note);
    }
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
  fallbackExample?: string | null,
  fallbackNote?: string | null,
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
  if (rawMeanings.length === 0 && fallbackExample) {
    const overlayTranslation = overlayTranslationAtSourcePath(
      translationOverlay,
      "raw.example.source",
    );
    sections.push({
      id: "example-1-1",
      sourcePath: "raw.example.source",
      kind: "example",
      text: fallbackExample,
      ...(overlayTranslation ? { translation: overlayTranslation } : {}),
    });
  }
  if (rawMeanings.length === 0 && fallbackNote) {
    const overlayTranslation = overlayTranslationAtSourcePath(
      translationOverlay,
      "raw.notes",
    );
    sections.push({
      id: "note-1",
      sourcePath: "raw.notes",
      kind: "note",
      text: fallbackNote,
      ...(overlayTranslation ? { translation: overlayTranslation } : {}),
    });
  }

  return sections;
}
