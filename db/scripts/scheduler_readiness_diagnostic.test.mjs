import assert from 'node:assert/strict';
import test from 'node:test';
import {
  componentOrder,
  diagnosticSql,
  explainMetrics,
  outerOverheadMs,
  parseArgs,
  redactDiagnosticOutput,
} from './scheduler_readiness_diagnostic.mjs';

test('diagnostic output redacts database URLs, named secrets, and opaque tokens', () => {
  const opaqueToken = 'xY9_'.repeat(20);
  const input = [
    'connection=postgresql://qa_user:private-pass@db.example:6543/postgres?sslmode=require',
    'password=private-password token=private-token secret=private-secret key=private-key',
    `authorization=${opaqueToken}`,
  ].join('\n');

  const redacted = redactDiagnosticOutput(input);

  assert.match(redacted, /\[redacted-db-url\]/);
  assert.match(redacted, /password=\[redacted\]/);
  assert.match(redacted, /token=\[redacted\]/);
  assert.match(redacted, /secret=\[redacted\]/);
  assert.match(redacted, /key=\[redacted\]/);
  assert.match(redacted, /\[redacted-token\]/);
  assert.doesNotMatch(redacted, /qa_user|private-pass|private-password|private-token|private-secret|private-key|xY9_/);
});

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

test('production diagnostic sample count is capped at three', () => {
  assert.equal(parseArgs([]).samples, 3);
  assert.equal(parseArgs(['--samples', '1']).samples, 1);
  assert.equal(parseArgs(['--samples', '3']).samples, 3);
  assert.throws(() => parseArgs(['--samples', '4']), /between 1 and 3/);
  assert.throws(() => parseArgs(['--samples', '0']), /between 1 and 3/);
});

test('outer overhead keeps wrapper time separate from server execution', () => {
  assert.equal(outerOverheadMs(2050.25, 1805.75), 244.5);
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

test('timing parser fails closed when EXPLAIN JSON or execution time is missing', () => {
  const context = 'scheduler_context={"backendPid":123}\n';
  assert.throws(() => explainMetrics(`${context}no plan`, 'public', 1), /returned no EXPLAIN JSON/);
  assert.throws(() => explainMetrics(`${context}[{"Plan":{}}]`, 'public', 1), /has no execution time/);
});
