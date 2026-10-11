import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_AGE_MS = 60_000;
export async function recordDictionaryTranslationWorkerHealth() {
  const file = process.env.DICTIONARY_TRANSLATION_WORKER_HEALTH_FILE;
  if (!file) return; // Process-only local tests need no shared Docker volume.
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify({
    commit: process.env.NEXT_PUBLIC_APP_COMMIT ?? "local",
    checkedAt: Date.now(),
  }), { mode: 0o644 });
  await rename(temporary, file);
}

/** The file is renewed only after a successful claim/lease RPC, not a timer. */
export async function checkDictionaryTranslationWorkerHealth() {
  if (process.env.DICTIONARY_TRANSLATION_JOBS_ENABLED !== "true")
    return { status: "ok" as const, details: { enabled: false } };
  try {
    const file = process.env.DICTIONARY_TRANSLATION_WORKER_HEALTH_FILE;
    if (!file) throw new Error("not_configured");
    const value = JSON.parse(await readFile(file, "utf8"));
    const age = Date.now() - value.checkedAt;
    if (value.commit !== (process.env.NEXT_PUBLIC_APP_COMMIT ?? "local") ||
        !Number.isFinite(age) || age < 0 || age > MAX_AGE_MS)
      throw new Error("stale");
    return { status: "ok" as const, details: { enabled: true } };
  } catch {
    return { status: "warning" as const, message: "Translation worker is unavailable or belongs to another release." };
  }
}
