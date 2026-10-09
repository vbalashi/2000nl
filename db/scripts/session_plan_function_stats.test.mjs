import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertSessionPlanFunctionStats,
  sessionPlanFunctionStatsDelta,
  sessionPlanFunctionStatsSql,
} from './session_plan_function_stats.mjs';

const publicWrapper = 'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb)';
const uiWrapper = 'public.get_training_session_plan(uuid,text[],uuid,text,text,jsonb,text,integer)';
const schedulerCandidates =
  'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)';
const uiSessionMembers =
  'private.training_session_members_v1(uuid,text[],uuid,text,text,jsonb,text,integer)';

function row(functionOid, signature, calls, totalMs = 10, selfMs = 5) {
  return { functionOid: String(functionOid), signature, calls, totalMs, selfMs };
}

test('function statistics use OID and an overload-specific SQL signature', () => {
  const sql = sessionPlanFunctionStatsSql();
  assert.match(sql, /procedure\.oid = function_stats\.funcid/);
  assert.match(sql, /oidvectortypes\(procedure\.proargtypes\)/);
  assert.match(sql, /function_stats\.funcid::text/);
});

test('function deltas do not merge overloaded functions with the same name', () => {
  const before = [
    row(101, publicWrapper, 7, 20, 10),
    row(102, uiWrapper, 11, 30, 15),
  ];
  const after = [
    row(101, publicWrapper, 8, 21, 10.5),
    row(102, uiWrapper, 11, 30, 15),
  ];

  assert.deepEqual(sessionPlanFunctionStatsDelta(before, after), [
    row(101, publicWrapper, 1, 1, 0.5),
  ]);
});

test('6- and 8-argument calls require their own wrapper and nested helper evidence', () => {
  assert.doesNotThrow(() => assertSessionPlanFunctionStats([
    row(101, publicWrapper, 1),
    row(103, schedulerCandidates, 1),
  ], 'public'));
  assert.doesNotThrow(() => assertSessionPlanFunctionStats([
    row(102, uiWrapper, 1),
    row(104, uiSessionMembers, 1),
    row(103, schedulerCandidates, 1),
  ], 'uiPublic'));

  assert.throws(() => assertSessionPlanFunctionStats([
    row(102, uiWrapper, 1),
    row(104, uiSessionMembers, 1),
    row(103, schedulerCandidates, 1),
  ], 'public'), /Missing tracked public wrapper\/helper calls/);
  assert.throws(() => assertSessionPlanFunctionStats([
    row(101, publicWrapper, 1),
    row(103, schedulerCandidates, 1),
  ], 'uiPublic'), /Missing tracked uiPublic wrapper\/helper calls/);
});

test('statistics fail closed for missing identity, reset counters, or mismatched OID signatures', () => {
  assert.throws(() => sessionPlanFunctionStatsDelta([], [{ signature: publicWrapper }]), /valid OID/);
  assert.throws(() => sessionPlanFunctionStatsDelta(
    [row(101, publicWrapper, 3)],
    [row(101, publicWrapper, 2)],
  ), /moved backwards/);
  assert.throws(() => sessionPlanFunctionStatsDelta(
    [row(101, publicWrapper, 3)],
    [row(101, uiWrapper, 4)],
  ), /signature changed/);
});
