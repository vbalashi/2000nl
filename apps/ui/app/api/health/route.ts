import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { appVersionInfo } from "@/lib/appVersion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type CheckResult = {
  status: "ok" | "warning";
  message?: string;
  details?: Record<string, unknown>;
};

const requiredPlatformRpcs = [
  {
    name: "fetch_dictionary_entry_by_id_gated",
    args: { p_entry_id: "00000000-0000-4000-8000-000000000000" },
  },
  {
    name: "lookup_dictionary_entries_v3",
    args: {
      p_query: "__health_missing__",
      p_language_code: "nl",
      p_dictionary_ids: null,
      p_limit: 1,
    },
  },
  {
    name: "lookup_public_catalog_entries_v1",
    args: {
      p_query: "__health_missing__",
      p_language_code: "nl",
      p_limit: 1,
    },
  },
] as const;

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

async function checkPlatformRpcContract(): Promise<CheckResult> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return {
      status: "warning",
      message:
        "Supabase server credentials are not configured; platform RPC contract was not checked.",
    };
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input as any, { ...(init ?? {}), cache: "no-store" }),
    },
  });

  const missing: string[] = [];
  for (const rpc of requiredPlatformRpcs) {
    const { error } = await supabase.rpc(rpc.name, rpc.args);
    if (error) {
      const message = error.message ?? "";
      if (
        message.includes("Could not find the function") ||
        (message.includes("function") && message.includes("does not exist"))
      ) {
        missing.push(rpc.name);
        continue;
      }

      return {
        status: "warning",
        message: `${rpc.name} check failed: ${message}`,
      };
    }
  }

  if (missing.length > 0) {
    return {
      status: "warning",
      message: `Missing platform RPC(s): ${missing.join(", ")}. Apply current migrations or run the UI with scripts/ui-local-dev.sh against local Supabase.`,
    };
  }

  return { status: "ok" };
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
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return {
      status: "warning",
      message:
        "Supabase server credentials are not configured; dictionary search index readiness was not checked.",
    };
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input as any, { ...(init ?? {}), cache: "no-store" }),
    },
  });

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

  if (deep) {
    checks.platformRpcContract = await checkPlatformRpcContract();
    checks.dictionarySearchIndex = await checkDictionarySearchIndex();
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
    },
    ...(deep ? { checks } : null),
  };

  return NextResponse.json(payload, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
