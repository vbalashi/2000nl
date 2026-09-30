import type { SupabaseClient } from "@supabase/supabase-js";
import { parseStudyTimePage, type StudyTimeRange } from "./model";
import { studyTimeRange, type StudyTimePeriod, type StudyTimeWindow } from "./period";

/** Reuse the authenticated SQL read authority; never read private tables or browser timezone. */
export async function readStudyTimePeriod(client: SupabaseClient, period: StudyTimePeriod, languageCode: string | null, asOf = new Date()): Promise<StudyTimeWindow | null> {
  const read = async (range: StudyTimeRange) => {
    const { data, error } = await client.rpc("get_training_active_time_v1", {
      p_start_date: range.startDate, p_end_date: range.endDate, p_language_code: range.languageCode,
    });
    return error ? null : parseStudyTimePage(data, range);
  };
  // A bounded single-day read obtains the DB's canonical persisted timezone.
  // Usually Today reuses this result; other periods use one further bounded read.
  const date = asOf.toISOString().slice(0, 10);
  const seed = await read({ startDate: date, endDate: date, languageCode });
  if (!seed) return null;
  const range = studyTimeRange(period, asOf, seed.timezone, languageCode);
  const page = range.startDate === date && range.endDate === date ? seed : await read(range);
  if (!page || page.timezone !== seed.timezone || page.coverageStartedAt !== seed.coverageStartedAt) return null;
  return { ...page, startDate: range.startDate, endDate: range.endDate, asOf: asOf.toISOString() };
}
