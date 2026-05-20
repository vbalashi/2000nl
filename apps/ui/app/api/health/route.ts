import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { appVersionInfo } from "@/lib/appVersion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type CheckResult = {
  status: "ok" | "warning";
  message?: string;
};

const requiredPlatformRpcs = ["fetch_dictionary_entry_by_id_gated"] as const;

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
  for (const rpcName of requiredPlatformRpcs) {
    const { error } = await supabase.rpc(rpcName, {
      p_entry_id: "00000000-0000-4000-8000-000000000000",
    });
    if (error) {
      const message = error.message ?? "";
      if (
        message.includes("Could not find the function") ||
        (message.includes("function") && message.includes("does not exist"))
      ) {
        missing.push(rpcName);
        continue;
      }

      return {
        status: "warning",
        message: `${rpcName} check failed: ${message}`,
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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const deep = url.searchParams.get("deep") === "1";
  const versionInfo = appVersionInfo();
  const checks: Record<string, CheckResult> = {};

  if (deep) {
    checks.platformRpcContract = await checkPlatformRpcContract();
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
