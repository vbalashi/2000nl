"use client";

import { createContext, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { WordListSummary } from "@/lib/types";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { DictionarySearchTabState } from "@/components/training/wordlist/dictionarySearchTabState";

/** Optional presentation slots. Only the dev review route installs a provider.
 * Reads, authentication, result rows, articles and mobile sheets stay with Library.
 */
export type LibraryPresentationController = {
  collections: WordListSummary[];
  state: DictionarySearchTabState;
  setState: Dispatch<SetStateAction<DictionarySearchTabState>>;
  openFilters: () => void;
  closeFilters: () => void;
  filtersOpen: boolean;
  interfaceLanguage: OnboardingLanguage;
};
export type LibraryPresentationColumns = {
  controller: LibraryPresentationController;
  results: ReactNode;
  detail: ReactNode;
  defaultColumns: ReactNode;
  filters: ReactNode;
};
export type LibraryPresentationSources = {
  locale: OnboardingLanguage;
  options: Array<{ id: string | null; label: string }>;
  selected: string | null;
  select: (id: string | null) => void;
  query: string;
};
export const LibraryPresentationContext = createContext<{
  renderColumns?: (props: LibraryPresentationColumns) => ReactNode;
  renderSources?: (props: LibraryPresentationSources) => ReactNode;
  renderSourceActions?: () => ReactNode;
  organizerOpen?: boolean;
  filterPlacement?: "panel" | "dialog";
  filterButtonSide?: "left" | "right";
} | null>(null);
