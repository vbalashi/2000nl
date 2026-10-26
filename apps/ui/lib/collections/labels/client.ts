import { authenticatedJsonHeaders } from "@/lib/platform/platformV2Http";
import { parseLabelsSnapshot, type CollectionLabelOperation } from "./model";

export class LabelsRequestError extends Error {
  constructor(readonly code: string) { super(code); }
}
export async function requestLabels(signal: AbortSignal, mutation?: {
  expectedRevision: number; operation: CollectionLabelOperation;
}, expectedUserId?: string) {
  const headers = await authenticatedJsonHeaders(expectedUserId);
  signal.throwIfAborted();
  const response = await fetch("/api/library/collection-labels", {
    method: mutation ? "POST" : "GET",
    headers,
    cache: "no-store", signal,
    ...(mutation ? {body: JSON.stringify(mutation)} : {}),
  });
  if (!response.ok) {
    // Never surface raw SQL or proxy response text to the UI.
    const codes: Record<number, string> = {400: "invalid", 403: "unauthorized", 404: "missing", 409: "conflict", 413: "invalid"};
    throw new LabelsRequestError(codes[response.status] ?? "unavailable");
  }
  const snapshot = parseLabelsSnapshot(await response.json());
  if (!snapshot) throw new LabelsRequestError("unavailable");
  return snapshot;
}
