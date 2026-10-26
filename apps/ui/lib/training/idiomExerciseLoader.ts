import type { PlatformIdiomExerciseCandidateV2 } from "../../../../packages/shared/types/platformV2";
import {
  fetchPlatformV2LibraryGroup,
  PlatformV2LibraryLookupError,
} from "@/lib/platform/platformV2LibraryClient";
import {
  resolveIdiomExerciseContent,
  type IdiomExerciseContent,
} from "./idiomExerciseContent";

type IdiomExerciseLoadResult =
  | { state: "ready"; content: IdiomExerciseContent }
  | { state: "projection-missing" | "dictionary-access-revoked" | "entry-not-found" };

export async function loadIdiomExerciseContent(input: {
  candidate: Pick<
    PlatformIdiomExerciseCandidateV2,
    "entryId" | "contentNodeId" | "sourceTextFingerprint"
  >;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  signal?: AbortSignal;
}): Promise<IdiomExerciseLoadResult> {
  try {
    const group = await fetchPlatformV2LibraryGroup({
      entryId: input.candidate.entryId,
      // Library lookup is a read-only content projection. The idiom target's
      // independent FSRS identity is never derived from this ordinary card type.
      cardTypeId: "word-to-definition",
      contentLanguageCode: input.contentLanguageCode,
      translationTargetLanguageCode: input.translationTargetLanguageCode,
      signal: input.signal,
    });
    if (!group) return { state: "entry-not-found" };
    const content = resolveIdiomExerciseContent(input.candidate, group);
    return content
      ? { state: "ready", content }
      : { state: "projection-missing" };
  } catch (error) {
    if (error instanceof PlatformV2LibraryLookupError) {
      if (error.status === 403) return { state: "dictionary-access-revoked" };
      if (error.status === 404) return { state: "entry-not-found" };
      if (error.status === 409) return { state: "projection-missing" };
    }
    throw error;
  }
}
