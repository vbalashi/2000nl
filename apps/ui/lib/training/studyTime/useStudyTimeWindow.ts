"use client";
import { useEffect, useState } from "react";
import { authenticatedAccountRequest } from "@/lib/preferences/accountRequest";
import { parseStudyTimeWindow, type StudyTimePeriod, type StudyTimeWindow } from "./period";

export type StudyTimeWindowState = { status: "loading" | "error" } | { status: "ready"; window: StudyTimeWindow };

export function useStudyTimeWindow(ownerId: string, languageCode: string, period: StudyTimePeriod, open: boolean, refresh: number): StudyTimeWindowState {
  const key = JSON.stringify([ownerId, languageCode, period, refresh]);
  const [result, setResult] = useState<{ key: string; state: StudyTimeWindowState } | null>(null);
  useEffect(() => {
    if (!open) return;
    let current = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    setResult({ key, state: { status: "loading" } });
    const query = new URLSearchParams({ period, language: languageCode });
    void authenticatedAccountRequest(`/api/training/study-time?${query}`, ownerId, { method: "GET", signal: controller.signal })
      .then(async response => {
        const page = response.ok ? parseStudyTimeWindow(await response.json(), period, languageCode) : null;
        if (!page) throw new Error("study_time_unavailable");
        if (current) setResult({ key, state: { status: "ready", window: page } });
      })
      .catch(() => { if (current) setResult({ key, state: { status: "error" } }); })
      .finally(() => window.clearTimeout(timeout));
    return () => { current = false; controller.abort(); window.clearTimeout(timeout); };
  }, [key, ownerId, languageCode, period, open]);
  // An account/scope switch cannot flash the previous account's numbers.
  return result?.key === key ? result.state : { status: "loading" };
}
