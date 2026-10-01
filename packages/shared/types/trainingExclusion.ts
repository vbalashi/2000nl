/** Availability is independent of FSRS. Headword scope is ordinary recall only. */
export type TrainingExclusionTarget =
  | {
      kind: "meaning";
      entryId: string;
      cardTypeId:
        | "word-to-definition"
        | "definition-to-word"
        | "listen-recognize"
        | "listen-type";
    }
  | { kind: "exercise"; targetId: string }
  | { kind: "headword"; entryId: string; cardTypeId?: "word-to-definition" | "definition-to-word" };
export type TrainingExclusionRequest = {
  clientEventId: string;
  target: TrainingExclusionTarget;
} & (
  | { actionId: "exclude-pair"; trainingSessionId: string }
  | { actionId: "restore-pair"; exclusionId: string }
  | { actionId: "exclude-headword"; trainingSessionId?: string }
  | { actionId: "restore-headword"; exclusionId: string }
);
export type TrainingExclusionResponse = {
  status: "accepted" | "duplicate";
  actionId: "exclude-pair" | "restore-pair" | "exclude-headword" | "restore-headword";
  clientEventId: string;
  exclusionId: string;
  headwordGroupId?: string;
  excluded: boolean;
  family: "meaning" | "idiom" | "translation";
};
