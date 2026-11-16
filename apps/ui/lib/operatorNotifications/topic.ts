/** Explicit 'none' means an unthreaded chat; missing or malformed configuration is invalid. */
export function parseTopic(value: string | undefined): number | null | undefined {
  if (value === 'none') return null;
  if (!value || !/^[1-9][0-9]*$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
