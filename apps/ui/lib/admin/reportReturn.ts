/** Accept only a reports destination on this origin after a verified admin session. */
export function reportReturnPath(value: string | null, origin: string, permissions: string[]): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, origin);
    // Next canonicalizes trailing-slash links before the browser records a return.
    if (url.origin !== origin || !['/admin/reports', '/admin/reports/'].includes(url.pathname)) return null;
    const permission=url.searchParams.get('view')==='notifications'?'notifications.manage':'feedback.read';
    if(!permissions.includes(permission))return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}
