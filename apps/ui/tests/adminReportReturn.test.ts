import { describe, expect, it } from 'vitest';
import { reportReturnPath } from '@/lib/admin/reportReturn';

describe('report return after admin login', () => {
  const origin = 'https://example.test';
  it('preserves a report link only for an authorized operator', () => {
    const target = '/admin/reports/?feedback=123';
    expect(reportReturnPath(target, origin, ['feedback.read'])).toBe(target);
    expect(reportReturnPath(target, origin, [])).toBeNull();
  });
  it('rejects other origins and paths', () => {
    for (const target of ['https://evil.test/admin/reports/', '//evil.test/admin/reports/', '/admin/users', 'javascript:alert(1)']) {
      expect(reportReturnPath(target, origin, ['feedback.read'])).toBeNull();
    }
  });
});

it('returns notification managers only to their settings view',()=>{
 expect(reportReturnPath('/admin/reports/?view=notifications','https://example.test',['notifications.manage'])).toBe('/admin/reports/?view=notifications');
 expect(reportReturnPath('/admin/reports/?feedback=123','https://example.test',['notifications.manage'])).toBeNull();
});
