import { beforeEach, describe, expect, test, vi } from "vitest";
import { performPlatformV2IdiomExerciseAction } from "@/lib/platform/platformV2IdiomExerciseClient";
import { platformFetchWithTimeout } from "@/lib/platform/platformFetchWithTimeout";

vi.mock("@/lib/platform/platformV2Http", () => ({
  platformV2AuthenticatedJsonHeaders: vi.fn(async () => ({
    "Content-Type": "application/json",
  })),
}));
vi.mock("@/lib/platform/platformFetchWithTimeout", () => ({
  platformFetchWithTimeout: vi.fn(),
}));

const candidate = {
  targetId: "target-1",
  targetKey: "idiom:target-1:direct",
  direction: "direct" as const,
  state: null,
};

describe("idiom action transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("keeps the caller's action identity across a deliberate retry", async () => {
    const sent: string[] = [];
    vi.mocked(platformFetchWithTimeout).mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      sent.push(body.clientEventId);
      return new Response(JSON.stringify({
        contractVersion: "platform-action-v2",
        actionId: "review-exercise",
        clientEventId: body.clientEventId,
        accepted: true,
        exercise: {
          targetId: candidate.targetId,
          targetKey: candidate.targetKey,
          family: "idiom",
          direction: "direct",
          state: {
            stateRevision: "revision-1",
            fsrsReps: 1,
            fsrsLapses: 0,
            seenCount: 1,
            successCount: 1,
            fsrsEnabled: true,
            hidden: false,
            inLearning: false,
            lastResult: "success",
          },
        },
      }), { status: 200 });
    });

    const input = {
      trainingSessionId: "session-1",
      clientEventId: "intentional-action-1",
      candidate,
      reviewResult: "success" as const,
    };
    await performPlatformV2IdiomExerciseAction(input);
    await performPlatformV2IdiomExerciseAction(input);

    expect(sent).toEqual(["intentional-action-1", "intentional-action-1"]);
  });
});
