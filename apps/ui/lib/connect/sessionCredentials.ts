import "server-only";
import crypto from "node:crypto";
import type { User } from "@supabase/supabase-js";

export const CONNECT_ACCESS_PREFIX = "nlc_a2_";
export const CONNECT_REFRESH_PREFIX = "nlc_r2_";
export const CONNECT_BACKEND_HEADER = "x-connect-backend-proof";
export const CONNECT_REFRESH_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

export type ProviderSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number | null;
  expires_in?: number | null;
  token_type?: string;
  user: User;
};
export type ProviderEnvelope = { session: ProviderSession; proof: string };
export type ConnectedSessionRow = {
  id: string; client_id: string; user_id: string; scopes: string[];
  grant_revision: string; refresh_token_family_hashes: string[];
  credential_version: number; auth_session_id: string | null;
  access_token_hash: string | null; access_token_expires_at: string | null;
  refresh_token_hash: string; refresh_token_expires_at: string | null;
  provider_session_ciphertext: string | null; revoked_at: string | null;
};
export const CONNECT_SESSION_COLUMNS = "id,client_id,user_id,scopes,grant_revision,refresh_token_family_hashes,credential_version,auth_session_id,access_token_hash,access_token_expires_at,refresh_token_hash,refresh_token_expires_at,provider_session_ciphertext,revoked_at";
export const tokenHash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
export const opaqueToken = (prefix: string) => prefix + crypto.randomBytes(32).toString("base64url");
export const isConnectAccessToken = (token: string) => /^nlc_a2_[A-Za-z0-9_-]{43}$/.test(token);
export const isConnectRefreshToken = (token: string) => /^nlc_r2_[A-Za-z0-9_-]{43}$/.test(token);

// Only parse provider-verified tokens (getUser/verifyOtp/refreshSession). Claims
// are identifiers, never a replacement for provider and DB session validation.
export function verifiedSessionId(token: string): string | null {
  try {
    const value = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).session_id;
    return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
  } catch { return null; }
}
function encryptionKey() {
  const value = process.env.CONNECT_SESSION_ENCRYPTION_KEY ?? "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error("connect_credentials_unavailable");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("connect_credentials_unavailable");
  return key;
}
export function assertConnectEncryptionConfigured() { encryptionKey(); }
export function encryptProviderSession(value: ProviderEnvelope, sessionId: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`2000nl-connect-v2:${sessionId}`));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v2", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function decryptProviderSession(value: string, sessionId: string): ProviderEnvelope {
  const [version, iv, tag, encrypted, extra] = value.split(".");
  if (version !== "v2" || !iv || !tag || !encrypted || extra) throw new Error("connect_credentials_unavailable");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(`2000nl-connect-v2:${sessionId}`));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const data = JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8")) as ProviderEnvelope;
  if (!data.session?.access_token || !data.session.refresh_token || !data.session.user?.id || !data.proof) throw new Error("connect_credentials_unavailable");
  return data;
}
export function connectedCredentialPayload(session: ProviderSession, scopes: string[], accessToken: string, refreshToken: string) {
  const expiresAt = session.expires_at;
  if (!expiresAt || expiresAt <= Date.now()/1000) throw new Error("invalid_provider_session");
  return { access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt,
    expires_in: Math.max(0, Math.floor(expiresAt-Date.now()/1000)), token_type: "bearer", scope: scopes.join(" "),
    user: { id: session.user.id, email: session.user.email ?? null } };
}
