import type { DictionaryEntry } from "@/lib/types";
import type { LibraryHeadwordGroupResult } from "./libraryHeadwordGroupResults";

export type DictionarySearchTabState = {
  query: string;
  applyListFilter: boolean;
  wordResults: DictionaryEntry[];
  groupResults: LibraryHeadwordGroupResult[];
  groupPageCursors: Array<string | null>;
  groupHasMore: boolean;
  selectedHeadwordGroupId: string | null;
  wordTotal: number;
  page: number;
  languageCode: string | null;
  dictionaryId: string | null;
  detailEntry: DictionaryEntry | null;
  mobileDetailOpen: boolean;
};

export const createDictionarySearchTabState = (): DictionarySearchTabState => ({
  query: "",
  applyListFilter: false,
  wordResults: [],
  groupResults: [],
  groupPageCursors: [null],
  groupHasMore: false,
  selectedHeadwordGroupId: null,
  wordTotal: 0,
  page: 1,
  languageCode: null,
  dictionaryId: null,
  detailEntry: null,
  mobileDetailOpen: false,
});
