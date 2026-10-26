/** One invitation identity, whether pasted as a code or opened as its URL. */
const codePattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isCanonicalShareCode(value: unknown): value is string {
  return typeof value === 'string' && codePattern.test(value);
}

function canonicalCode(value: string): string | null {
  const compact = value.replace(/[\s-]/g, "");
  // Validate before case-folding: Unicode characters can expand into ASCII.
  if (!/^[0-9A-Za-z]+$/.test(compact)) return null;
  const code = compact.toUpperCase();
  return codePattern.test(code) ? code : null;
}

/** No external URL or navigation target is accepted from pasted input. */
export function parseShareCode(input: unknown, applicationOrigin: string): string | null {
  if (typeof input !== "string" || input.length > 1024) return null;
  const value = input.trim();
  const direct = canonicalCode(value);
  if (direct) return direct;
  try {
    const url = new URL(value);
    const origin = new URL(applicationOrigin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin.origin ||
        url.username || url.password || url.search) return null;
    // Only the fragment carries invitation authority. It is not sent in HTTP requests.
    if (url.pathname !== '/share' || !/^#[0-9A-Za-z-]+$/.test(url.hash)) return null;
    return canonicalCode(url.hash.slice(1));
  } catch {
    return null;
  }
}

export function shareInvitationUrl(code: string, applicationOrigin: string): string {
  const canonical = canonicalCode(code);
  const origin = new URL(applicationOrigin);
  if (!canonical || !['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password)
    throw new Error("invalid_share_invitation");
  return new URL(`/share#${canonical}`, origin.origin).href;
}
