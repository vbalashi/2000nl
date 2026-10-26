import { authenticatedJsonHeaders } from "./platformV2Http";
import { platformFetchWithTimeout } from "./platformFetchWithTimeout";
import {
  parseEntryCopyPreview,
  parseEntryCopyReceipt,
  type EntryCopyCommand,
  type EntryCopyPreview,
  type EntryCopyReceipt,
} from "./independentEntryCopyContract";
const endpoint = "/api/library/entry-copies";
export async function previewEntryCopy(
  entryId: string,
  userId: string,
): Promise<EntryCopyPreview | null> {
  const headers = await authenticatedJsonHeaders(userId);
  const response = await platformFetchWithTimeout(
    `${endpoint}?sourceEntryId=${encodeURIComponent(entryId)}`,
    { credentials: "same-origin", cache: "no-store", headers },
  );
  const data = await response.json().catch(() => null);
  return response.ok ? parseEntryCopyPreview(data, entryId) : null;
}
export async function reconcileEntryCopy(
  operationId: string,
  userId: string,
): Promise<EntryCopyReceipt | null> {
  try {
    const headers = await authenticatedJsonHeaders(userId);
    const response = await platformFetchWithTimeout(
      `${endpoint}?operationId=${encodeURIComponent(operationId)}`,
      { credentials: "same-origin", cache: "no-store", headers },
    );
    const data = await response.json().catch(() => null);
    return response.ok ? parseEntryCopyReceipt(data, operationId) : null;
  } catch {
    return null;
  }
}
export type EntryCopyResult =
  | {
      status: "completed";
      entryId: string;
      dictionaryId: string;
      headword: string;
      languageCode: string;
    }
  | { status: "changed" | "rejected" | "uncertain" };
/** Keep the same client intent UUID until the outcome has been resolved. */
export async function submitEntryCopy(
  command: EntryCopyCommand,
  userId: string,
): Promise<EntryCopyResult> {
  const headers = await authenticatedJsonHeaders(userId);
  try {
    const response = await platformFetchWithTimeout(endpoint, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers,
      body: JSON.stringify(command),
    });
    const data = await response.json().catch(() => null);
    const receipt = response.ok
      ? parseEntryCopyReceipt(data, command.operationId)
      : null;
    if (receipt?.status === "completed")
      return {
        status: "completed",
        entryId: receipt.entryId,
        dictionaryId: receipt.dictionaryId,
        headword: receipt.headword,
        languageCode: receipt.languageCode,
      };
    if (response.status === 409 && data?.error === "copy_source_changed")
      return { status: "changed" };
    if (response.status >= 400 && response.status < 500)
      return { status: "rejected" };
  } catch {
    /* The write may have committed. Read the owner receipt, never replay here. */
  }
  const receipt = await reconcileEntryCopy(command.operationId, userId);
  return receipt?.status === "completed"
    ? {
        status: "completed",
        entryId: receipt.entryId,
        dictionaryId: receipt.dictionaryId,
        headword: receipt.headword,
        languageCode: receipt.languageCode,
      }
    : { status: "uncertain" };
}
