import { describe, expect, it } from 'vitest';
import { reportReturnPath } from '@/lib/admin/reportReturn';

describe('report return after admin login', () => {
  const origin = 'https://example.test';
  it.each(['/admin/reports/?feedback=123', '/admin/reports?feedback=123'])('preserves browser report link %s only for an authorized operator', (target) => {
    expect(reportReturnPath(target, origin, ['feedback.read'])).toBe(target);
    expect(reportReturnPath(target, origin, [])).toBeNull();
  });
  it('rejects other origins and paths', () => {
    for (const target of ['https://evil.test/admin/reports/', '//evil.test/admin/reports/', '/admin/users', '/admin/reports-other', '/admin/reports/assets', '/admin/reports//', 'javascript:alert(1)']) {
      expect(reportReturnPath(target, origin, ['feedback.read'])).toBeNull();
    }
  });
});

it.each(['/admin/reports/', '/admin/reports'])('returns notification managers only to their settings view at %s',path=>{
 expect(reportReturnPath(path+'?view=notifications','https://example.test',['notifications.manage'])).toBe(path+'?view=notifications');
 expect(reportReturnPath(path+'?feedback=123','https://example.test',['notifications.manage'])).toBeNull();
});
