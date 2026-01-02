export type TrainingMode = "word-to-definition" | "definition-to-word";
export type CardFilter = "new" | "review" | "both";
export type QueueTurn = "new" | "review" | "auto";

export type WordRaw = {
  headword?: string;
  meanings?: Array<{
    definition?: string;
    context?: string;
    example?: string; // Legacy field, might still be populating
    examples?: string[]; // New array field
    idioms?: Array<{ expression: string; explanation: string }>;
    links?: Array<{ label?: string; headword?: string }>;
  }>;
  links?: Array<{ label?: string; headword?: string }>;
  meaning_id?: number;
};

export type DebugStats = {
  /** Source queue: 'new' | 'learning' | 'review' | 'practice' | 'fallback' | 'click' */
  source: string;
  mode?: TrainingMode;
  next_review?: string;
  interval?: number;
  reps?: number;
  ef?: number;
  clicks?: number;
  overdue_count?: number;
  reason?: string;
  /** Number of new cards introduced today */
  new_today?: number;
  /** Daily limit for new cards */
  daily_new_limit?: number;
  /** Number of unseen words available */
  new_pool_size?: number;
  /** Number of learning cards due now */
  learning_due_count?: number;
  /** Size of review pool (max 10) */
  review_pool_size?: number;
  /** Interval before the review (for displaying change) */
  previousInterval?: number;
  /** Stability before the review (for displaying change) */
  previousStability?: number;
};

export type TrainingWord = {
  id: string;
  headword: string;
  part_of_speech?: string;
  gender?: string;
  raw: WordRaw;
  vandaleId?: number;
  debugStats?: DebugStats;
  is_nt2_2000?: boolean;
  meanings_count?: number;
  /** The mode this card should be trained in (returned by RPC for multi-mode training) */
  mode?: TrainingMode;
};

export type DictionaryEntry = {
  id: string;
  headword: string;
  part_of_speech?: string;
  gender?: string;
  raw: WordRaw;
  is_nt2_2000?: boolean;
  meanings_count?: number;
};

export type ReviewResult = "fail" | "hard" | "success" | "easy" | "freeze" | "hide";
export type HistorySource = "click" | "review";

export type SidebarHistoryItem = DictionaryEntry & {
  source: HistorySource;
  result?: "fail" | "hard" | "success" | "easy" | "neutral";
  clickedWord?: string;
  stats?: {
    click_count: number;
    last_seen_at: string | null;
  };
  debugStats?: DebugStats;
};

export type WordListType = "curated" | "user";

export type WordListSummary = {
  id: string;
  name: string;
  type: WordListType;
  description?: string | null;
  language_code?: string | null;
  item_count?: number;
  is_primary?: boolean;
  created_at?: string;
};

export type WordEntrySearchResult = {
  items: DictionaryEntry[];
  total: number;
  /** True if results are capped due to subscription tier (free = 100 words) */
  isLocked?: boolean;
  /** Maximum words allowed for current tier (null = unlimited) */
  maxAllowed?: number | null;
};

export type DetailedStats = {
  // New cards today
  newWordsToday: number;      // Distinct new words introduced today
  newCardsToday: number;      // Total new card reviews today
  dailyNewLimit: number;      // Target (default 10)
  
  // Review progress today (done/scheduled format)
  reviewWordsDone: number;    // Distinct words reviewed (non-new) today
  reviewCardsDone: number;    // Review card count today
  reviewWordsDue: number;     // Words due for review (including learning)
  reviewCardsDue: number;     // Cards due for review (including learning)
  
  // Total progress
  totalWordsLearned: number;  // Words with FSRS state
  totalWordsInList: number;   // Total words in scope
};

/** Training scenario: aggregates multiple card modes into one user-facing concept */
export type TrainingScenario = {
  id: string;                     // 'understanding', 'listening', 'conjugation'
  nameEn: string;                 // English display name
  nameNl?: string;                // Dutch display name
  description?: string;           // Description of what this scenario trains
  cardModes: string[];            // Array of mode strings (internal)
  graduationThreshold: number;    // MIN stability (days) to consider word "learned"
  enabled: boolean;               // Whether this scenario is available
  sortOrder: number;              // Display order
};

/** Scenario-level statistics for dashboard display */
export type ScenarioStats = {
  learned: number;      // Words with MIN(stability) >= threshold across all cards
  inProgress: number;   // Words with at least one card started but not graduated
  new: number;          // Words with no cards started
  total: number;        // Total words in scope
  scenarioId: string;   // Which scenario these stats are for
  cardModes: string[];  // Card modes included in this scenario
  graduationThreshold: number; // Threshold used for "learned" classification
};

export type TranslationOverlay = {
  headword?: string;
  meanings?: Array<{
    definition?: string;
    context?: string;
    examples?: string[];
    idioms?: Array<string | { expression?: string; explanation?: string }>;
  }>;
};

export type WordEntryTranslationStatus = "pending" | "ready" | "failed";

export type WordEntryTranslation = {
  word_entry_id: string;
  target_lang: string;
  provider: string;
  status: WordEntryTranslationStatus;
  overlay: TranslationOverlay | null;
  source_fingerprint: string | null;
  error_message: string | null;
  created_at?: string;
  updated_at?: string;
};

export type UserWordNote = {
  id?: string;
  user_id: string;
  word_entry_id: string;
  notes: string;
  created_at?: string;
  updated_at?: string;
};
