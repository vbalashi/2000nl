export const ADMISSION_MODES = ["invite-only", "approval-required", "open"] as const;
export type AdmissionMode = typeof ADMISSION_MODES[number];
export type AdmissionStatus = "pending" | "approved" | "rejected" | "revoked" | "unconfirmed";
export type AdmissionState = { enabled: boolean; status: AdmissionStatus; mode: AdmissionMode };
export type AdmissionRow = { email: string; user_id: string | null; status: AdmissionStatus; created_at: string; updated_at: string };
export type AdmissionPage = { items: AdmissionRow[]; enabled: boolean; mode: AdmissionMode; page: number };
export const ADMISSION_ACTIONS = ["approve", "reject", "revoke", "invite", "mode"] as const;
export type AdmissionAction = typeof ADMISSION_ACTIONS[number];
export function parseAdmissionMutation(value: unknown): { action: AdmissionAction; emails: string[]; mode: AdmissionMode | null } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (!ADMISSION_ACTIONS.includes(body.action as AdmissionAction)) return null;
  const action = body.action as AdmissionAction;
  if (action === "mode") return ADMISSION_MODES.includes(body.mode as AdmissionMode) ? { action, mode: body.mode as AdmissionMode, emails: [] } : null;
  if (!Array.isArray(body.emails) || body.emails.length < 1 || body.emails.length > 100 || !body.emails.every(e => typeof e === "string" && e.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()))) return null;
  return { action, mode: null, emails: [...new Set(body.emails.map(e => (e as string).trim().toLowerCase()))].sort() };
}
