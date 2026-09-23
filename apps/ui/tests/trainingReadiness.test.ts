import { describe, expect, test } from "vitest";
import {
  deriveTrainingPilotSetupStatus,
  isCurrentTrainingReadinessRequest,
} from "@/lib/training/trainingReadiness";

describe("training setup readiness", () => {
  test("keeps setup status independent from card preparation", () => {
    expect(
      deriveTrainingPilotSetupStatus({
        prerequisites: "pending",
        hasAvailableLists: true,
      }),
    ).toBe("preparing");
    expect(
      deriveTrainingPilotSetupStatus({
        prerequisites: "ready",
        hasAvailableLists: true,
      }),
    ).toBe("ready");
    expect(
      deriveTrainingPilotSetupStatus({
        prerequisites: "ready",
        hasAvailableLists: false,
      }),
    ).toBe("first-use");
  });

  test("rejects stale user, scope, and generation responses", () => {
    const request = {
      userId: "user-a",
      scopeKey: "scope-a",
      generation: 4,
    };
    const current = {
      ...request,
      mounted: true,
    };
    expect(isCurrentTrainingReadinessRequest(request, current)).toBe(true);
    expect(
      isCurrentTrainingReadinessRequest(request, {
        ...current,
        userId: "user-b",
      }),
    ).toBe(false);
    expect(
      isCurrentTrainingReadinessRequest(request, {
        ...current,
        scopeKey: "scope-b",
      }),
    ).toBe(false);
    expect(
      isCurrentTrainingReadinessRequest(request, {
        ...current,
        generation: 5,
      }),
    ).toBe(false);
    expect(
      isCurrentTrainingReadinessRequest(request, {
        ...current,
        mounted: false,
      }),
    ).toBe(false);
  });
});
