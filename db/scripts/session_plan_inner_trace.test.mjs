import assert from "node:assert/strict";
import test from "node:test";
import { summarizeAutoExplain, summarizeTrace } from "./session_plan_inner_trace.mjs";

test("summarizes nested plan timing without exposing query text", () => {
  const plan = [{
    "Query Text": "select private.secret_learner_payload('sensitive')",
    Plan: {
      "Node Type": "WindowAgg",
      "Actual Total Time": 1917.5,
      "Actual Rows": 2345,
      "Shared Hit Blocks": 8440,
      "Temp Read Blocks": 280,
      "Temp Written Blocks": 564,
      Plans: [{ "Node Type": "Sort", "Actual Total Time": 1800, "Actual Rows": 16396 }],
    },
  }];
  const notices = summarizeAutoExplain(`NOTICE: duration: 1917.624 ms plan:\nQuery Text: ARRAY['word-to-definition']\n${JSON.stringify(plan)}\nCONTEXT: SQL function`);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].durationMs, 1917.624);
  assert.deepEqual(notices[0].notable.map((item) => item.type), ["WindowAgg", "Sort"]);
  assert.doesNotMatch(JSON.stringify(notices), /sensitive|secret_learner_payload/);
  assert.equal(summarizeAutoExplain(`NOTICE: duration: 1917.624 ms plan:\n${JSON.stringify(plan[0])}`).length, 1);
  assert.equal(summarizeAutoExplain(`NOTICE: duration: 1 ms plan:\ninvalid\nNOTICE: duration: 2 ms plan:\n${JSON.stringify(plan[0])}`).length, 1);
});

test("requires the expected candidate timing row and returns only aggregate metrics", () => {
  const stdout = [
    'trace_context={"backendPid":2270559,"backendStart":"2026-09-24T05:23:39Z"}',
    JSON.stringify([{ Plan: { "Node Type": "Result" }, "Planning Time": 0.12, "Execution Time": 2038.121 }]),
    'trace_functions=[{"signature":"private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)","calls":1,"totalMs":1927.42,"selfMs":1917.624}]',
  ].join("\n");
  const result = summarizeTrace(stdout, "");
  assert.equal(result.executionMs, 2038.121);
  assert.equal(result.functions[0].selfMs, 1917.624);
  assert.doesNotMatch(JSON.stringify(result), /auth.users|test@2000nl/);
  assert.throws(() => summarizeTrace(stdout.replace("training_scheduler_candidates_v2", "wrong_function"), ""), /Candidate helper/);
});
