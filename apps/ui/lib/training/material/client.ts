import { authenticatedAccountRequest } from "@/lib/preferences/accountRequest";
import { withPreferenceDeadline } from "@/lib/preferences/requestDeadline";
import {
  parseMaterialPreferences,
  parseMaterialPreferencesSnapshot,
  type MaterialPreferences,
} from "./model";
const url = "/api/settings/material";
export async function fetchAccountMaterialPreferences(userId: string) {
  const response = await withPreferenceDeadline((signal) =>
    authenticatedAccountRequest(url, userId, { method: "GET", signal }),
  );
  if (!response.ok) throw new Error("material_preferences_unavailable");
  const snapshot = parseMaterialPreferencesSnapshot(await response.json());
  if (!snapshot) throw new Error("invalid_material_preferences_response");
  return snapshot;
}
export async function saveAccountMaterialPreferences(
  userId: string,
  expectedRevision: number,
  document: MaterialPreferences,
) {
  if (
    !parseMaterialPreferences(document) ||
    !Number.isInteger(expectedRevision) ||
    expectedRevision < 0 ||
    expectedRevision >= 2147483647
  )
    throw new Error("invalid_material_preferences");
  const response = await withPreferenceDeadline((signal) =>
    authenticatedAccountRequest(url, userId, {
      method: "PUT",
      body: JSON.stringify({ expectedRevision, document }),
      signal,
    }),
  );
  const body: unknown = await response.json();
  const candidate =
    response.status === 409 &&
    body &&
    typeof body === "object" &&
    "snapshot" in body
      ? body.snapshot
      : body;
  const snapshot = parseMaterialPreferencesSnapshot(candidate);
  if (!snapshot || (!response.ok && response.status !== 409))
    throw new Error("material_preferences_unavailable");
  return {
    kind: response.status === 409 ? ("conflict" as const) : ("saved" as const),
    snapshot,
  };
}
