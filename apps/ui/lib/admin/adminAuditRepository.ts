import "server-only";

import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { createAdminServiceClient } from "./adminServerClient";
import { projectAdminAuditEvent, type AdminAuditAction } from "./auditContract";

export type AdminAuditContext = {
  clientIp: string | null;
  userAgent: string | null;
};

export type AdminAuditRow = {
  id: string;
  created_at: string;
  operator_user_id: string | null;
  action: AdminAuditAction;
  outcome: "success" | "denied" | "failure";
  target_type: string | null;
  target_id: string | null;
  request_id: string;
  client_ip: string | null;
  user_agent: string | null;
};

export function readAdminAuditContext(headers: Pick<globalThis.Headers, "get">): AdminAuditContext {
  // Caddy is the only public ingress to the UI container and replaces untrusted
  // forwarded headers with the address it observed. Use only the last hop.
  const forwarded = headers.get("x-forwarded-for");
  const candidate = forwarded?.split(",").at(-1)?.trim() ?? null;
  return {
    clientIp: candidate && isIP(candidate) ? candidate : null,
    userAgent: headers.get("user-agent")?.slice(0, 1024) ?? null,
  };
}

export async function writeAdminAuditEvent(input: {
  operatorUserId?: string | null;
  action: AdminAuditAction;
  outcome: AdminAuditRow["outcome"];
  targetType?: string | null;
  targetId?: string | null;
  requestId?: string;
  context: AdminAuditContext;
}) {
  const supabase = createAdminServiceClient();
  const { error } = await supabase.from("admin_audit_events").insert({
    operator_user_id: input.operatorUserId ?? null,
    action: input.action,
    outcome: input.outcome,
    target_type: input.targetType ?? null,
    target_id: input.targetId?.slice(0, 160) ?? null,
    request_id: input.requestId ?? randomUUID(),
    client_ip: input.context.clientIp,
    user_agent: input.context.userAgent,
  });
  if (error) throw new Error("Required admin audit event could not be stored");
}

export async function readAdminAuditEvents(input: {
  page: number;
  pageSize: number;
  action?: string;
  since?: string;
  before: string;
}) {
  const supabase = createAdminServiceClient();
  const from = (input.page - 1) * input.pageSize;
  let query = supabase
    .from("admin_audit_events")
    .select("id,created_at,operator_user_id,action,outcome,target_type,target_id,request_id,client_ip,user_agent")
    .lt("created_at", input.before)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + input.pageSize);
  if (input.action) query = query.eq("action", input.action);
  if (input.since) query = query.gte("created_at", input.since);
  const { data, error } = await query;
  if (error) throw new Error("Admin journal could not be loaded");
  const rows = (data ?? []) as AdminAuditRow[];
  const pageRows = rows.slice(0, input.pageSize);
  return {
    items: pageRows
      .map((row) => projectAdminAuditEvent(row))
      .filter((event) => event !== null),
    hasNext: rows.length > input.pageSize,
  };
}
