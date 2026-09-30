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
