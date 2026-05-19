import { describe, expect, test } from "vitest";

describe("/api/platform/v1 route aliases", () => {
  test("exports the same lookup handlers", async () => {
    const current = await import("@/app/api/platform/lookup/route");
    const versioned = await import("@/app/api/platform/v1/lookup/route");

    expect(versioned.OPTIONS).toBe(current.OPTIONS);
    expect(versioned.POST).toBe(current.POST);
  });

  test("exports the same actions handlers", async () => {
    const current = await import("@/app/api/platform/actions/route");
    const versioned = await import("@/app/api/platform/v1/actions/route");

    expect(versioned.OPTIONS).toBe(current.OPTIONS);
    expect(versioned.POST).toBe(current.POST);
  });

  test("exports the same analyze-selection handlers", async () => {
    const current = await import("@/app/api/platform/analyze-selection/route");
    const versioned = await import("@/app/api/platform/v1/analyze-selection/route");

    expect(versioned.OPTIONS).toBe(current.OPTIONS);
    expect(versioned.POST).toBe(current.POST);
  });
});
