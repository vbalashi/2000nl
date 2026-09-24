import type {
  PlatformContentNodeV2,
  PlatformHeadwordGroupV2,
  PlatformIdiomExerciseCandidateV2,
  PlatformSenseCardEntryV2,
} from "../../../../packages/shared/types/platformV2";

type IdiomTarget = Pick<
  PlatformIdiomExerciseCandidateV2,
  "entryId" | "contentNodeId" | "sourceTextFingerprint"
>;

export type IdiomExerciseContent = {
  headword: string;
  entry: PlatformSenseCardEntryV2;
  expression: PlatformContentNodeV2;
  explanation: PlatformContentNodeV2;
  examples: PlatformContentNodeV2[];
};

/** Resolve one exercise from the public content-node projection, never from raw provider data. */
export function resolveIdiomExerciseContent(
  target: IdiomTarget,
  group: PlatformHeadwordGroupV2,
): IdiomExerciseContent | null {
  const entry = group.entries.find(
    (candidate): candidate is PlatformSenseCardEntryV2 =>
      candidate.kind === "sense-card" && candidate.entryId === target.entryId,
  );
  if (!entry) return null;

  const expression = entry.contentNodes.find(
    (node) => node.contentNodeId === target.contentNodeId,
  );
  if (
    !expression ||
    expression.kind !== "idiom" ||
    expression.parentContentNodeId !== null ||
    expression.sourceTextFingerprint !== target.sourceTextFingerprint ||
    !expression.text.trim()
  ) return null;

  const children = entry.contentNodes.filter(
    (node) => node.parentContentNodeId === expression.contentNodeId,
  );
  const explanations = children.filter(
    (node) => node.kind === "idiom-explanation" && node.text.trim(),
  );
  // A missing or ambiguous explanation is not a usable recall target. Do not
  // borrow a definition or an explanation attached to a sibling expression.
  if (explanations.length !== 1) return null;

  const examples = children
    .filter((node) => node.kind === "example" && node.text.trim())
    .sort((left, right) => left.order - right.order);

  return {
    headword: group.header.text,
    entry,
    expression,
    explanation: explanations[0],
    examples,
  };
}
