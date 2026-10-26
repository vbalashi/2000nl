import { appVersionInfo } from "@/lib/appVersion";
import type { AuthenticatedSupabase, ServiceSupabase } from "@/lib/platform/serverSupabase";
import {
  parseDiagnosticReportTransport,
  canonicalJson,
  verifyDiagnosticTransport,
  type DiagnosticReportTransportV1,
} from "../../../../packages/shared/diagnostic-report/v1";
import { verifyCurrentDisplayedTranslations } from "./diagnosticDisplayedTranslationVerifier";

export type FeedbackSubmitResult = {
  status: number;
  payload: unknown;
};

export async function submitDiagnosticReport(
  auth: AuthenticatedSupabase,
  service: ServiceSupabase,
  body: unknown,
): Promise<FeedbackSubmitResult> {
  const parsed = parseDiagnosticReportTransport(body);
  if (!parsed.ok) return { status: 400, payload: { error: parsed.error } };
  if (!(await verifyDiagnosticTransport(parsed.value))) {
    return { status: 400, payload: { error: "payload_hash_mismatch" } };
  }
  if (auth.principal.authKind === "first_party" && parsed.value.sourceContext !== null) {
    return { status: 400, payload: { error: "first_party_source_context_forbidden" } };
  }

  const report = withoutTransportHash(parsed.value);
  const receiptRead = await service.supabase.rpc(
    "read_diagnostic_report_receipt_as_principal",
    { p_user_id: auth.principal.userId, p_report_id: report.reportId,
      p_payload_hash: parsed.value.payloadHash },
  );
  if (receiptRead.error) return { status: 500, payload: { error: "feedback_receipt_lookup_failed" } };
  const existing = Array.isArray(receiptRead.data) ? receiptRead.data[0] : receiptRead.data;
  if (existing?.status === "conflict") {
    return { status: 409, payload: { error: "idempotency_conflict", reportId: report.reportId } };
  }
  if (existing?.status === "duplicate") return { status: 200, payload: existing };

  const displayedTranslationVerification =
    await verifyCurrentDisplayedTranslations(auth, service, report);
  if (!displayedTranslationVerification.ok) {
    return {
      status: displayedTranslationVerification.status,
      payload: { error: displayedTranslationVerification.error },
    };
  }

  const { data, error } = await service.supabase.rpc(
    "submit_diagnostic_report_as_principal",
    {
      p_user_id: auth.principal.userId,
      p_source_client:
        auth.principal.authKind === "connected_client"
          ? auth.principal.connectedClientId
          : "2000nl-web",
      p_app_build_version: serverBuildVersion(),
      p_report_id: report.reportId,
      p_payload_hash: parsed.value.payloadHash,
      p_canonical_payload: canonicalJson(report),
      p_payload: report,
    },
  );
  if (error) {
    const code = safeRpcError(error.message ?? "");
    return { status: code.status, payload: { error: code.error } };
  }
  const receipt = Array.isArray(data) ? data[0] : data;
  if (receipt?.status === "conflict") {
    return { status: 409, payload: { error: "idempotency_conflict", reportId: report.reportId } };
  }
  return { status: 200, payload: receipt };
}

function withoutTransportHash(value: DiagnosticReportTransportV1) {
  const { payloadHash: _payloadHash, ...report } = value;
  return report;
}

function serverBuildVersion() {
  const build = appVersionInfo();
  return `${build.version}@${build.commit}`.slice(0, 128);
}

function safeRpcError(message: string) {
  if (
    message.includes("stale_target") ||
    message.includes("stale_report_content_revision")
  ) return { status: 409, error: "stale_target" };
  if (message.includes("action_target_mismatch")) return { status: 409, error: "action_target_mismatch" };
  if (
    message.includes("card_content_mismatch") ||
    message.includes("report_atoms_mismatch") ||
    message.includes("translation_atom_not_supported")
  ) return { status: 400, error: "card_content_mismatch" };
  if (message.includes("not_accessible")) return { status: 403, error: "target_not_accessible" };
  return { status: 500, error: "feedback_persist_failed" };
}

export function isFeedbackAdmin(auth: AuthenticatedSupabase) {
  const metadata = auth.user.app_metadata ?? {};
  return metadata.role === "admin" ||
    (Array.isArray(metadata.roles) && metadata.roles.includes("admin"));
}

export function parseAdminFeedbackFilters(url: URL) {
  const allowed = new Set([
    "kind", "targetKind", "targetEntryId", "status", "sourceClient", "buildVersion",
    "safeCode", "createdFrom", "createdTo", "limit",
  ]);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) return { ok: false as const, error: "unknown_filter" };
  }
  const date = (key: string) => {
    const value = url.searchParams.get(key);
    return value && !Number.isNaN(Date.parse(value)) ? value : value === null ? null : undefined;
  };
  const createdFrom = date("createdFrom");
  const createdTo = date("createdTo");
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (createdFrom === undefined || createdTo === undefined || !Number.isInteger(limit) || limit < 1 || limit > 200) return { ok: false as const, error: "invalid_filter" };
  const take = (key: string, max = 128) => {
    const value = url.searchParams.get(key);
    return value && value.length <= max ? value : value === null ? null : undefined;
  };
  const values = ["kind", "targetKind", "status", "sourceClient", "buildVersion", "safeCode"].map((key) => take(key));
  if (values.includes(undefined)) return { ok: false as const, error: "invalid_filter" };
  const targetEntryId = take("targetEntryId", 36);
  if (targetEntryId === undefined || (targetEntryId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(targetEntryId))) return { ok: false as const, error: "invalid_filter" };
  return { ok: true as const, value: {
    p_kind: values[0], p_target_kind: values[1], p_target_entry_id: targetEntryId, p_status: values[2],
    p_source_client: values[3], p_app_build_version: values[4], p_safe_code: values[5],
    p_created_from: createdFrom, p_created_to: createdTo, p_limit: limit,
  } };
}
