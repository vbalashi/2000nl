import { checkAdmissionHealth } from "@/lib/admission/health";
import { NextResponse } from "next/server";
import {collectionSharingWritesEnabled} from '@/lib/collections/sharing/rollout';
import { appVersionInfo } from "@/lib/appVersion";
import { rolloutProfileDiagnostics } from "@/lib/platform/platformV2Rollout";
import { expectedDbContract } from "@/lib/deployment/dbContract";
import { checkDatabaseContractHealth } from "@/lib/deployment/dbContractHealth";
import { createHealthSupabaseClient } from "@/lib/server/healthSupabase";
import { checkDictionaryTranslationWorkerHealth } from "@/lib/translation/dictionaryTranslationWorkerHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type CheckResult = {
  status: "ok" | "warning";
  message?: string;
  details?: Record<string, unknown>;
};

function databaseTargetLabel(url: string | undefined) {
  if (!url) return "not-configured";
  try {
    const host = new URL(url).hostname;
    if (host === "localhost" || host === "127.0.0.1") return "local";
    return "remote";
  } catch {
    return "unknown";
  }
}

function qaSourceDiagnostics() {
  const mode = process.env.QA_SOURCE_MODE;
  const commit = process.env.QA_SOURCE_COMMIT;
  if (!mode || !commit) return undefined;
  return {
    mode,
    workRef: process.env.QA_SOURCE_WORK_REF ?? null,
    checkoutPath: process.env.QA_SOURCE_CHECKOUT_PATH ?? null,
    commit,
    branch: process.env.QA_SOURCE_BRANCH || null,
    dirty: process.env.QA_SOURCE_DIRTY === "true",
    upstream: process.env.QA_SOURCE_UPSTREAM || null,
    ahead: process.env.QA_SOURCE_AHEAD ? Number(process.env.QA_SOURCE_AHEAD) : null,
    behind: process.env.QA_SOURCE_BEHIND ? Number(process.env.QA_SOURCE_BEHIND) : null,
    originMain: process.env.QA_SOURCE_ORIGIN_MAIN || null,
    remoteRefsContainingHead: (process.env.QA_SOURCE_REMOTE_REFS ?? "")
      .split(",")
      .filter(Boolean),
    squashMerged: process.env.QA_SOURCE_SQUASH_MERGED === "true",
  };
}

async function checkPlatformRpcContract(): Promise<CheckResult> {
  const supabase = createHealthSupabaseClient();
  if (!supabase) {
    return {
      status: "warning",
      message:
        "Supabase server credentials are not configured; platform RPC contract was not checked.",
    };
  }

  // A schema-cache miss can also mean a stale cache. Never fall back to
  // executing article RPCs with service-role credentials.
  const { data, error } = await supabase.rpc("platform_rpc_contract_ready_v1");
  if (error) return { status: "warning", message: "Platform RPC metadata check failed." };
  return data === true
    ? { status: "ok" }
    : { status: "warning", message: "Platform RPC metadata contract is not ready." };
}

async function checkedCount(
  supabase: any,
  table: string,
  column: string,
  apply?: (query: any) => any,
) {
  const base = supabase.from(table).select(column, {
    count: "exact",
    head: true,
  });
  const query = apply ? apply(base) : base;
  const { count, error } = await query;
  if (error) throw new Error(error.message ?? String(error));
  return count ?? 0;
}

async function checkDictionarySearchIndex(): Promise<CheckResult> {
  const supabase = createHealthSupabaseClient();
  if (!supabase) {
    return {
      status: "warning",
      message:
        "Supabase server credentials are not configured; dictionary search index readiness was not checked.",
    };
  }

  try {
    const documentRowCount = await checkedCount(
      supabase,
      "dictionary_search_documents",
      "entry_id",
    );
    const fieldRowCount = await checkedCount(
      supabase,
      "dictionary_search_fields",
      "id",
    );
    const { data: versionRow, error: versionError } = await supabase
      .from("dictionary_search_documents")
      .select("extraction_version")
      .order("extraction_version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (versionError) throw new Error(versionError.message ?? String(versionError));

    const activeExtractionVersion =
      typeof versionRow?.extraction_version === "number"
        ? versionRow.extraction_version
        : null;
    const staleDocumentCount =
      activeExtractionVersion === null
        ? 0
        : await checkedCount(
            supabase,
            "dictionary_search_documents",
            "entry_id",
            (query) => query.lt("extraction_version", activeExtractionVersion),
          );
    const ready =
      documentRowCount > 0 &&
      fieldRowCount > 0 &&
      activeExtractionVersion !== null &&
      staleDocumentCount === 0;
    const details = {
      lookupAvailable: true,
      groupedSearchIndexReady: ready,
      documentRowCount,
      fieldRowCount,
      activeExtractionVersion,
      staleDocumentCount,
      pendingBackfill: !ready,
    };

    return ready
      ? { status: "ok", details }
      : {
          status: "warning",
          message: "Grouped dictionary search index is not ready.",
          details,
        };
  } catch (error) {
    return {
      status: "warning",
      message: `Dictionary search index readiness check failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const deep = url.searchParams.get("deep") === "1";
  const versionInfo = appVersionInfo();
  const checks: Record<string, CheckResult> = {};
  const qaSource = qaSourceDiagnostics();

  if (deep) {
    checks.platformRpcContract = await checkPlatformRpcContract();
    checks.dictionarySearchIndex = await checkDictionarySearchIndex();
    checks.databaseContract = await checkDatabaseContractHealth();
    checks.admission = await checkAdmissionHealth();
    checks.translationWorker = await checkDictionaryTranslationWorkerHealth();
  }

  const hasWarnings = Object.values(checks).some((check) => check.status === "warning");
  const payload = {
    version: versionInfo.version,
    commit: versionInfo.commit,
    uptime: Math.floor(process.uptime()),
    status: hasWarnings ? "warning" : "ok",
    timestamp: new Date().toISOString(),
    database: {
      target: databaseTargetLabel(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL),
      contract: {
        expected: expectedDbContract.contractId,
        expectedMigration: expectedDbContract.migrationId,
      },
    },
    rollout: {...rolloutProfileDiagnostics(),collectionSharingWrites:collectionSharingWritesEnabled()},
    ...(qaSource ? { qaSource } : null),
    ...(deep ? { checks } : null),
  };

  return NextResponse.json(payload, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
