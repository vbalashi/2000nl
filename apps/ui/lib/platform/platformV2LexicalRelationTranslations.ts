import crypto from "node:crypto";
import type { PlatformWordDetailsV2 } from "../../../../packages/shared/types/platformV2";
import { dictionaryLexicalRelationTexts } from "../dictionary/lexicalRelations";

type RelationTranslation = NonNullable<PlatformWordDetailsV2["lexicalRelations"][number]["translations"]>[number];
export type LexicalRelationTranslations = Map<string, RelationTranslation[]>;

export function lexicalRelationId(entryId: string, kind: string, text: string) {
  return crypto.createHash("sha256").update([entryId, "lexical-relation", kind, text].join("\u001f")).digest("hex");
}

export function lexicalRelationTextFingerprint(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/** Called only after the owning entry overlay passes source/policy freshness. */
export function projectLexicalRelationTranslations(params: {
  entryId: string;
  meaning: unknown;
  overlay: unknown;
  identity: Omit<RelationTranslation, "sourceTextFingerprint" | "text">;
}): LexicalRelationTranslations {
  const source = record(params.meaning);
  const overlay = record(params.overlay);
  const translated = record(Array.isArray(overlay.meanings) ? overlay.meanings[0] : null);
  const result: LexicalRelationTranslations = new Map();
  for (const kind of ["synonym", "antonym"] as const) {
    const key = `${kind}s`;
    const values = translated[key];
    dictionaryLexicalRelationTexts(source[key]).forEach((text, index) => {
      const candidate = Array.isArray(values) ? values[index] : null;
      const translation = params.identity.status === "ready" && typeof candidate === "string" && candidate.trim()
        ? candidate.trim() : null;
      const relationId = lexicalRelationId(params.entryId, kind, text);
      result.set(relationId, [{
        ...params.identity,
        translationId: crypto.createHash("sha256").update([params.identity.translationId, "lexical-relation", relationId].join("\u001f")).digest("hex"),
        status: params.identity.status === "ready" && !translation ? "not-available" : params.identity.status,
        sourceTextFingerprint: lexicalRelationTextFingerprint(text),
        ...(translation ? { text: translation } : {}),
      }]);
    });
  }
  return result;
}

export function withLexicalRelationTranslations(
  details: PlatformWordDetailsV2 | null,
  translations?: LexicalRelationTranslations,
): PlatformWordDetailsV2 | null {
  if (!details || !translations?.size) return details;
  return { ...details, lexicalRelations: details.lexicalRelations.map(relation => ({
    ...relation,
    translations: translations.get(relation.relationId) ?? [],
  })) };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
