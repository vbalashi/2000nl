export const ADMIN_AUDIT_ACTIONS = [
  "auth.sign_in",
  "auth.sign_in_denied",
  "auth.sign_out",
  "access.denied",
  "dictionary.registry.read",
  "dictionary.metadata.read",
  "audit.journal.read",
] as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];
export type AdminAuditOutcome = "success" | "denied" | "failure";

export type AdminAuditClientContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export type AdminAuditEvent = {
  id: string;
  occurredAt: string;
  operatorId: string | null;
  action: AdminAuditAction;
  target: string;
  outcome: AdminAuditOutcome;
  correlationId: string;
  clientContext: AdminAuditClientContext | null;
};

export type AdminAuditRecord = {
  id: unknown;
  created_at: unknown;
  operator_user_id: unknown;
  action: unknown;
  outcome: unknown;
  target_type: unknown;
  target_id: unknown;
  request_id: unknown;
  client_ip: unknown;
  user_agent: unknown;
};

const nullableText = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

export function projectAdminAuditEvent(record: AdminAuditRecord): AdminAuditEvent | null {
  if (
    typeof record.id !== "string" ||
    typeof record.created_at !== "string" ||
    typeof record.request_id !== "string" ||
    !ADMIN_AUDIT_ACTIONS.includes(record.action as AdminAuditAction) ||
    !["success", "denied", "failure"].includes(String(record.outcome))
  ) return null;

  const clientIp = nullableText(record.client_ip);
  const userAgent = nullableText(record.user_agent);
  const targetType = nullableText(record.target_type);
  const targetId = nullableText(record.target_id);

  return {
    id: record.id,
    occurredAt: record.created_at,
    operatorId: nullableText(record.operator_user_id),
    action: record.action as AdminAuditAction,
    target: [targetType, targetId].filter(Boolean).join(": ") || "Нет данных",
    outcome: record.outcome as AdminAuditOutcome,
    correlationId: record.request_id,
    clientContext: clientIp || userAgent ? { ipAddress: clientIp, userAgent } : null,
  };
}
