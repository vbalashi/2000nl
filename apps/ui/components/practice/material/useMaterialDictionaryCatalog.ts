"use client";
import { useEffect, useState } from "react";
import { fetchAvailableDictionarySourcesStrict } from "@/lib/training/listService";
import { withPreferenceDeadline } from "@/lib/preferences/requestDeadline";
import type { AvailableDictionarySource } from "@/lib/types";
/** On-demand readable inventory, independent of enabled/disabled selection. */
export function useMaterialDictionaryCatalog(
  userId: string,
  languageCodes: string[],
) {
  const key = JSON.stringify([userId, languageCodes]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    status: "loading" | "ready" | "error";
    sources: AvailableDictionarySource[];
  }>({ key: "", status: "loading", sources: [] });
  useEffect(() => {
    let cancelled = false;
    const [owner, codes] = JSON.parse(key) as [string, string[]];
    setState({ key, status: "loading", sources: [] });
    void Promise.all(
      codes.map((languageCode) =>
        withPreferenceDeadline((signal) =>
          fetchAvailableDictionarySourcesStrict(
            { userId: owner, languageCode },
            signal,
          ),
        ),
      ),
    )
      .then((groups) => {
        if (!cancelled)
          setState({ key, status: "ready", sources: groups.flat() });
      })
      .catch(() => {
        if (!cancelled) setState({ key, status: "error", sources: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);
  return {
    ...(state.key === key
      ? state
      : { status: "loading" as const, sources: [] }),
    reload: () => setAttempt((value) => value + 1),
  };
}
