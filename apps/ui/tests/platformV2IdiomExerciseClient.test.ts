import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  performPlatformV2IdiomExerciseAction,
  fetchNextPlatformV2IdiomTrainingSessionExercise,
  startPlatformV2IdiomTrainingSession,
} from "@/lib/platform/platformV2IdiomExerciseClient";
import { platformFetchWithTimeout } from "@/lib/platform/platformFetchWithTimeout";
import { supabase } from "@/lib/supabaseClient";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { rpc: vi.fn() },
}));

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

  test("recognizes excluded latched members as unavailable instead of a malformed response", async () => {
    const data={status:'unavailable',sessionId:'session-1',targetId:'target-1',ordinal:1,reason:'pair-excluded',remaining:1};
    vi.mocked(supabase.rpc).mockResolvedValue({data,error:null} as never);
    expect(await fetchNextPlatformV2IdiomTrainingSessionExercise('user-1','session-1')).toEqual(data);
  });

  test("starts with the exact selected source scope and per-session mix", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: {
        contractVersion: "platform-idiom-exercise-session-v2",
        sessionId: "session-1",
        exerciseFamily: "idiom",
        direction: "reverse",
        sessionSize: "5",
        requestedTotal: 5,
        plannedNew: 0,
        plannedReview: 0,
        plannedPractice: 0,
        plannedTotal: 0,
        plannedAt: "2026-09-24T12:00:00Z",
        runStatus: "active",
        runGeneration: 1,
        completedActions: 0,
        completionReason: "exhausted",
        members: [],
      },
      error: null,
    } as never);
    const trainingFilter = {
      dateWindow: "today" as const,
      partOfSpeech: ["bn" as const],
      dictionaryScope: {
        mode: "selected" as const,
        languageCode: "nl",
        dictionaryIds: ["dictionary-1"],
      },
    };

    const session = await startPlatformV2IdiomTrainingSession({
      userId: "user-1",
      direction: "reverse",
      sessionSize: 5,
      requestId: "request-1",
      listId: null,
      listType: "curated",
      cardFilter: "review",
      trainingFilter,
      newReviewRatio: 3,
    });

    expect(session.sessionId).toBe("session-1");
    expect(supabase.rpc).toHaveBeenCalledWith(
      "start_platform_v2_idiom_training_session",
      {
        p_user_id: "user-1",
        p_direction: "reverse",
        p_session_size: "5",
        p_request_id: "request-1",
        p_list_id: null,
        p_list_type: "curated",
        p_card_filter: "review",
        p_training_filter: trainingFilter,
        p_new_review_ratio: 3,
      },
    );
  });
});
