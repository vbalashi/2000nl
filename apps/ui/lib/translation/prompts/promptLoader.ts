import fs from "fs";
import path from "path";
import crypto from "crypto";

const cache = new Map<string, string>();

function resolvePromptPath(filename: string) {
  const externalDirectory = process.env.TRANSLATION_PROMPTS_DIR?.trim();
  if (externalDirectory) return path.resolve(externalDirectory, filename);
  // Common runtime cwd is `apps/ui` (Next dev/build/start, `npm -C apps/ui ...`).
  // When running from monorepo root, also support `apps/ui/...`.
  const direct = path.join(process.cwd(), "lib", "translation", "prompts", filename);
  if (fs.existsSync(direct)) return direct;
  return path.join(process.cwd(), "apps", "ui", "lib", "translation", "prompts", filename);
}

export function loadPromptText(filename: string) {
  if (path.basename(filename) !== filename || !filename.endsWith(".txt")) {
    throw new Error("Invalid translation prompt filename");
  }
  const configuredJson = process.env.TRANSLATION_PROMPTS_JSON;
  // Include resource identity so tests and restarted/updated configurations do
  // not reuse a different bundle's bytes. Never expose secret text in errors.
  const resource = configuredJson !== undefined
    ? crypto.createHash("sha256").update(configuredJson).digest("hex")
    : process.env.TRANSLATION_PROMPTS_DIR?.trim() || "bundled";
  const key = `${resource}:${filename}`;
  const cached = cache.get(key);
  if (typeof cached === "string") return cached;

  try {
    let text: unknown;
    if (configuredJson !== undefined) {
      let bundle: unknown;
      try {
        bundle = JSON.parse(configuredJson);
      } catch {
        throw new Error("Translation prompt configuration is invalid");
      }
      if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
        throw new Error("Translation prompt configuration is invalid");
      }
      text = Object.hasOwn(bundle, filename)
        ? (bundle as Record<string, unknown>)[filename]
        : undefined;
      if (text === undefined) throw new Error(`Translation prompt is unavailable: ${filename}`);
    } else {
      text = fs.readFileSync(resolvePromptPath(filename), "utf8");
    }
    if (typeof text !== "string" || !text.trim()) {
      throw new Error(`Translation prompt is empty: ${filename}`);
    }
    cache.set(key, text);
    return text;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Translation prompt")) {
      throw error;
    }
    throw new Error(`Translation prompt is unavailable: ${filename}`, {
      cause: error,
    });
  }
}
