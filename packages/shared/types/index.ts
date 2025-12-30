export type Meaning = {
  definition: string;
  context?: string;
  examples?: string[];
  idioms?: string[];
  [key: string]: unknown;
};

export type Note = {
  headword: string;
  pronunciation?: string;
  pronunciation_with_stress?: string;
  gender?: string;
  part_of_speech?: string;
  plural?: string;
  diminutive?: string;
  verb_forms?: string;
  conjugation_table?: Record<string, unknown> | null;
  inflected_form?: string;
  comparative?: string;
  superlative?: string;
  derivations?: string;
  alternate_headwords?: string[];
  cross_reference?: string | null;
  is_nt2_2000?: boolean;
  meanings: Meaning[];
  audio_links?: Record<string, string>;
  images?: string[];
  _metadata?: Record<string, unknown>;
  meaning_id?: number | null;
  [key: string]: unknown;
};

export type CardTypeId = "word-to-definition" | "definition-to-word" | string;

export type CardType = {
  id: CardTypeId;
  label: string;
  description?: string;
  prompt: {
    language: string;
    fields: string[];
    audio?: string | null;
    [key: string]: unknown;
  };
  reveal: {
    fields: string[];
    [key: string]: unknown;
  };
  input_mode?: "multiple-choice" | "type-in" | "show-answer";
  [key: string]: unknown;
};

export type DictionaryMeta = {
  code: string;
  language: string;
  name: string;
  source?: string;
  version?: string;
};
