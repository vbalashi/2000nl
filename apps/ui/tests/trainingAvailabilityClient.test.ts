import { expect, test, vi } from "vitest";
vi.mock("@/lib/preferences/accountRequest", () => ({ authenticatedAccountRequest: vi.fn() }));
import { authenticatedAccountRequest } from "@/lib/preferences/accountRequest";
import { fetchTrainingAvailability } from "@/lib/training/availability/client";
import { parseAvailabilityRecipe } from "@/lib/training/availability/model";

test("saved recipe metadata is excluded from the strict availability request", async () => {
  const saved = {
    id: "c86657e8-55da-49db-a895-833737c09004", name: "Translation", languageCode: "nl",
    draft: { family: "word-in-context" as const, scenarioId: "understanding", modes: ["definition-to-word" as const],
      cardFilter: "review" as const, listValue: "curated:f6ad893a-3071-4908-85b1-eb174a5ad72f", newReviewRatio: 5,
      dateWindow: "all" as const, sourceValue: "all", sessionSize: 5, materialMode: "collection" as const,
      dictionaryIds: [], partOfSpeech: [], nounArticles: [] },
  };
  vi.mocked(authenticatedAccountRequest).mockImplementation(async (_url, _owner, init) => {
    const payload = JSON.parse(String(init?.body));
    return parseAvailabilityRecipe(payload)
      ? Response.json({ dueToday: 1, totalReviews: 2, newCards: 3, studyDay: "2026-10-03", timezone: "UTC", asOf: "2026-10-03T12:00:00Z" })
      : Response.json({ error: "invalid_training_recipe" }, { status: 400 });
  });
  await expect(fetchTrainingAvailability("owner", saved, new AbortController().signal)).resolves.toMatchObject({ dueToday: 1 });
  expect(JSON.parse(String(vi.mocked(authenticatedAccountRequest).mock.calls[0][2]?.body))).toEqual({ languageCode: saved.languageCode, draft: saved.draft });
});
