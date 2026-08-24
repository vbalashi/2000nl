import fs from "node:fs";
import { createHash } from "node:crypto";
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
      requiredMigrationId: 128,
      coordinationIssue: 243,
    });
    expect(contract.migrations.map((migration) => migration.migrationId)).toEqual([
      123, 124, 125, 126, 127, 128,
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
    const clientPreflight = workflow.indexOf("client-preflight");
    const build = workflow.indexOf("docker compose build ui");
    const gate = workflow.indexOf("deploy_db_contract.mjs apply");
    const switchApp = workflow.indexOf("docker compose up -d --no-build ui", gate);
    const health = workflow.indexOf("verify-deploy-health.mjs", switchApp);

    expect(validation).toBeGreaterThan(0);
    expect(hold).toBeGreaterThan(validation);
    expect(clientPreflight).toBeGreaterThan(hold);
    expect(build).toBeGreaterThan(clientPreflight);
    expect(gate).toBeGreaterThan(build);
    expect(switchApp).toBeGreaterThan(gate);
    expect(health).toBeGreaterThan(switchApp);
    expect(workflow).toContain("previous app image restored; forward DB migrations retained");
    expect(workflow).toContain("no previous image existed; incompatible new app stopped");
    expect(workflow).not.toContain("psql \"$SUPABASE_DB_URL\"");
    expect(workflow).toContain(
      "postgres@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94",
    );
    expect(workflow.match(/--psql-container-image/g)).toHaveLength(2);
  });

  test("gives every deployed image an immutable commit tag", () => {
    const compose = read("docker-compose.yml");
    expect(compose).toContain("image: 2000nl-ui:${UI_IMAGE_TAG:-local}");
  });

  test("postflight proves the bounded default scheduler contract", () => {
    const postflight = read("db/deploy-contract/postflight-128.sql");
    const workflow = read(".github/workflows/db-drift-check.yml");

    expect(postflight).toContain("EXPLAIN (FORMAT JSON, COSTS OFF)");
    expect(postflight).toContain('"Relation Name": "default_training_scope_entries_v1"');
    expect(postflight).toContain("word_entries_pointer_only_scheduler_exclusion_v1_idx");
    expect(postflight).toContain("READABLE_DICTIONARIES AS MATERIALIZED");
    expect(postflight).toContain("scheduler_access_call_count <> 1");
    expect(postflight).toContain("LIMITS AS MATERIALIZED");
    expect(postflight).toContain("trigger_state.tgfoid = sync_oid::oid");
    expect(postflight).toContain("trigger_state.tgtype = 21");
    expect(postflight).toContain("procedure_state.prosecdef");
    expect(postflight).toContain("search_path=public, private, pg_temp");
    expect(postflight).toContain("bounded-scope-sync-function-contract");
    expect(postflight).toContain("constraint_state.confdeltype = 'c'");
    expect(postflight).toContain("word_entries_training_sibling_count_v1_idx");
    expect(postflight).toContain("bounded-selector-contract");
    expect(postflight).toContain("TODAY_NEW_WORDS AS MATERIALIZED");
    expect(postflight).toContain("KNOWN_CARDS AS MATERIALIZED");
    expect(workflow).toContain("-f db/deploy-contract/ledger-v1.sql");
    expect(workflow).toContain("-f db/deploy-contract/postflight-128.sql");
  });

  test("pins a bounded read-only QA selector before every compatible app switch", () => {
    const probe = read(contract.preSwitchReadProbe.file);
    const runner = read("db/scripts/deploy_db_contract.mjs");
    const workflow = read(".github/workflows/deploy-nuc.yml");
    const driftWorkflow = read(".github/workflows/db-drift-check.yml");
    const gate = workflow.indexOf("deploy_db_contract.mjs apply");
    const switchApp = workflow.indexOf("docker compose up -d --no-build ui", gate);

    expect(contract.preSwitchReadProbe.statementTimeoutMs).toBe(2_000);
    expect(createHash("sha256").update(probe).digest("hex")).toBe(
      contract.preSwitchReadProbe.sha256,
    );
    expect(probe).toContain("auth_user.email = 'test@2000nl.test'");
    expect(probe).toContain("public.get_training_session_plan");
    expect(probe).toContain("public.get_next_card");
    expect(probe).toContain("$pre_switch_session_plan$");
    expect(probe).toContain("$pre_switch_next_card$");
    expect(probe.indexOf("public.get_next_card")).toBeGreaterThan(
      probe.indexOf("public.get_training_session_plan"),
    );
    expect(probe).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/i);
    expect(runner).toContain("BEGIN READ ONLY");
    expect(runner).toContain("pre-switch-read-probe passed");
    expect(driftWorkflow).toContain("pre_switch_read_probe.integration.test.mjs");
    expect(gate).toBeGreaterThan(0);
    expect(switchApp).toBeGreaterThan(gate);
  });
});
