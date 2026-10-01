// Disposable interaction model. Fixture data only; not a scheduler/API contract.
export const parts = ["Nouns", "Verbs", "Adjectives", "Adverbs", "Pronouns", "Prepositions", "Conjunctions", "Numerals", "Articles", "Interjections"] as const;
export type Part = typeof parts[number];
export type Exercise = "Words" | "Idioms" | "Translation";
export type Direction = "Direct" | "Reverse";
export type Draft = {
  language: "Dutch" | "English";
  source: string;
  types: Exercise[];
  directions: Direction[];
  mode: "Reveal & self-rate" | "Type the answer";
  parts: Part[];
  article: "de" | "het" | null;
  size: number;
  balance: number;
};
export const initialDraft: Draft = {language: "Dutch", source: "core", types: ["Words"], directions: ["Direct"], mode: "Reveal & self-rate", parts: [], article: null, size: 20, balance: 4};
export const balances = ["Reviews only", "1 new : 20 reviews", "1 new : 10 reviews", "1 new : 5 reviews", "1 new : 3 reviews", "1 new : 2 reviews", "1 new : 1 review", "New only"];
export const sources = [
  {id: "english-core", name: "Everyday English", kind: "Collection", count: 24, language: "English"},
  {id: "english-all", name: "English dictionary", kind: "Dictionary", count: 48, language: "English"},
  {id: "core", name: "Core vocabulary", kind: "Collection", count: 36, language: "Dutch"},
  {id: "all", name: "Dutch dictionary", kind: "Dictionary", count: 72, language: "Dutch"},
  ...Array.from({length: 100}, (_, i) => ({id: `collection-${i}`, name: `${["At home", "On the road", "Work & study", "Food & cooking", "Everyday conversations"][i % 5]} ${String(i + 1).padStart(2, "0")}`, kind: "Collection", count: 8 + i % 16, language: "Dutch"})),
];
export const meanings = Array.from({length: 72}, (_, i) => ({
  id: `fixture-meaning-${i}`, part: (i % 12 < 10 ? parts[i % 12] : null),
  article: i % 12 === 0 ? (["de", "het", "mixed", null] as const)[Math.floor(i / 12) % 4] : null,
  types: ["Words", ...(i % 3 === 0 ? ["Idioms"] : []), ...(i % 2 === 0 ? ["Translation"] : [])] as Exercise[],
}));
export function matchMeanings(draft: Draft) {
  const source = sources.find(s => s.id === draft.source)!;
  return meanings.slice(0, source.count).filter(m =>
    draft.types.some(t => m.types.includes(t)) &&
    (!draft.parts.length || (m.part !== null && draft.parts.includes(m.part) &&
      (m.part !== "Nouns" || !draft.article || m.article === draft.article)))
  ).map(m => ({...m, id: `${draft.language.toLowerCase()}-${m.id}`}));
}
export function toggleRequired<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.length === 1 ? values : values.filter(v => v !== value) : [...values, value];
}
