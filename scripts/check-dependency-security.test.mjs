import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAudit } from './check-dependency-security.mjs';
const report = (vulnerabilities = {}) => ({ auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: Object.fromEntries(['info', 'low', 'moderate', 'high', 'critical'].map(s => [s, Object.values(vulnerabilities).filter(v => v.severity === s).length])) } });
test('clean report passes', () => assert.deepEqual(checkAudit(report()), []));
test('high and critical direct or transitive findings block', () => {
  assert.deepEqual(checkAudit(report({ a: { severity: 'high' }, b: { severity: 'critical' }, c: { severity: 'moderate' } })), ['a: high', 'b: critical']);
});
test('registry errors and malformed reports fail closed', () => {
  for (const invalid of [null, {}, { error: {} }, { ...report(), auditReportVersion: 3 }, { ...report(), metadata: {} }]) {
    assert.throws(() => checkAudit(invalid));
  }
});

test('unknown severities and inconsistent aggregate counts fail', () => {
  assert.throws(() => checkAudit(report({ a: { severity: 'unknown' } })));
  const invalid = report(); invalid.metadata.vulnerabilities.high = 1;
  assert.throws(() => checkAudit(invalid));
});
