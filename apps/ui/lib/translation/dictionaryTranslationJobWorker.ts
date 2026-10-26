import type { DictionaryMeaningTranslationRequestV1 } from "./dictionaryMeaningTranslationContract";
import { dictionaryMeaningTranslationCoverage } from "./dictionaryMeaningTranslationReadiness";
import type { TranslationOverlay } from "../types";
import { withDictionaryTranslationDeadline } from "./dictionaryTranslationDeadline";
import { normalizeTranslationProviderError } from "./translationProviderFailure";

export type DictionaryTranslationJob = {
  id: string;
  word_entry_id: string;
  target_lang: string;
  provider: "openai" | "deepl" | "gemini";
  source_fingerprint: string;
  source_content_revision: string;
  source_row_revision: string;
  translation_policy_version: string;
  provider_revision: string;
  lease_token: string;
  attempt: number;
  created_at: string;
  available_at: string;
};
export class DictionaryTranslationJobSourceChangedError extends Error {
  constructor() {
    super("translation_job_source_changed");
  }
}

type RpcClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: any; error: unknown }>;
};
type ExecutionResult = {
  request: DictionaryMeaningTranslationRequestV1;
  overlay: TranslationOverlay;
  note: string | null;
};
export type JobMetric = {
  event:
    | "translation_job_started"
    | "translation_job_completed"
    | "translation_job_continued"
    | "translation_job_failed"
    | "translation_job_lease_lost";
  jobId: string;
  attempt: number;
  durationMs: number;
  queueWaitMs: number;
};

/** No browser/request lifetime participates in execution or publication. */
export async function executeClaimedDictionaryTranslationJob(input: {
  client: RpcClient;
  job: DictionaryTranslationJob;
  execute: (job: DictionaryTranslationJob) => Promise<ExecutionResult | { continuation: true }>;
  metric?: (event: JobMetric) => void;
  heartbeatMs?: number;
  rpcTimeoutMs?: number;
  onLeaseRenewed?: () => Promise<void>;
}): Promise<"ready" | "failed" | "lease_lost" | "continued"> {
  const { client, job } = input;
  const rpc = async (name: string, args: Record<string, unknown>) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve(client.rpc(name, args)),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("translation_job_rpc_timeout")),
            input.rpcTimeoutMs ?? 10_000,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };
  const startedAt = Date.now();
  const metric = (event: JobMetric["event"]) =>
    input.metric?.({
      event,
      jobId: job.id,
      attempt: job.attempt,
      durationMs: Date.now() - startedAt,
      queueWaitMs: Math.max(0, startedAt - Date.parse(job.available_at)),
    });
  metric("translation_job_started");
  let stopped = false;
  let leaseLost = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: Promise<void> = Promise.resolve();
  const scheduleHeartbeat = () => {
    timer = setTimeout(() => {
      heartbeat = (async () => {
        try {
          const { data, error } = await rpc(
            "heartbeat_dictionary_translation_job_v1",
            { p_job_id: job.id, p_lease_token: job.lease_token },
          );
          if (error || data !== true) leaseLost = true;
          else await input.onLeaseRenewed?.();
        } catch {
          leaseLost = true;
        }
        if (!stopped && !leaseLost) scheduleHeartbeat();
      })();
    }, input.heartbeatMs ?? 20_000);
  };
  scheduleHeartbeat();
  const stopHeartbeat = async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await heartbeat;
  };
  try {
    const result = await withDictionaryTranslationDeadline(() =>
      input.execute(job),
    );
    if ("continuation" in result) {
      await stopHeartbeat();
      metric("translation_job_continued");
      return "continued";
    }
    if (
      result.request.entryId !== job.word_entry_id ||
      result.request.targetLanguageCode !== job.target_lang ||
      result.request.sourceContentFingerprint !== job.source_content_revision ||
      !dictionaryMeaningTranslationCoverage(result.request, result.overlay)
        .requestComplete
    ) {
      throw new Error("translation_job_invalid_result");
    }
    await stopHeartbeat();
    if (leaseLost) {
      metric("translation_job_lease_lost");
      return "lease_lost";
    }
    const { data, error } = await rpc(
      "complete_dictionary_translation_job_v1",
      {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
        p_overlay: result.overlay,
        p_note: result.note,
      },
    );
    if (error) throw error;
    if (data !== true) {
      metric("translation_job_lease_lost");
      return "lease_lost";
    }
    metric("translation_job_completed");
    return "ready";
  } catch (error) {
    await stopHeartbeat();
    if (leaseLost) {
      metric("translation_job_lease_lost");
      return "lease_lost";
    }
    const { failure } = normalizeTranslationProviderError(error);
    const result = await rpc("fail_dictionary_translation_job_v1", {
      p_job_id: job.id,
      p_lease_token: job.lease_token,
      p_error_code:
        error instanceof DictionaryTranslationJobSourceChangedError
          ? "source_changed"
          : failure.code,
      p_retryable: !(
        error instanceof DictionaryTranslationJobSourceChangedError
      ),
    });
    // An unavailable database leaves the lease to expire and recover. Never
    // pretend that an unconfirmed completion or failure has been committed.
    if (result.error) throw new Error("translation_job_failure_unconfirmed");
    if (result.data !== true) {
      metric("translation_job_lease_lost");
      return "lease_lost";
    }
    metric("translation_job_failed");
    return "failed";
  } finally {
    await stopHeartbeat();
  }
}
