// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkDictionaryTranslationWorkerHealth, recordDictionaryTranslationWorkerHealth } from "@/lib/translation/dictionaryTranslationWorkerHealth";
let directory: string | undefined;
afterEach(async () => {
  vi.unstubAllEnvs(); vi.useRealTimers();
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});
test("disabled releases do not depend on a worker", async () => {
  vi.stubEnv("DICTIONARY_TRANSLATION_JOBS_ENABLED", "false");
  expect((await checkDictionaryTranslationWorkerHealth()).status).toBe("ok");
});
test("enabled releases require a fresh heartbeat from the matching image", async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "translation-worker-health-"));
  const file = path.join(directory, "heartbeat.json");
  vi.stubEnv("DICTIONARY_TRANSLATION_JOBS_ENABLED", "true");
  vi.stubEnv("DICTIONARY_TRANSLATION_WORKER_HEALTH_FILE", file);
  vi.stubEnv("NEXT_PUBLIC_APP_COMMIT", "release-a");
  expect((await checkDictionaryTranslationWorkerHealth()).status).toBe("warning");
  await recordDictionaryTranslationWorkerHealth();
  expect((await checkDictionaryTranslationWorkerHealth()).status).toBe("ok");
  vi.stubEnv("NEXT_PUBLIC_APP_COMMIT", "release-b");
  expect((await checkDictionaryTranslationWorkerHealth()).status).toBe("warning");
  vi.stubEnv("NEXT_PUBLIC_APP_COMMIT", "release-a");
  vi.useFakeTimers(); vi.setSystemTime(Date.now() + 60_001);
  expect((await checkDictionaryTranslationWorkerHealth()).status).toBe("warning");
  await writeFile(file, "invalid");
  expect((await checkDictionaryTranslationWorkerHealth()).status).toBe("warning");
});
