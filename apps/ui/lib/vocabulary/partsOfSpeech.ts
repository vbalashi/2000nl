/** One display/catalog identity for Library and training; adapters keep their wire formats. */
export const VOCABULARY_PARTS = [
 {id:"noun",code:"zn",label:"Nouns"}, {id:"verb",code:"ww",label:"Verbs"},
 {id:"adjective",code:"bn",label:"Adjectives"}, {id:"adverb",code:"bw",label:"Adverbs"},
 {id:"pronoun",code:"vnw",label:"Pronouns"}, {id:"preposition",code:"vz",label:"Prepositions"},
 {id:"conjunction",code:"vw",label:"Conjunctions"}, {id:"numeral",code:"tw",label:"Numerals"},
 {id:"article",code:"lidw",label:"Articles"}, {id:"interjection",code:"tsw",label:"Interjections"},
 {id:"abbreviation",code:"afk",label:"Abbreviations"}, {id:"prefix",code:"vv",label:"Prefixes"},
] as const;
export type VocabularyPart = typeof VOCABULARY_PARTS[number]["id"];
export type VocabularyPartCode = typeof VOCABULARY_PARTS[number]["code"];
export const VOCABULARY_PART_LABELS = Object.fromEntries(VOCABULARY_PARTS.map(part=>[part.id,part.label])) as Record<VocabularyPart,typeof VOCABULARY_PARTS[number]["label"]>;
export function partCode(id:VocabularyPart):VocabularyPartCode { return VOCABULARY_PARTS.find(part=>part.id===id)!.code; }
export function partId(code:string):VocabularyPart|undefined { return VOCABULARY_PARTS.find(part=>part.code===code||part.id===code)?.id; }
