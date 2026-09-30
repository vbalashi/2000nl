import { supabase } from "@/lib/supabaseClient";
import { parseTrainingSetupsSnapshot, type TrainingSetupsDocument, type TrainingSetupsSnapshot } from "./model";
export type SaveTrainingSetupsResult =
  | { kind: "saved" | "conflict"; snapshot: TrainingSetupsSnapshot }
  | { kind: "error" };

async function accountRequest(userId: string, init: RequestInit): Promise<Response> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session || data.session.user.id !== userId) throw new Error("Account unavailable");
  return fetch("/api/training/setups", {
    ...init, cache: "no-store",
    headers: { "content-type": "application/json", authorization: `Bearer ${data.session.access_token}` },
  });
}
export async function fetchAccountTrainingSetups(userId: string, signal?: AbortSignal): Promise<TrainingSetupsSnapshot> {
  const response = await accountRequest(userId, { method: "GET", signal });
  if (!response.ok) throw new Error("Training setups unavailable");
  const snapshot = parseTrainingSetupsSnapshot(await response.json());
  if (!snapshot) throw new Error("Invalid training setups response");
  return snapshot;
}
export async function saveAccountTrainingSetups(userId: string, revision: number, document: TrainingSetupsDocument): Promise<SaveTrainingSetupsResult> {
  try {
    const response = await accountRequest(userId, { method: "PUT", body: JSON.stringify({ expectedRevision: revision, document }) });
    const body: unknown = await response.json();
    const snapshot = parseTrainingSetupsSnapshot(response.status === 409 && body && typeof body === "object" && "snapshot" in body ? body.snapshot : body);
    if (!snapshot || (!response.ok && response.status !== 409)) return { kind: "error" };
    return { kind: response.status === 409 ? "conflict" : "saved", snapshot };
  } catch {
    return { kind: "error" };
  }
}
