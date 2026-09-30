"use client";
import { useEffect, useState } from "react";
import { authenticatedAccountRequest } from "@/lib/preferences/accountRequest";
import { parseActivityCalendar, type ActivityCalendar } from "./model";

export type ActivityCalendarState = { status: "loading" | "error" } | { status: "ready"; calendar: ActivityCalendar };

export function useActivityCalendar(ownerId: string, languageCode: string, open: boolean, refresh: number): ActivityCalendarState {
  const key = JSON.stringify([ownerId, languageCode, refresh]);
  const [result, setResult] = useState<{ key: string; state: ActivityCalendarState } | null>(null);
  useEffect(() => {
    if (!open) return;
    let current = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    setResult({ key, state: { status: "loading" } });
    void authenticatedAccountRequest(`/api/training/activity?${new URLSearchParams({ language: languageCode })}`, ownerId, { method: "GET", signal: controller.signal })
      .then(async response => {
        const calendar = response.ok ? parseActivityCalendar(await response.json()) : null;
        if (!calendar) throw new Error("activity_unavailable");
        if (current) setResult({ key, state: { status: "ready", calendar } });
      })
      .catch(() => { if (current) setResult({ key, state: { status: "error" } }); })
      .finally(() => window.clearTimeout(timeout));
    return () => { current = false; controller.abort(); window.clearTimeout(timeout); };
  }, [key, ownerId, languageCode, open]);
  // An account/language switch cannot flash the previous scope's history.
  return result?.key === key ? result.state : { status: "loading" };
}
