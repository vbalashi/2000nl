import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import contract from "../../../packages/shared/deployment/db-contract.json";

const repoRoot = path.resolve(process.cwd(), "../..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

describe("NUC database contract deployment", () => {
  test("tracks an exact contiguous commit-owned migration contract", () => {
    expect(contract.schemaVersion).toBe(1);
    expect(contract.baseline.migrationId).toBe(122);
    expect(contract.ledger.file).toBe("db/deploy-contract/ledger-v1.sql");
    expect(contract.ledger.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(contract.rollout).toEqual({
      status: "enabled",
      requiredMigrationId: 126,
      coordinationIssue: 232,
    });
    expect(contract.migrations.map((migration) => migration.migrationId)).toEqual([
      123, 124, 125, 126,
    ]);
    for (const migration of contract.migrations) {
      expect(migration.file).toMatch(
        new RegExp(`^db/migrations/${migration.migrationId}_`),
      );
      expect(migration.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("builds before migration, gates before switch, and verifies exact health", () => {
    const workflow = read(".github/workflows/deploy-nuc.yml");
    const validation = workflow.indexOf("deploy_db_contract.mjs validate");
    const hold = workflow.indexOf("rollout-status");
    const build = workflow.indexOf("docker compose build ui");
    const gate = workflow.indexOf("deploy_db_contract.mjs apply");
    const switchApp = workflow.indexOf("docker compose up -d --no-build ui", gate);
    const health = workflow.indexOf("verify-deploy-health.mjs", switchApp);

    expect(validation).toBeGreaterThan(0);
    expect(hold).toBeGreaterThan(validation);
    expect(build).toBeGreaterThan(hold);
    expect(gate).toBeGreaterThan(build);
    expect(switchApp).toBeGreaterThan(gate);
    expect(health).toBeGreaterThan(switchApp);
    expect(workflow).toContain("previous app image restored; forward DB migrations retained");
    expect(workflow).toContain("no previous image existed; incompatible new app stopped");
    expect(workflow).not.toContain("psql \"$SUPABASE_DB_URL\"");
  });

  test("gives every deployed image an immutable commit tag", () => {
    const compose = read("docker-compose.yml");
    expect(compose).toContain("image: 2000nl-ui:${UI_IMAGE_TAG:-local}");
  });

  test("postflight proves the pointer index and set-based dictionary access contracts", () => {
    const postflight = read("db/deploy-contract/postflight-126.sql");
    const workflow = read(".github/workflows/db-drift-check.yml");

    expect(postflight).toContain("EXPLAIN (FORMAT JSON, COSTS OFF)");
    expect(postflight).toContain('"Join Type": "Anti"');
    expect(postflight).toContain("word_entries_pointer_only_scheduler_exclusion_v1_idx");
    expect(postflight).toContain("enable_seqscan = off");
    expect(postflight).toContain("READABLE_DICTIONARIES AS MATERIALIZED");
    expect(postflight).toContain("scheduler_access_call_count <> 1");
    expect(workflow).toContain("-f db/deploy-contract/ledger-v1.sql");
    expect(workflow).toContain("-f db/deploy-contract/postflight-126.sql");
  });
});
