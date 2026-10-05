/** Grammatical row order is presentation semantics, never JSON key order. */
const personOrders: Record<string, readonly string[]> = {
  nl: ["ik", "jij", "u", "hij_zij_het", "wij", "jullie", "zij"],
  en: ["i", "you", "he_she_it", "we", "they"],
  fr: ["je", "tu", "il_elle", "nous", "vous", "ils_elles"],
  de: ["ich", "du", "er_sie_es", "wir", "ihr", "sie"],
};

export function orderedConjugationPersons(
  persons: readonly string[],
  contentLanguage?: string,
): string[] {
  const unique = [...new Set(persons)];
  const language = contentLanguage?.toLowerCase().split(/[-_]/)[0];
  // Older callers omit the language; recognize only unambiguous fixture keys.
  const inferred = ["nl", "en", "fr", "de"].find((code) =>
    unique.some((person) => person === personOrders[code][0] || person === `dat_${personOrders[code][0]}`),
  );
  const order = personOrders[language ?? inferred ?? ""];
  if (!order) return unique;
  // Van Dale puts subordinate-clause forms directly after the same person.
  const keys = order.flatMap((person) => language === "nl" || (!language && inferred === "nl")
    ? [person, `dat_${person}`] : [person]);
  const rank = new Map(keys.map((person, index) => [person, index]));
  // Unknown keys remain visible, in their original relative order, at the end.
  return unique.sort((a, b) => (rank.get(a) ?? keys.length) - (rank.get(b) ?? keys.length));
}

export function conjugationPersonLabel(person: string): string {
  const subordinate = person.startsWith("dat_");
  const base = subordinate ? person.slice(4) : person;
  return `${subordinate ? "dat " : ""}${base.replaceAll("_", " / ")}`;
}

export function orderedConjugationValues(
  forms: Record<string, string>,
  contentLanguage?: string,
): string[] {
  return orderedConjugationPersons(Object.keys(forms), contentLanguage).map((person) => forms[person]);
}
