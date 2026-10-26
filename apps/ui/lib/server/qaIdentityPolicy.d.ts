export const QA_ACCOUNT_MARKER: "is_qa_test_user";
export const PRODUCTION_SUPABASE_ORIGIN: "https://lliwdcpuuzjmxyzrjtoz.supabase.co";

export type VerifiedQaIdentity = { id: string; email: string };

export function normalizeQaEmail(value: string | null | undefined): string;
export function parseQaEmailList(value: string | null | undefined): string[];
export function assertQaRequest(input: {
  requestedEmail: string | null | undefined;
  allowedEmails: readonly string[];
  referenceEmails: readonly string[];
}): { email: string };
export function assertQaAccount(
  account:
    | {
        id?: string | null;
        email?: string | null;
        app_metadata?: Record<string, unknown> | null;
      }
    | null
    | undefined,
  expectedEmail: string
): VerifiedQaIdentity;
export function assertQaSessionPrincipal(
  session:
    | { user?: { id?: string | null; email?: string | null } | null }
    | null
    | undefined,
  expected: VerifiedQaIdentity
): VerifiedQaIdentity;
export function assertProductionSupabaseUrl(value: string | null | undefined): string;
