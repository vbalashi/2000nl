import type { CardFilter, QueueTurn } from "../types";

export type QueueTransitionInput = {
  cardFilter: CardFilter;
  queueTurn: QueueTurn;
  reviewCounter: number;
  newReviewRatio: number;
};

export type QueueTransition = {
  queueTurn: QueueTurn;
  reviewCounter: number;
};

export function getNextQueueTransition(
  input: QueueTransitionInput,
): QueueTransition {
  if (input.cardFilter !== "both") {
    return {
      queueTurn: "auto",
      reviewCounter: input.reviewCounter,
    };
  }

  if (input.queueTurn === "new") {
    return {
      queueTurn: "review",
      reviewCounter: 0,
    };
  }

  const nextCount = input.reviewCounter + 1;
  if (nextCount >= input.newReviewRatio) {
    return {
      queueTurn: "new",
      reviewCounter: 0,
    };
  }

  return {
    queueTurn: "review",
    reviewCounter: nextCount,
  };
}

export function predictNextQueueTurn(input: QueueTransitionInput): QueueTurn {
  return getNextQueueTransition(input).queueTurn;
}

export function generateReviewTurnId(): string {
  const c = (globalThis as any).crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();

  // RFC 4122 v4 fallback (best-effort) for environments without crypto.randomUUID().
  if (c?.getRandomValues) {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
      16,
      20,
    )}-${hex.slice(20)}`;
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
