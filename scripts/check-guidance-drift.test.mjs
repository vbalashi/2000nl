import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { activeGuidanceFiles, findGuidanceDrift } from "./check-guidance-drift.mjs";

test("active repository guidance is free of retired runtime names", () => {
  const findings = findGuidanceDrift();
  assert.deepEqual(findings, []);
  assert.ok(activeGuidanceFiles().some((path) => path.endsWith("db/README.md")));
});

test("detects a retired runtime name in active agent guidance", () => {
  const fixture = mkdtempSync(join(tmpdir(), "2000nl-guidance-drift-"));
  try {
    writeFileSync(join(fixture, "AGENTS.md"), "Do not call get_next_word from new code.\n");
    const findings = findGuidanceDrift(fixture);
    assert.deepEqual(findings, [{ path: "AGENTS.md", line: 1, name: "get_next_word" }]);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("does not scan historical SQL migration source", () => {
  const fixture = mkdtempSync(join(tmpdir(), "2000nl-guidance-drift-"));
  try {
    mkdirSync(join(fixture, "db/migrations"), { recursive: true });
    writeFileSync(join(fixture, "db/migrations/001_legacy.sql"), "drop function handle_review;\n");
    assert.deepEqual(findGuidanceDrift(fixture), []);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("detects stale managed migration range in an active runbook", () => {
  const fixture = mkdtempSync(join(tmpdir(), "2000nl-guidance-drift-"));
  try {
    mkdirSync(join(fixture, "docs/runbooks"), { recursive: true });
    mkdirSync(join(fixture, "packages/shared/deployment"), { recursive: true });
    writeFileSync(
      join(fixture, "packages/shared/deployment/db-contract.json"),
      JSON.stringify({ rollout: { requiredMigrationId: 137 } }),
    );
    writeFileSync(
      join(fixture, "docs/runbooks/deploy.md"),
      "Apply migrations 123 through 131 in order.\n",
    );
    assert.deepEqual(findGuidanceDrift(fixture), [{
      path: "docs/runbooks/deploy.md",
      line: 1,
      name: "stale managed migration range 123-131 (expected 123-137)",
    }]);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
