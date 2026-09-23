import assert from 'node:assert/strict';
import test from 'node:test';
import { clientOverheadMs, componentOrder, diagnosticSql, explainMetrics } from './scheduler_readiness_diagnostic.mjs';

test('diagnostic records physical backend identity inside the read-only transaction', () => {
  const sql = diagnosticSql({ statementTimeoutMs: 3000 }, 'public');
  assert.match(sql, /BEGIN READ ONLY/);
  assert.match(sql, /SET LOCAL jit = off/);
  assert.match(sql, /pg_backend_pid\(\)/);
  assert.match(sql, /backend_start FROM pg_stat_activity WHERE pid = pg_backend_pid\(\)/);
  assert.match(sql, /EXPLAIN \(ANALYZE, BUFFERS, FORMAT JSON\)/);
  assert.ok(sql.indexOf('scheduler_context=') > sql.indexOf('BEGIN READ ONLY'));
  assert.ok(sql.indexOf('scheduler_context=') < sql.indexOf('COMMIT'));
});

test('diagnostic includes the exact eight-argument UI session-plan overload', () => {
  const sql = diagnosticSql({ statementTimeoutMs: 3000 }, 'ui-public');
  assert.match(sql, /get_training_session_plan\([\s\S]*'10',[\s\n]*2\n\s*\)/);
  assert.match(sql, /BEGIN READ ONLY/);
});

test('component order can make the UI overload the first call', () => {
  assert.deepEqual(componentOrder('ui-public'), ['ui-public', 'public', 'next', 'filtered', 'aggregate', 'candidate']);
  assert.deepEqual(componentOrder('public'), ['public', 'ui-public', 'next', 'filtered', 'aggregate', 'candidate']);
});

test('client overhead keeps connection and pooler time separate from server execution', () => {
  assert.equal(clientOverheadMs(2050.25, 1805.75), 244.5);
});

test('metrics keep outer planning distinct from execution and preserve reused backend identity', () => {
  const context = { backendPid: 123, backendStart: '2026-09-22T20:00:00+00:00', serverVersion: '17.6', workMem: '2184kB', jit: 'off' };
  const output = `scheduler_context=${JSON.stringify(context)}\n${JSON.stringify([{
    Plan: { 'Shared Hit Blocks': 5341, 'Shared Read Blocks': 0, 'Temp Read Blocks': 280, 'Temp Written Blocks': 564 },
    Planning: { 'Shared Hit Blocks': 3, 'Shared Read Blocks': 1 },
    'Execution Time': 2317.099,
    'Planning Time': 1.25,
  }])}`;
  const first = explainMetrics(output, 'public', 1);
  const second = explainMetrics(output, 'public', 2);
  assert.deepEqual(first, { context, planningMs: 1.25, planningHit: 3, planningRead: 1, executionMs: 2317.099, sharedHit: 5341, sharedRead: 0, tempRead: 280, tempWritten: 564 });
  assert.equal(first.context.backendPid, second.context.backendPid);
  assert.throws(() => explainMetrics(output.replace(/^scheduler_context=.*\n/, ''), 'public', 1), /missing backend context/);
});
