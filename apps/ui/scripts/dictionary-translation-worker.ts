import { dictionaryTranslationWorkerFetch } from "../lib/translation/dictionaryTranslationWorkerTransport";
import { createClient } from "@supabase/supabase-js";
import {
  executeClaimedDictionaryTranslationJob,
  type DictionaryTranslationJob,
} from "../lib/translation/dictionaryTranslationJobWorker";
import { executeDictionaryTranslationJob } from "../lib/translation/dictionaryTranslationJobExecutor";

let stopping = false;
let wake: (() => void) | undefined;
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    stopping = true;
    wake?.();
  });
function pause(ms: number) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      wake = undefined;
      resolve();
    }, ms);
    wake = () => {
      clearTimeout(timer);
      wake = undefined;
      resolve();
    };
  });
}
async function main() {
  if (process.env.DICTIONARY_TRANSLATION_JOBS_ENABLED !== "true") {
    throw new Error("translation_worker_not_enabled");
  }
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("translation_worker_not_configured");
  const client = createClient(url, key, {
    global: { fetch: dictionaryTranslationWorkerFetch },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  console.log(
    JSON.stringify({
      event: "translation_worker_started",
      commit: process.env.NEXT_PUBLIC_APP_COMMIT ?? null,
    }),
  );
  while (!stopping) {
    try {
      const { data, error } = await client.rpc(
        "claim_dictionary_translation_job_v1",
      );
      if (error) throw error;
      const job = (Array.isArray(data) ? data[0] : data) as
        | DictionaryTranslationJob
        | undefined;
      if (!job) {
        await pause(1_000);
        continue;
      }
      await executeClaimedDictionaryTranslationJob({
        client,
        job,
        execute: (claimed) => executeDictionaryTranslationJob(client, claimed),
        metric: (event) => console.log(JSON.stringify(event)),
      });
    } catch {
      // No raw DB/provider error, credentials or source text enter process logs.
      console.error(
        JSON.stringify({ event: "translation_worker_iteration_failed" }),
      );
      await pause(5_000);
    }
  }
  console.log(JSON.stringify({ event: "translation_worker_stopped" }));
}
main().catch(() => {
  console.error(JSON.stringify({ event: "translation_worker_start_failed" }));
  process.exitCode = 1;
});
