import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { AssistantFeedbackJourney } from "./assistantFeedbackContract";

function signingKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY;
}

function sign(key: string, account: string, payload: string) {
  return createHmac("sha256", key).update(JSON.stringify(["assistant-feedback:v1", account, payload])).digest();
}

export function issueAssistantFeedbackRef(account: string, journey: AssistantFeedbackJourney, language: string) {
  const key = signingKey();
  if (!key) return undefined;
  const payload = [randomUUID(), journey, language].join(".");
  return payload + "." + sign(key, account, payload).toString("base64url");
}

export function readAssistantFeedbackRef(account: string, token: unknown) {
  const key = signingKey();
  if (!key || typeof token !== "string" || token.length > 150) return null;
  const [id, journey, language, signature, extra] = token.split(".");
  if (extra !== undefined || !/^[0-9a-f-]{36}$/.test(id) ||
      (journey !== "search" && journey !== "draft") ||
      !/^[a-z]{2,3}(-[a-zA-Z]+)?$/.test(language) || language.length > 20 ||
      !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  const expected = sign(key, account, [id, journey, language].join("."));
  if (!timingSafeEqual(expected, Buffer.from(signature, "base64url"))) return null;
  return { id, journey, language } as const;
}
