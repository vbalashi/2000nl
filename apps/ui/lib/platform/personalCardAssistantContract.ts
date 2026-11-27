import { getInterfaceCatalog } from "@/lib/i18n/catalog";
import type { PersonalField } from "@/lib/training/personalArticleClient";
export const kinds = [
  "headword",
  "definition",
  "example",
  "note",
  "synonym",
  "reference",
  "expression",
  "partOfSpeech",
] as const;
export type Suggestion = { kind: (typeof kinds)[number]; text: string; replaces?: { ordinal: number; text: string } };
export type AssistantArticle = {
  kind?: "word" | "expression";
  nounArticle?: "de" | "het" | null;
  partOfSpeech: string | null;
  senses: { definition: string; fields: PersonalField[] }[];
};
export type SourceHit = {
  example?: string;
  entryId: string;
  dictionaryId: string;
  dictionary: string;
  word: string;
  definition: string;
};
export type AssistantReply = {
  mode: "provider" | "dictionary" | "preview";
  message: string;
  suggestions: Suggestion[];
  sources?: SourceHit[];
  searched?: boolean;
  cardDraft?: boolean;
};
export type AssistantTurn = { role: "user" | "assistant"; text: string };
export function assistantLabels(language: string) {
  return getInterfaceCatalog(language).features.personalAssistant;
}
