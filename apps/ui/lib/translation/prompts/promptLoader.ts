import fs from "fs";
import path from "path";

const cache = new Map<string, string>();

function resolvePromptPath(filename: string) {
  // Common runtime cwd is `apps/ui` (Next dev/build/start, `npm -C apps/ui ...`).
  // When running from monorepo root, also support `apps/ui/...`.
  const direct = path.join(process.cwd(), "lib", "translation", "prompts", filename);
  if (fs.existsSync(direct)) return direct;
  return path.join(process.cwd(), "apps", "ui", "lib", "translation", "prompts", filename);
}

export function loadPromptText(filename: string) {
  const key = filename;
  const cached = cache.get(key);
  if (typeof cached === "string") return cached;

  const fullPath = resolvePromptPath(filename);
  try {
    const text = fs.readFileSync(fullPath, "utf8");
    cache.set(key, text);
    return text;
  } catch {
    cache.set(key, "");
    return "";
  }
}
