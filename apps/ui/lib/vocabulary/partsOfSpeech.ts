/** labelKey identifies a localized ui.builder.parts message, never literal display copy.
 * One display/catalog identity for Library and training; adapters keep their wire formats. */
export const VOCABULARY_PARTS = [
 {id:"noun",code:"zn",labelKey:"Nouns"}, {id:"verb",code:"ww",labelKey:"Verbs"},
 {id:"adjective",code:"bn",labelKey:"Adjectives"}, {id:"adverb",code:"bw",labelKey:"Adverbs"},
 {id:"pronoun",code:"vnw",labelKey:"Pronouns"}, {id:"preposition",code:"vz",labelKey:"Prepositions"},
 {id:"conjunction",code:"vw",labelKey:"Conjunctions"}, {id:"numeral",code:"tw",labelKey:"Numerals"},
 {id:"article",code:"lidw",labelKey:"Articles"}, {id:"interjection",code:"tsw",labelKey:"Interjections"},
 {id:"abbreviation",code:"afk",labelKey:"Abbreviations"}, {id:"prefix",code:"vv",labelKey:"Prefixes"},
] as const;
export type VocabularyPart = typeof VOCABULARY_PARTS[number]["id"];
export type VocabularyPartCode = typeof VOCABULARY_PARTS[number]["code"];
export const VOCABULARY_PART_LABELS = Object.fromEntries(VOCABULARY_PARTS.map(part=>[part.id,part.labelKey])) as Record<VocabularyPart,typeof VOCABULARY_PARTS[number]["labelKey"]>;
export function partCode(id:VocabularyPart):VocabularyPartCode { return VOCABULARY_PARTS.find(part=>part.id===id)!.code; }
export function partId(code:string):VocabularyPart|undefined { return VOCABULARY_PARTS.find(part=>part.code===code||part.id===code)?.id; }
