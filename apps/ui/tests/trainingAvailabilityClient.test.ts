import { expect, test, vi } from "vitest";
vi.mock("@/lib/preferences/accountRequest", () => ({ authenticatedAccountRequest: vi.fn() }));
import { authenticatedAccountRequest } from "@/lib/preferences/accountRequest";
import { fetchTrainingAvailability } from "@/lib/training/availability/client";
import { availabilityRpcScope, availabilityRecipeKey, parseAvailabilityRecipe } from "@/lib/training/availability/model";

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

 test('source status affects availability only for supported exercise families, independently of card mix',()=>{
  const base={languageCode:'nl',draft:{family:'word-in-context' as const,scenarioId:'understanding',modes:['definition-to-word' as const],cardFilter:'both' as const,listValue:'curated:f6ad893a-3071-4908-85b1-eb174a5ad72f',newReviewRatio:2,dateWindow:'all' as const,sourceValue:'all',sessionSize:5}};
  expect(availabilityRpcScope(base).p_training_filter).toHaveProperty('sourceWordStatus','learning');
  const all={...base,draft:{...base.draft,sourceWordStatus:'all' as const}};
  expect(availabilityRpcScope(all).p_training_filter).toHaveProperty('sourceWordStatus','all');
  expect(availabilityRecipeKey(all)).not.toBe(availabilityRecipeKey(base));
  expect(availabilityRecipeKey({...all,draft:{...all.draft,cardFilter:'new',sessionSize:10}})).toBe(availabilityRecipeKey(all));
  expect(availabilityRpcScope({...all,draft:{...all.draft,family:'meaning'}}).p_training_filter).not.toHaveProperty('sourceWordStatus');
  expect(parseAvailabilityRecipe({...base,draft:{...base.draft,sourceWordStatus:'known'}})).toBeNull();
 });

test('validates complete, internally consistent totals without inventing missing data',async()=>{
 const {parseTrainingAvailability}=await import('@/lib/training/availability/model');
 const base={dueToday:1,totalReviews:2,newCards:3,studyDay:'2026-10-03',timezone:'UTC',asOf:'2026-10-03T12:00:00Z'};
 expect(parseTrainingAvailability({...base,totalWords:2,totalMeanings:3,totalCards:5})).toMatchObject({totalWords:2,totalMeanings:3,totalCards:5});
 expect(parseTrainingAvailability({...base,totalWords:2,totalCards:5})).toBeNull();
 expect(parseTrainingAvailability({...base,totalWords:4,totalMeanings:3,totalCards:5})).toBeNull();
 expect(parseTrainingAvailability({...base,totalWords:2,totalMeanings:3,totalCards:4})).toBeNull();
});
