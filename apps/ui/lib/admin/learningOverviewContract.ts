const materialKeys = [
  "learningWords", "dueCards", "personalLists", "usedPersonalLists",
  "subscriptions", "usedSubscriptions", "sharedLists", "sharedWithSubscribers",
] as const;
const languageStatus = ["active", "paused", "default", "historical"];

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid overview field");
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("Invalid overview field");
  return value;
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid overview count");
  return value;
}

function timestamp(value: unknown): string {
  const input = string(value);
  if (!Number.isFinite(Date.parse(input))) throw new Error("Invalid overview timestamp");
  return input;
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function array(value: unknown, maximum: number) {
  if (!Array.isArray(value) || value.length > maximum) throw new Error("Invalid overview list");
  return value.map(record);
}

export function projectLearningOverview(value: unknown) {
  const row = record(value);
  const timezone = string(row.timezone);
  new Intl.DateTimeFormat("en", { timeZone: timezone });
  const material = record(row.material);
  const days = array(row.days, 365).map(day => {
    const date = string(day.date);
    if (!isCalendarDate(date)) throw new Error("Invalid study day");
    return { date, answers: count(day.answers), activeMilliseconds: day.activeMilliseconds === null ? null : count(day.activeMilliseconds) };
  });
  if (days.length !== 365 || days.some((day, index) => index > 0 &&
    Date.parse(day.date) - Date.parse(days[index - 1].date) !== 86_400_000)) {
    throw new Error("Incomplete study calendar");
  }
  return {
    timezone,
    lastActivityAt: row.lastActivityAt === null ? null : timestamp(row.lastActivityAt),
    days,
    languages: array(row.languages, 200).map(item => {
      const status = string(item.status);
      if (!languageStatus.includes(status)) throw new Error("Invalid language status");
      return { code: string(item.code), name: string(item.name), status };
    }),
    material: Object.fromEntries(materialKeys.map(key => [key, count(material[key])])),
  };
}

export function projectLearningSessions(value: unknown) {
  const row = record(value);
  if (typeof row.hasMore !== "boolean") throw new Error("Invalid session page");
  return {
    hasMore: row.hasMore,
    sessions: array(row.sessions, 100).map(item => ({
      id: string(item.id), startedAt: timestamp(item.startedAt),
      source: string(item.source), mode: string(item.mode), outcome: string(item.outcome), cards: count(item.cards),
      activeMilliseconds: item.activeMilliseconds === null ? null : count(item.activeMilliseconds),
    })),
  };
}
