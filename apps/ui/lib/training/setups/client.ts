import { authenticatedAccountRequest } from "@/lib/preferences/accountRequest";
import {
  parseTrainingSetupsSnapshot,
  type TrainingSetupsDocument,
  type TrainingSetupsSnapshot,
} from "./model";
export type SaveTrainingSetupsResult =
  | { kind: "saved" | "conflict"; snapshot: TrainingSetupsSnapshot }
  | { kind: "error" };

export async function fetchAccountTrainingSetups(
  userId: string,
  signal?: AbortSignal,
): Promise<TrainingSetupsSnapshot> {
  const response = await authenticatedAccountRequest(
    "/api/training/setups",
    userId,
    { method: "GET", signal },
  );
  if (!response.ok) throw new Error("Training setups unavailable");
  const snapshot = parseTrainingSetupsSnapshot(await response.json());
  if (!snapshot) throw new Error("Invalid training setups response");
  return snapshot;
}
/** Initialization is best effort and independent of displaying saved setups. */
export async function initializeStarterTraining(userId: string, signal?: AbortSignal): Promise<"complete" | "pending" | "done"> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) controller.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = authenticatedAccountRequest("/api/training/setups", userId, { method: "POST", signal: controller.signal });
    const response = await Promise.race([request, new Promise<null>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve(null); }, 12000);
    })]);
    if (!response?.ok || controller.signal.aborted) return "pending";
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("status" in body)) return "pending";
    return body.status === "complete" ? "complete" : body.status === "superseded" || body.status === "not_applicable" ? "done" : "pending";
  } catch { return "pending"; }
  finally { if (timer) clearTimeout(timer); signal?.removeEventListener("abort", cancel); controller.abort(); }
}
export async function saveAccountTrainingSetups(
  userId: string,
  revision: number,
  document: TrainingSetupsDocument,
): Promise<SaveTrainingSetupsResult> {
  try {
    const response = await authenticatedAccountRequest(
      "/api/training/setups",
      userId,
      {
        method: "PUT",
        body: JSON.stringify({ expectedRevision: revision, document }),
      },
    );
    const body: unknown = await response.json();
    const snapshot = parseTrainingSetupsSnapshot(
      response.status === 409 &&
        body &&
        typeof body === "object" &&
        "snapshot" in body
        ? body.snapshot
        : body,
    );
    if (!snapshot || (!response.ok && response.status !== 409))
      return { kind: "error" };
    return { kind: response.status === 409 ? "conflict" : "saved", snapshot };
  } catch {
    return { kind: "error" };
  }
}
