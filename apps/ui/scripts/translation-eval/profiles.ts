import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ModelProfile } from "./types";
import { hash } from "./evaluate";

/** Read only the selected profile's source. Never persist env, key or URL. */
export function resolveProfile(profile: ModelProfile, projectEnvFile: string) {
  const filename = profile.envSource === "shared"
    ? path.join(os.homedir(), ".config/ot-learning/azure.env") : projectEnvFile;
  const env: Record<string, string | undefined> = { ...process.env };
  for (const line of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  const prefix = profile.envPrefix;
  const endpoint = env[`${prefix}_ENDPOINT`];
  const deployment = env[`${prefix}_DEPLOYMENT`] ?? (profile.id === "gpt41" ? env.OPENAI_MODEL : undefined);
  const key = env[`${prefix}_API_KEY_PRIMARY`] ?? env[`${prefix}_API_KEY`] ?? env.AZURE_OPENAI_API_KEY;
  if (!endpoint || deployment !== profile.model || !key) throw new Error("profile_configuration_missing_or_mismatched");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".openai.azure.com") || url.username || url.password || url.search || url.hash) throw new Error("unsafe_endpoint");
  let route = url.pathname.replace(/\/$/, "");
  if (!/\/openai\/v1$/i.test(route)) route += /\/openai$/i.test(route) ? "/v1" : "/openai/v1";
  const resolvedUrl = `${url.origin}${route}/chat/completions`;
  return { url: resolvedUrl, key, endpointFingerprint: hash(resolvedUrl) };
}
