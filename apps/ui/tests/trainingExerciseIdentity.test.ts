import {
  createTrainingExerciseIdentity,
  trainingExerciseIdentityKey,
} from "../../../packages/shared/training-exercise/identity";

describe("training exercise identity", () => {
  test("keeps ordinary meaning directions on the existing entry-level identity", () => {
    const direct = createTrainingExerciseIdentity({
      entryId: "entry-1",
      family: "meaning",
      direction: "direct",
    });
    const reverse = createTrainingExerciseIdentity({
      entryId: "entry-1",
      family: "meaning",
      direction: "reverse",
    });

    expect(direct).toEqual({
      schemaVersion: "training-exercise-v1",
      entryId: "entry-1",
      contentNodeId: null,
      family: "meaning",
      direction: "direct",
    });
    expect(trainingExerciseIdentityKey(direct)).toBe(
      "training-exercise-v1:meaning:direct:entry-1:entry",
    );
    expect(trainingExerciseIdentityKey(direct)).not.toBe(
      trainingExerciseIdentityKey(reverse),
    );
  });

  test("keeps multiple idioms under one meaning independent", () => {
    const idiomA = createTrainingExerciseIdentity({
      entryId: "entry-1",
      contentNodeId: "idiom-a",
      family: "idiom",
      direction: "direct",
    });
    const idiomB = createTrainingExerciseIdentity({
      entryId: "entry-1",
      contentNodeId: "idiom-b",
      family: "idiom",
      direction: "direct",
    });

    expect(trainingExerciseIdentityKey(idiomA)).not.toBe(
      trainingExerciseIdentityKey(idiomB),
    );
    expect(trainingExerciseIdentityKey(idiomA)).toContain(":idiom-a");
    expect(trainingExerciseIdentityKey(idiomB)).toContain(":idiom-b");
  });

  test("keeps idiom direct and reverse exercises independent", () => {
    const direct = createTrainingExerciseIdentity({
      entryId: "entry-1",
      contentNodeId: "idiom-a",
      family: "idiom",
      direction: "direct",
    });
    const reverse = createTrainingExerciseIdentity({
      entryId: "entry-1",
      contentNodeId: "idiom-a",
      family: "idiom",
      direction: "reverse",
    });

    expect(trainingExerciseIdentityKey(direct)).not.toBe(
      trainingExerciseIdentityKey(reverse),
    );
  });

  test("does not include translation language in the sentence exercise identity", () => {
    const exercise = createTrainingExerciseIdentity({
      entryId: "entry-1",
      contentNodeId: "sentence-a",
      family: "translation",
      direction: "recall",
    });

    expect(trainingExerciseIdentityKey(exercise)).toBe(
      "training-exercise-v1:translation:recall:entry-1:sentence-a",
    );
  });

  test.each([
    {
      entryId: "entry-1",
      family: "meaning" as const,
      direction: "direct" as const,
      contentNodeId: "definition-a",
    },
    {
      entryId: "entry-1",
      family: "idiom" as const,
      direction: "recall" as never,
      contentNodeId: "idiom-a",
    },
    {
      entryId: "entry-1",
      family: "translation" as const,
      direction: "direct" as never,
      contentNodeId: "sentence-a",
    },
  ])("rejects an invalid $family/$direction/content target", (input) => {
    expect(() => createTrainingExerciseIdentity(input)).toThrow(
      "invalid_training_exercise_identity",
    );
  });
});
