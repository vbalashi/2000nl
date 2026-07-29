export type Meaning = {
  definition: string;
  context?: string;
  examples?: string[];
  idioms?: Array<
    | string
    | {
        expression?: string;
        explanation?: string;
        examples?: string[];
      }
  >;
  synonyms?: string[];
  antonyms?: string[];
  related_terms?: string[];
  usage_labels?: string[];
  grammar?: Record<string, boolean | string | string[]>;
  pronunciation_note?: string;
  note?: string;
  cross_references?: Array<{
    headword: string;
    meaning_id?: number;
  }>;
  [key: string]: unknown;
};

export type AlternateHeadword =
  | string
  | {
      headword: string;
      pronunciation?: string;
      gender?: string;
      plural?: string;
    };

export type Note = {
  headword: string;
  pronunciation?: string;
  pronunciation_with_stress?: string;
  gender?: string;
  part_of_speech?: string;
  part_of_speech_evidence?: {
    normalized_pos_status: "known" | "source-none" | "unresolved";
    source: string;
    raw_value: string;
  };
  plural?: string;
  diminutive?: string;
  verb_forms?: string | string[];
  conjugation_table?: Record<string, unknown> | null;
  inflected_form?: string;
  comparative?: string;
  superlative?: string;
  derivations?: string;
  alternate_headwords?: AlternateHeadword[];
  cross_reference?: string | null;
  is_nt2_2000?: boolean;
  meanings: Meaning[];
  audio_links?: Record<string, string | null>;
  images?: string[];
  reference_tables?: Array<{
    title: string;
    rows: Array<{ label: string; value: string }>;
  }>;
  source_identity?: {
    provider_article_id: string;
    homograph_number?: number;
  };
  _source?: {
    identity_scheme_version: string;
    identity_evidence: Record<string, unknown>;
    provider_article_id: string;
    source_group_key: string;
    source_entry_key: string;
    source_index: number;
    sense_ordinal: number;
    normalized_pos_status: "known" | "source-none" | "unresolved";
    pos_evidence: {
      normalized_pos_status: "known" | "source-none" | "unresolved";
      source: string;
      raw_value: string;
    };
    homograph_number?: number;
  };
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

export type {
  CardRef,
  CardTypeId as PlatformCardTypeId,
  DictionaryEntryEnvelope,
  DictionaryEntryRef,
  DictionaryKind,
  DictionaryLookupRequest,
  DictionaryLookupResult,
  DictionaryMeaningContent,
  DictionarySchemaFeature,
  DictionarySchemaSummary,
  DictionarySummary,
  DictionaryVisibility,
  EntryListItemRef,
  EntryListKind,
  EntryListSummary,
  LookupActionId,
  LookupIntent,
  PlatformCardCapability,
  PlatformCardCapabilityPhase,
  PlatformLookupMatch,
  PlatformLookupMatchRelation,
  PlatformSessionApiResponse,
  PlatformTextTranslationApiRequest,
  PlatformTextTranslationApiResponse,
  PlatformTranslationApiRequest,
  PlatformTranslationApiResponse,
  UserCardSchedulingState,
  UserCardState,
  UserCardStateRef,
  UserCardTelemetry,
} from "./platform";

export type * from "./platformV2";
