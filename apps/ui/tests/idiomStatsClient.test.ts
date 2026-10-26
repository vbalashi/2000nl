import { beforeEach, expect, test, vi } from "vitest";
import { supabase } from "@/lib/supabaseClient";
import { readIdiomTrainingStats } from "@/lib/training/idiomStatsClient";
vi.mock("@/lib/supabaseClient", () => ({ supabase: { rpc: vi.fn() } }));
const stats = { contractVersion: "training-idiom-stats-v1", newCardsToday: 1,
  reviewCardsDone: 2, reviewCardsDue: 3, totalCardsStarted: 4, totalCardsInScope: 9 };
beforeEach(() => { vi.resetAllMocks(); });
test("sends only the session scope token and reads real counts", async () => {
  vi.mocked(supabase.rpc).mockResolvedValue({data:stats,error:null} as never);
  expect(await readIdiomTrainingStats("session-a")).toEqual(stats);
  expect(supabase.rpc).toHaveBeenCalledWith("read_training_idiom_stats_v1",{p_session_id:"session-a"});
});
test.each([null, {...stats, reviewCardsDue:-1}, {...stats,totalCardsInScope:"9"}, {...stats,contractVersion:"unknown"}])(
  "rejects incomplete or malformed counters instead of showing zero", async data => {
    vi.mocked(supabase.rpc).mockResolvedValue({data,error:null} as never);
    await expect(readIdiomTrainingStats("session-a")).rejects.toThrow("invalid_idiom_training_stats");
  },
);
