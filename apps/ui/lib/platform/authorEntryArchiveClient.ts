import { authenticatedJsonHeaders } from "./platformV2Http";
import { platformFetchWithTimeout } from "./platformFetchWithTimeout";

export type AuthorEntryArchiveResult = "archived" | "rejected" | "uncertain";

/** A lost write response is never replayed automatically or reported as success. */
export async function archiveAuthorEntry(entryId: string, userId: string): Promise<AuthorEntryArchiveResult> {
  const headers = await authenticatedJsonHeaders(userId);
  try {
    const response = await platformFetchWithTimeout("/api/platform/v1/actions", {
      method: "POST", credentials: "same-origin", cache: "no-store", headers,
      body: JSON.stringify({ action: "delete-user-entry", entryId }),
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.ok === true && result.entryId === entryId && result.action === "delete-user-entry") return "archived";
    // A server failure may follow a committed mutation, so retain uncertainty.
    return response.status >= 400 && response.status < 500 ? "rejected" : reconcileArchive(entryId, userId);
  } catch {
    return reconcileArchive(entryId, userId);
  }
}

/** Only an owner-scoped authoritative archived flag can resolve a lost response. */
async function reconcileArchive(entryId: string, userId: string): Promise<AuthorEntryArchiveResult> {
  try {
    const headers = await authenticatedJsonHeaders(userId);
    const response = await platformFetchWithTimeout(`/api/library/author-entries/${encodeURIComponent(entryId)}/archive`, {
      method: "GET", credentials: "same-origin", cache: "no-store", headers,
    });
    const status = await response.json().catch(() => null);
    if (!response.ok || status?.entryId !== entryId || typeof status.archived !== "boolean" ||
      !Number.isSafeInteger(status.sourceVersion) || status.sourceVersion < 1) return "uncertain";
    return status.archived ? "archived" : "rejected";
  } catch { return "uncertain"; }
}
