import { expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { studyDateAt, studyTimeRange, measuredTimeSummary, parseStudyTimeWindow } from "@/lib/training/studyTime/period";
import { readStudyTimePeriod } from "@/lib/training/studyTime/readPeriod";

test.each([
  ["2026-09-30T01:59:00Z", "Europe/Amsterdam", "2026-09-29"],
  ["2026-09-30T02:00:00Z", "Europe/Amsterdam", "2026-09-30"],
  ["2026-03-29T01:59:00Z", "Europe/Amsterdam", "2026-03-28"],
  ["2026-03-29T02:00:00Z", "Europe/Amsterdam", "2026-03-29"],
  ["2026-10-25T02:59:00Z", "Europe/Amsterdam", "2026-10-24"],
  ["2026-10-25T03:00:00Z", "Europe/Amsterdam", "2026-10-25"],
  ["2026-01-01T00:00:00Z", "Pacific/Kiritimati", "2026-01-01"],
])("study-day display matches the 04:00 boundary at %s in %s", (instant, timezone, day) => {
  expect(studyDateAt(new Date(instant), timezone)).toBe(day);
});
test("periods are today, seven study days, and current study calendar month", () => {
  const asOf = new Date("2026-03-01T00:00:00Z");
  expect(studyTimeRange("Week", asOf, "UTC", "nl")).toEqual({ startDate: "2026-02-22", endDate: "2026-02-28", languageCode: "nl" });
  expect(studyTimeRange("Month", asOf, "UTC", null)).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28", languageCode: null });
});
test("the period reader uses the RPC's persisted timezone and rejects a changed authority", async () => {
  const rpc = vi.fn().mockImplementation(async (_name, args) => ({ data: {
    timezone: "America/Los_Angeles", coverageStartedAt: "2026-09-01T10:00:00Z",
    days: [{ date: args.p_start_date, activeMilliseconds: 1234 }],
  }, error: null }));
  const page = await readStudyTimePeriod({ rpc } as unknown as SupabaseClient, "Today", "nl", new Date("2026-09-30T05:00:00Z"));
  expect(page?.endDate).toBe("2026-09-29");
  expect(rpc.mock.calls[1][1]).toEqual({ p_start_date: "2026-09-29", p_end_date: "2026-09-29", p_language_code: "nl" });
  rpc.mockResolvedValueOnce({ data: { ...page, timezone: "UTC", days: [{ date: "2026-09-30", activeMilliseconds: 0 }] }, error: null });
  expect(await readStudyTimePeriod({ rpc } as unknown as SupabaseClient, "Today", null, new Date("2026-09-30T00:00:00Z"))).toBeNull();
});
test("known zero, partial coverage, and unmeasured history are different; milliseconds are summed before rounding", () => {
  const page = { timezone: "UTC", startDate: "2026-09-30", endDate: "2026-09-30", asOf: "2026-09-30T12:00:00Z", coverageStartedAt: "2026-09-30T09:00:00Z", days: [{ date: "2026-09-30", activeMilliseconds: 0 }] };
  expect(measuredTimeSummary(page)).toEqual({ activeMilliseconds: 0, coverage: "partial" });
  expect(measuredTimeSummary({ ...page, coverageStartedAt: "2026-09-29T09:00:00Z" }).coverage).toBe("full");
  expect(measuredTimeSummary({ ...page, coverageStartedAt: "2026-09-30T13:00:00Z" }).coverage).toBe("unavailable");
  expect(parseStudyTimeWindow(page, "Today", "nl")).not.toBeNull();
  expect(parseStudyTimeWindow({ ...page, endDate: "2026-10-01" }, "Today", "nl")).toBeNull();
  expect(parseStudyTimeWindow({ ...page, days: [{ date: "2026-09-30", activeMilliseconds: -1 }] }, "Today", "nl")).toBeNull();
  expect(measuredTimeSummary({ ...page, days: [{ date: "a", activeMilliseconds: 35000 }, { date: "b", activeMilliseconds: 35000 }] }).activeMilliseconds).toBe(70000);
});
