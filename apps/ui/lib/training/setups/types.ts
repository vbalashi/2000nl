import type { SourceWordStatus } from "@/lib/training/sourceWordSelection";
import type {VocabularySelection,LibraryTrainingSelection} from "@/lib/vocabulary/selection";
import type {
  CardFilter, DutchNounArticle, DutchTrainingPartOfSpeech, TrainingDateWindow,
  TrainingExerciseFamily, TrainingMode, TrainingSessionSize,
} from "@/lib/types";

export type TrainingSetupDraft = {
  /** One content family per v1 session; omitted legacy drafts are ordinary words. */
  family?: TrainingExerciseFamily;
  scenarioId: string;
  modes: TrainingMode[];
  cardFilter: CardFilter;
  listValue: string;
  /** Absent is the legacy one-collection preset. */
  materialMode?: "collection" | "all-dictionaries" | "selected-dictionaries";
  dictionaryIds?: string[];
  newReviewRatio: number;
  dateWindow: TrainingDateWindow;
  daysAgo?: number;
  sourceValue: string;
  /** Maximum unique card targets for this session; omitted by old callers. */
  sessionSize?: TrainingSessionSize;
  /** Empty means all supported Dutch parts of speech. */
  vocabulary?:VocabularySelection;
  librarySelection?:LibraryTrainingSelection;
  sourceWordStatus?: SourceWordStatus;
  partOfSpeech?: DutchTrainingPartOfSpeech[];
  /** Article selection narrows noun candidates; selected non-noun POS remain eligible. */
  nounArticles?: DutchNounArticle[];
};

