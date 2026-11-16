/** Accept only a reports destination on this origin after a verified admin session. */
export function reportReturnPath(value: string | null, origin: string, permissions: string[]): string | null {
  if (!value || !permissions.includes('feedback.read')) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.pathname !== '/admin/reports/') return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}
