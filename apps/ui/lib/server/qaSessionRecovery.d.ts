export function preserveQaRecoverySession(
  outputDir: string,
  session: { access_token: string; [key: string]: unknown }
): string;
export function readQaRecoveryAccessToken(sessionPath: string | null | undefined): string | null;
