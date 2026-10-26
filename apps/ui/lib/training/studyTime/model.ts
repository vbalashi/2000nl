export const MAX_STUDY_TIME_BYTES = 2048;
export type StudyTimeMeasurement = {
  measurementId: string; sessionId: string; family: "meaning" | "idiom" | "sentence";
  entryId: string; cardTypeId: string | null; targetId: string | null;
  activeMilliseconds: number; observedAt: string;
};
export type StudyTimeRange = { startDate: string; endDate: string; languageCode: string | null };
export type StudyTimePage = { coverageStartedAt: string; timezone: string; days: { date: string; activeMilliseconds: number }[] };
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const timestamp = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const date = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const modes = new Set(["word-to-definition", "definition-to-word", "listen-recognize", "listen-type"]);
export function parseStudyTimeMeasurement(value: unknown): StudyTimeMeasurement | null {
  if (!object(value) || Object.keys(value).some(k => !["measurementId","sessionId","family","entryId","cardTypeId","targetId","activeMilliseconds","observedAt"].includes(k))) return null;
  if (!uuid(value.measurementId) || !uuid(value.sessionId) || !uuid(value.entryId) || !timestamp(value.observedAt)
    || !Number.isInteger(value.activeMilliseconds) || typeof value.activeMilliseconds !== "number" || value.activeMilliseconds < 1 || value.activeMilliseconds > 30000) return null;
  if (value.family === "meaning" ? typeof value.cardTypeId !== "string" || !modes.has(value.cardTypeId) || value.targetId !== null
    : !["idiom","sentence"].includes(String(value.family)) || value.cardTypeId !== null || !uuid(value.targetId)) return null;
  return { measurementId: value.measurementId, sessionId: value.sessionId, family: value.family as StudyTimeMeasurement["family"], entryId: value.entryId,
    cardTypeId: value.cardTypeId as string | null, targetId: value.targetId as string | null, activeMilliseconds: value.activeMilliseconds, observedAt: new Date(value.observedAt).toISOString() };
}
export function parseStudyTimeRange(value: unknown): StudyTimeRange | null {
  if (!object(value) || !date(value.startDate) || !date(value.endDate)) return null;
  const span = Date.parse(value.endDate)-Date.parse(value.startDate);
  if (span < 0 || span > 365*86400000 || (value.languageCode !== null && (typeof value.languageCode !== "string" || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(value.languageCode)))) return null;
  return { startDate: value.startDate, endDate: value.endDate, languageCode: value.languageCode as string | null };
}
export function parseStudyTimePage(value: unknown, range: StudyTimeRange): StudyTimePage | null {
  if (!object(value) || !timestamp(value.coverageStartedAt) || typeof value.timezone !== "string" || !Array.isArray(value.days)) return null;
  try { new Intl.DateTimeFormat("en",{timeZone: value.timezone}); } catch { return null; }
  const length = (Date.parse(range.endDate)-Date.parse(range.startDate))/86400000+1;
  if (value.days.length !== length || value.days.some((d, i) => !object(d) || d.date !== new Date(Date.parse(range.startDate)+i*86400000).toISOString().slice(0,10)
    || typeof d.activeMilliseconds !== "number" || !Number.isSafeInteger(d.activeMilliseconds) || d.activeMilliseconds < 0)) return null;
  return { coverageStartedAt: value.coverageStartedAt, timezone: value.timezone,
    days: value.days.map(d => ({ date: d.date as string, activeMilliseconds: d.activeMilliseconds as number })) };
}
