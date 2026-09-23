import assert from "node:assert/strict";
import test from "node:test";
import { activitySql } from "./scheduler_activity_sampler.mjs";

test("activity sampler is read-only and emits only bounded query classes", () => {
  const sql = activitySql(3000);
  assert.match(sql, /BEGIN READ ONLY/);
  assert.match(sql, /FROM pg_stat_activity/);
  assert.match(sql, /session-plan/);
  assert.match(sql, /filtered-card/);
  assert.match(sql, /next-card/);
  assert.match(sql, /candidate/);
  assert.doesNotMatch(sql, /'query',\s*query/);
  assert.match(sql, /COMMIT/);
});
