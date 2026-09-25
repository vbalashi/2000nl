/** Availability is independent of FSRS and applies to the whole content pair. */
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
  | { kind: "exercise"; targetId: string };
export type TrainingExclusionRequest = {
  clientEventId: string;
  target: TrainingExclusionTarget;
} & (
  | { actionId: "exclude-pair"; trainingSessionId: string }
  | { actionId: "restore-pair"; exclusionId: string }
);
export type TrainingExclusionResponse = {
  status: "accepted" | "duplicate";
  actionId: "exclude-pair" | "restore-pair";
  clientEventId: string;
  exclusionId: string;
  excluded: boolean;
  family: "meaning" | "idiom" | "translation";
};
