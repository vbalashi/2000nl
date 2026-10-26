import { describe, expect, test } from "vitest";
import {
  meaningLearningStatus,
  parseMeaningLearningProgress,
  type MeaningLearningProgress,
} from "../../../packages/shared/types/meaningLearningProgress";
const snapshot = (): MeaningLearningProgress => ({
  entryId: "meaning",
  headword: "huis",
  exclusionId: null,
  revision: "a".repeat(64),
  directions: ["word-to-definition", "definition-to-word"].map(
    (cardTypeId) => ({
      cardTypeId: cardTypeId as "word-to-definition" | "definition-to-word",
      stateRevision: "untracked",
      knownMarkId: null,
      knownMarkRevision: null,
      knownMarkedAt: null,
      phase: "new",
      presentations: 0,
      gradedAttempts: 0,
      lastGrade: null,
      lastReviewedAt: null,
      nextReviewAt: null,
      stability: null,
      difficulty: null,
    }),
  ),
});
describe("meaning status projection", () => {
  test("prioritizes exclusion, then directional Known without treating FSRS maturity as Known", () => {
    const p = snapshot();
    expect(meaningLearningStatus(p)).toBe("new");
    p.directions[0].phase = "learning";
    expect(meaningLearningStatus(p)).toBe("learning");
    p.directions.forEach((d) => {
      d.phase = "reviewing";
      d.stability = 999;
    });
    expect(meaningLearningStatus(p)).toBe("reviewing");
    p.directions[0].knownMarkId = "known";
    expect(meaningLearningStatus(p)).toBe("partly-known");
    p.directions[1].knownMarkId = "known";
    expect(meaningLearningStatus(p)).toBe("known");
    p.exclusionId = "excluded";
    expect(meaningLearningStatus(p)).toBe("excluded");
  });
  test("rejects a missing or duplicate direction and malformed statistics", () => {
    expect(parseMeaningLearningProgress(snapshot())).toEqual(snapshot());
    const p = snapshot();
    p.directions[1] = p.directions[0];
    expect(() => parseMeaningLearningProgress(p)).toThrow();
    const q = snapshot();
    q.directions[0].gradedAttempts = -1;
    expect(() => parseMeaningLearningProgress(q)).toThrow();
  });
});
