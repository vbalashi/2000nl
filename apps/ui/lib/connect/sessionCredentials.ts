import crypto from "node:crypto";

export const CONNECT_ACCESS_PREFIX = "nlc_a_";
export const CONNECT_REFRESH_PREFIX = "nlc_r_";
export const CONNECT_REFRESH_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export function isConnectCredential(token: string) {
  return token.startsWith("nlc_");
}

export function credentialKey(): Buffer {
  const value = process.env.CONNECT_SESSION_ENCRYPTION_KEY ?? "";
  if (!/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error("connect_session_key_not_configured");
  }
  return Buffer.from(value, "hex");
}

function aad(sessionId: string, userId: string, clientId: string) {
  return Buffer.from(JSON.stringify([2, sessionId, userId, clientId]));
}

export function encryptNativeSession(
  session: { access_token: string; refresh_token: string },
  sessionId: string,
  userId: string,
  clientId: string,
): string {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", credentialKey(), nonce);
  cipher.setAAD(aad(sessionId, userId, clientId));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  }), "utf8"), cipher.final()]);
  return [nonce, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptNativeSession(value: string, sessionId: string, userId: string, clientId: string) {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("invalid_connect_session");
  const [nonce, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", credentialKey(), nonce);
  decipher.setAAD(aad(sessionId, userId, clientId));
  decipher.setAuthTag(tag);
  const parsed: unknown = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || !("access_token" in parsed) || !("refresh_token" in parsed) || typeof parsed.access_token !== "string" || typeof parsed.refresh_token !== "string") {
    throw new Error("invalid_connect_session");
  }
  return { access_token: parsed.access_token, refresh_token: parsed.refresh_token };
}
