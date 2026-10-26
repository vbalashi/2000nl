import { expectedDbContract } from "@/lib/deployment/dbContract";
import { createHealthSupabaseClient } from "@/lib/server/healthSupabase";

type DatabaseContractCheck = {
  status: "ok" | "warning";
  message?: string;
  details: {
    expected: string;
    expectedMigration: number;
    actual: string | null;
    actualMigration: number | null;
    compatible: boolean;
  };
};

export async function checkDatabaseContractHealth(): Promise<DatabaseContractCheck> {
  const expected = {
    expected: expectedDbContract.contractId,
    expectedMigration: expectedDbContract.migrationId,
  };
  const supabase = createHealthSupabaseClient();

  if (!supabase) {
    return {
      status: "warning",
      message: "Database contract signal is unavailable.",
      details: { ...expected, actual: null, actualMigration: null, compatible: false },
    };
  }

  const { data, error } = await supabase
    .from("app_db_contract_state")
    .select("contract_id,migration_id")
    .eq("singleton", true)
    .maybeSingle();
  const actual = typeof data?.contract_id === "string" ? data.contract_id : null;
  const actualMigration =
    typeof data?.migration_id === "number" ? data.migration_id : null;
  const compatible =
    !error &&
    actual === expectedDbContract.contractId &&
    actualMigration === expectedDbContract.migrationId;
  const details = { ...expected, actual, actualMigration, compatible };

  return compatible
    ? { status: "ok", details }
    : {
        status: "warning",
        message: "Application and database contracts are incompatible.",
        details,
      };
}
