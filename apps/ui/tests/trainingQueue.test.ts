import { describe, expect, test, vi } from "vitest";
import {
  generateReviewTurnId,
  getNextQueueTransition,
  predictNextQueueTurn,
} from "@/lib/training/trainingQueue";

describe("trainingQueue", () => {
  test("returns auto for non-round-robin filters without changing review count", () => {
    expect(
      getNextQueueTransition({
        cardFilter: "new",
        queueTurn: "review",
        reviewCounter: 2,
        newReviewRatio: 3,
      }),
    ).toEqual({ queueTurn: "auto", reviewCounter: 2 });

    expect(
      getNextQueueTransition({
        cardFilter: "review",
        queueTurn: "new",
        reviewCounter: 1,
        newReviewRatio: 3,
      }),
    ).toEqual({ queueTurn: "auto", reviewCounter: 1 });
  });

  test("switches from a new card to review and resets the counter", () => {
    expect(
      getNextQueueTransition({
        cardFilter: "both",
        queueTurn: "new",
        reviewCounter: 4,
        newReviewRatio: 3,
      }),
    ).toEqual({ queueTurn: "review", reviewCounter: 0 });
  });

  test("counts review cards until the new-card ratio is reached", () => {
    expect(
      getNextQueueTransition({
        cardFilter: "both",
        queueTurn: "review",
        reviewCounter: 1,
        newReviewRatio: 3,
      }),
    ).toEqual({ queueTurn: "review", reviewCounter: 2 });

    expect(
      getNextQueueTransition({
        cardFilter: "both",
        queueTurn: "review",
        reviewCounter: 2,
        newReviewRatio: 3,
      }),
    ).toEqual({ queueTurn: "new", reviewCounter: 0 });
  });

  test("prediction uses the same transition helper", () => {
    const input = {
      cardFilter: "both" as const,
      queueTurn: "review" as const,
      reviewCounter: 2,
      newReviewRatio: 3,
    };

    expect(predictNextQueueTurn(input)).toBe(
      getNextQueueTransition(input).queueTurn,
    );
  });

  test("generateReviewTurnId prefers crypto.randomUUID", () => {
    const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: vi.fn(() => "turn-1") },
    });

    expect(generateReviewTurnId()).toBe("turn-1");

    if (originalCrypto) {
      Object.defineProperty(globalThis, "crypto", originalCrypto);
    }
  });
});
