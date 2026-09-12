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
      requiredMigrationId: 150,
      coordinationIssue: 279,
    });
    expect(contract.migrations.map((migration) => migration.migrationId)).toEqual([
      123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150,
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

  test("postflight protects the current canonical scheduler and sequential-introduction seam", () => {
   const postflight =
      read("db/deploy-contract/postflight-150.sql") +
      read("db/deploy-contract/postflight-149.sql") +
      read("db/deploy-contract/postflight-148.sql") +
      read("db/deploy-contract/postflight-147.sql") +
     read("db/deploy-contract/postflight-146.sql") +
      read("db/deploy-contract/postflight-145.sql") +
      read("db/deploy-contract/postflight-144.sql") +
      read("db/deploy-contract/postflight-143.sql");
    const workflow = read(".github/workflows/db-drift-check.yml");

    expect(postflight).toContain("procedure_state.prosecdef");
    expect(postflight).toContain("search_path=public, private, pg_temp");
    expect(postflight).toContain("current-scheduler-boundary");
    expect(postflight).toContain("obsolete-private-scheduler-v1");
    expect(postflight).toContain("public-scheduler-grants");
    expect(postflight).toContain("retained-session-grants");
    expect(postflight).toContain(
      "public.get_next_card(uuid,text[],uuid[],uuid,text,text,text,text[])",
    );
    expect(postflight).toContain(
      "public.get_next_filtered_card(uuid,text[],uuid[],uuid,text,text,text,text[],jsonb)",
    );
    expect(postflight).toContain("training_scheduler_candidates_v1");
    expect(postflight).toContain("training_session_members_v1");
    expect(postflight).toContain("training_schedule_timezone");
    expect(postflight).toContain("ordinary_meaning_introduction_unlocks_v1");
    expect(postflight).toContain("ORDINARY_SOURCE_INTRODUCTIONS AS MATERIALIZED");
    expect(postflight).toContain("sequential-ordinary-routing");
    expect(postflight).toContain("unrenderable_ordinary_direct_entries_v1");
    expect(postflight).toContain("obsolete-count-only-plan-helper");
    expect(postflight).toContain("training_study_day_bounds_v1");
    expect(postflight).toContain("local-study-day-signatures");
    expect(postflight).toContain("local-study-day-scheduler-routing");
    expect(postflight).toContain("local-study-day-authority-routing");
    expect(workflow).toContain("-f db/deploy-contract/postflight-150.sql");
  });

  test("pins a bounded read-only QA selector before every compatible app switch", () => {
    const probe = read(contract.preSwitchReadProbe.file);
    const probeSource =
      probe +
      read("db/deploy-contract/pre-switch-read-probe-141.sql") +
      read("db/deploy-contract/pre-switch-read-probe-131.sql") +
      read("db/deploy-contract/pre-switch-read-probe-130.sql") +
      read("db/deploy-contract/pre-switch-read-probe-129.sql");
    const runner = read("db/scripts/deploy_db_contract.mjs");
    const readinessDiagnostic = read("db/scripts/scheduler_readiness_diagnostic.mjs");
    const workflow = read(".github/workflows/deploy-nuc.yml");
    const driftWorkflow = read(".github/workflows/db-drift-check.yml");
    const gate = workflow.indexOf("deploy_db_contract.mjs apply");
    const switchApp = workflow.indexOf("docker compose up -d --no-build ui", gate);

    expect(contract.preSwitchReadProbe.statementTimeoutMs).toBe(2_000);
    expect(createHash("sha256").update(probe).digest("hex")).toBe(
      contract.preSwitchReadProbe.sha256,
    );
    expect(probeSource).toContain("auth_user.email = 'test@2000nl.test'");
    expect(probeSource).toContain("public.get_training_session_plan");
    expect(probeSource).toContain("public.get_next_card");
    expect(probeSource).toContain("pre_switch_cached_client_scheduler");
    expect(probeSource).toContain("public.get_next_filtered_card");
    expect(probeSource).toContain("$pre_switch_session_plan$");
    expect(probeSource).toContain("$pre_switch_next_card$");
    const canonicalSelectorProbe = read(
      "db/deploy-contract/pre-switch-read-probe-129.sql",
    );
    expect(canonicalSelectorProbe.indexOf("public.get_next_card")).toBeGreaterThan(
      canonicalSelectorProbe.indexOf("public.get_training_session_plan"),
    );
    expect(probeSource).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/i);
    expect(runner).toContain("BEGIN READ ONLY");
    expect(runner).toContain("pre-switch-read-probe passed");
    expect(runner).toContain("SET LOCAL jit = off");
    expect(readinessDiagnostic).toContain("SET LOCAL jit = off");
    expect(driftWorkflow).toContain("pre_switch_read_probe.integration.test.mjs");
    expect(gate).toBeGreaterThan(0);
    expect(switchApp).toBeGreaterThan(gate);
  });
});
