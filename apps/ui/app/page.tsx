import React from "react";
import HomePage from "./HomePage";
import { VocabularyFilterReviewBoundary } from "./dev/vocabulary-filter-review/VocabularyFilterReview";

// Revalidate the document on every navigation; content-hashed JS stays immutable.
export const dynamic = "force-dynamic";

export default function Page() {
  return process.env.NODE_ENV === "production" ? <HomePage /> : <VocabularyFilterReviewBoundary><HomePage /></VocabularyFilterReviewBoundary>;
}
