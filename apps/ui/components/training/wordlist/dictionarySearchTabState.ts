import type { LibraryEntryFilters } from "@/lib/platform/librarySearchScope";
import type { DictionaryEntry } from "@/lib/types";
import type { LibraryHeadwordGroupResult } from "./libraryHeadwordGroupResults";

export type DictionarySearchTabState = {
  query: string;
  applyListFilter: boolean;
  collectionId?: string | null;
  wordResults: DictionaryEntry[];
  groupResults: LibraryHeadwordGroupResult[];
  groupPageCursors: Array<string | null>;
  groupHasMore: boolean;
  groupScopeKey?: string | null;
  entryFilters?: LibraryEntryFilters;
  groupTotal?: number | null;
  selectedHeadwordGroupId: string | null;
  wordTotal: number;
  page: number;
  languageCode: string | null;
  dictionaryId: string | null;
  detailSelection: {
    entryId: string;
    headword: string;
    contentLanguageCode: string;
  } | null;
  mobileDetailOpen: boolean;
};

export const createDictionarySearchTabState = (): DictionarySearchTabState => ({
  query: "",
  applyListFilter: false,
  wordResults: [],
  groupResults: [],
  groupPageCursors: [null],
  groupHasMore: false,
  groupScopeKey: null,
  selectedHeadwordGroupId: null,
  wordTotal: 0,
  page: 1,
  languageCode: null,
  dictionaryId: null,
  detailSelection: null,
  mobileDetailOpen: false,
});
