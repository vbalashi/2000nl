export const maintenanceStatusPath = "/api/app-maintenance";
export const maintenanceHintEvent = "app-maintenance-hint";
export const maintenanceEndedEvent = "app-maintenance-ended";
export const maintenanceCheckInterval = 15_000;

export type MaintenanceStatus =
  | { phase: "available" }
  | { phase: "active" }
  | { phase: "scheduled"; id: string; revision: number; startsAt: number; expiresAt: number };

export function parseMaintenanceStatus(value: unknown): MaintenanceStatus | null {
  if (!value || typeof value !== "object" || !("phase" in value)) return null;
  if (value.phase === "available" || value.phase === "active") return { phase: value.phase };
  if (value.phase !== "scheduled") return null;

  const { id, revision, startsAt, expiresAt } = value as Record<string, unknown>;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)
    || typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1
    || typeof startsAt !== "string" || typeof expiresAt !== "string") return null;

  const start = Date.parse(startsAt);
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(expiry)) return null;
  return { phase: "scheduled", id, revision, startsAt: start, expiresAt: expiry };
}
