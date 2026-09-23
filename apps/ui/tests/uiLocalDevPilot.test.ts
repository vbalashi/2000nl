import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("local launcher", () => {
  test("always selects the canonical current profile", () => {
    const script = fs.readFileSync(
      path.resolve(process.cwd(), "../../scripts/ui-local-dev.sh"),
      "utf8",
    );
    expect(script).toContain('export APP_ROLLOUT_PROFILE="pilot"');
    expect(script).toContain("--work-ref REF --expected-commit SHA");
    expect(script).toContain("scripts/qa-source.mjs");
    expect(script).toContain("scripts/check-qa-server.mjs");
    expect(script).toContain("SUPABASE_TELEMETRY_DISABLED=1");
    expect(script).toContain("DO_NOT_TRACK=1");
    expect(script).toContain('"$repo_root/scripts/db-local-supabase.sh" probe');
    const probePosition = script.indexOf('"$repo_root/scripts/db-local-supabase.sh" probe');
    expect(probePosition).toBeGreaterThanOrEqual(0);
    expect(probePosition).toBeLessThan(script.indexOf("scripts/check-qa-server.mjs"));
    expect(probePosition).toBeLessThan(script.indexOf("scripts/ensure-local-qa-account.js"));
    expect(script).not.toContain("export PLATFORM_V2_LOOKUP_ENABLED=");
    expect(script).not.toContain("export NEXT_PUBLIC_PLATFORM_V2_TRAINING_UI=");
  });
});
