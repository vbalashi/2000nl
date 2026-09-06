import { supabase } from "@/lib/supabaseClient";
import { normalizeReadingSize, type ReadingDevice, type ReadingPreferences, type ReadingSize } from "./readingSize";

export interface ReadingPreferencesRepository {
  load(userId: string): Promise<ReadingPreferences>;
  save(userId: string, device: ReadingDevice, size: ReadingSize): Promise<void>;
}

const columns = { phone: "reading_size_phone", desktop: "reading_size_desktop" } as const;

async function withRequestDeadline<T>(request: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    return await request(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export const readingPreferencesRepository: ReadingPreferencesRepository = {
  async load(userId) {
    const { data, error } = await withRequestDeadline((signal) => supabase.from("user_settings")
      .select("reading_size_phone, reading_size_desktop").eq("user_id", userId).abortSignal(signal).maybeSingle());
    if (error) throw new Error("reading_preferences_load_failed");
    return { phone: normalizeReadingSize(data?.reading_size_phone), desktop: normalizeReadingSize(data?.reading_size_desktop) };
  },
  async save(userId, device, size) {
    const { error } = await withRequestDeadline((signal) => supabase.from("user_settings").upsert(
      { user_id: userId, [columns[device]]: size }, { onConflict: "user_id" },
    ).abortSignal(signal));
    if (error) throw new Error("reading_preferences_save_failed");
  },
};
