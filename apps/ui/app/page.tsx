import {TrainingBootstrapShell} from "@/components/training/pilot/TrainingBootstrapShell";
import {InterfaceCatalogBoundary} from "@/components/system/InterfaceCatalogBoundary";
import React from "react";
import HomePage from "./HomePage";
import { VocabularyFilterReviewBoundary } from "./dev/vocabulary-filter-review/VocabularyFilterReview";

// Revalidate the document on every navigation; content-hashed JS stays immutable.
export const dynamic = "force-dynamic";

export default function Page() {
  return <InterfaceCatalogBoundary fallback={<TrainingBootstrapShell interfaceLanguage="en" interfaceLanguageReady={false}/>}>{process.env.NODE_ENV === "production" ? <HomePage /> : <VocabularyFilterReviewBoundary><HomePage /></VocabularyFilterReviewBoundary>}</InterfaceCatalogBoundary>;
}
