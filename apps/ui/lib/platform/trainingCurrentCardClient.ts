import { platformV2AuthenticatedJsonHeaders } from "./platformV2Http";
import { platformFetchWithTimeout, withPlatformRequestTimeout } from "./platformFetchWithTimeout";
import { isPlatformLookupV2Response } from "../../../../packages/shared/types/platformV2Runtime";
import type { PlatformLookupV2Response } from "../../../../packages/shared/types/platformV2";

export type CurrentTrainingCardTarget = {
  sessionId: string;
  entryId: string;
  cardTypeId: string;
  sourceVersion: number;
  stateRevision: string;
  targetId?: string;
  direction?: string;
};
export type CurrentTrainingCardPermit = {
  permitId: string;
  expiresAt: string;
  runGeneration: number;
};
export type CurrentTrainingCardContext = {
  sessionId: string;
  permitId: string;
};

async function requestCurrentCard(
  userId: string,
  body: object,
  signal?: AbortSignal,
): Promise<unknown> {
  return withPlatformRequestTimeout(async requestSignal => {
    const headers = await platformV2AuthenticatedJsonHeaders(userId);
    if (requestSignal.aborted) throw new DOMException("Aborted", "AbortError");
    const response = await platformFetchWithTimeout(
      "/api/platform/v2/training/current-card",
      {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers,
        signal: requestSignal,
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) throw new Error(`current_card_http_${response.status}`);
    return response.json();
  }, signal);
}

export async function acknowledgeCurrentTrainingCard(
  userId: string,
  target: CurrentTrainingCardTarget,
  signal?: AbortSignal,
): Promise<CurrentTrainingCardPermit> {
  const payload = await requestCurrentCard(
    userId,
    { operation: "acknowledge", ...target },
    signal,
  );
  if (!payload || typeof payload !== "object")
    throw new Error("current_card_contract_invalid");
  const value = payload as Record<string, unknown>;
  if (
    typeof value.permitId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.permitId,
    ) ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    Date.parse(value.expiresAt) <= Date.now() ||
    !Number.isSafeInteger(value.runGeneration) ||
    Number(value.runGeneration) < 1
  )
    throw new Error("current_card_contract_invalid");
  return {
    permitId: value.permitId,
    expiresAt: value.expiresAt,
    runGeneration: Number(value.runGeneration),
  };
}

export async function readCurrentTrainingCard(
  userId: string,
  input: CurrentTrainingCardContext & {
    entryId: string;
    cardTypeId: string;
    contentLanguageCode: string;
    translationTargetLanguageCode: string | null;
  },
  signal?: AbortSignal,
): Promise<PlatformLookupV2Response> {
  const payload = await requestCurrentCard(
    userId,
    { operation: "read", ...input },
    signal,
  );
  if (!isPlatformLookupV2Response(payload))
    throw new Error("current_card_contract_invalid");
  if (
    payload.groups.length !== 1 ||
    payload.groups[0].entries.length !== 1 ||
    !payload.groups[0].entries.every(
      (entry) => entry.kind === "sense-card" && entry.entryId === input.entryId,
    )
  )
    throw new Error("current_card_contract_invalid");
  return payload;
}
