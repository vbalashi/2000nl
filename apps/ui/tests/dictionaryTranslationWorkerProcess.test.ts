// @vitest-environment node
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { createServer, type ServerResponse } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { dictionaryMeaningTranslationIdentity } from "@/lib/translation/dictionaryMeaningTranslationIdentity";

const bundle = path.resolve(
  ".next/dictionary-translation-worker-process-test.cjs",
);
const children: ChildProcess[] = [];
afterEach(() => {
  children.forEach((child) => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });
  children.length = 0;
  vi.unstubAllEnvs();
});
beforeAll(async () => {
  await build({
    entryPoints: [path.resolve("scripts/dictionary-translation-worker.ts")],
    outfile: bundle,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
  });
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function exit(child: ChildProcess) {
  return new Promise<number | null>((resolve) =>
    child.once("close", (code) => resolve(code)),
  );
}

describe("standalone translation worker process", () => {
  test("a killed worker is replaceable; the new process publishes with its new lease and drains on SIGTERM", async () => {
    vi.stubEnv("DICTIONARY_TRANSLATION_PROFILE", "luna6");
    const word = {
      id: randomUUID(),
      language_code: "nl",
      headword: "oog",
      raw: { meanings: [{ definition: "synthetic source meaning" }] },
    };
    const identity = await dictionaryMeaningTranslationIdentity({
      wordEntryId: word.id,
      word: word as any,
      dbLang: "ru",
      provider: "openai",
    });
    const firstModel = deferred<void>();
    const completed = deferred<any>();
    const logs: string[] = [];
    const oldToken = randomUUID(),
      newToken = randomUUID();
    let token = oldToken;
    let claimed = false;
    let modelCalls = 0;
    let oldModelResponse: ServerResponse | undefined;
    const published: any[] = [];
    const job = {
      id: randomUUID(),
      word_entry_id: word.id,
      target_lang: "ru",
      provider: "openai",
      source_fingerprint: identity.fingerprint,
      source_content_revision: identity.sourceContentRevision,
      translation_policy_version: identity.policyVersion,
      provider_revision: identity.providerRevision,
      source_row_revision: "a".repeat(64),
      created_at: new Date().toISOString(),
      available_at: new Date().toISOString(),
    };
    const server = createServer(async (req, res) => {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      res.setHeader("Content-Type", "application/json");
      const reply = (value: unknown) => res.end(JSON.stringify(value));
      if (req.url === "/rest/v1/rpc/claim_dictionary_translation_job_v1") {
        if (claimed) return reply([]);
        claimed = true;
        return reply([
          { ...job, lease_token: token, attempt: token === oldToken ? 1 : 2 },
        ]);
      }
      if (req.url === "/rest/v1/rpc/dictionary_translation_source_v1")
        return reply({ word, revision: job.source_row_revision });
      if (req.url?.includes("/chat/completions")) {
        modelCalls++;
        if (modelCalls === 1) {
          oldModelResponse = res;
          firstModel.resolve();
          return;
        }
        return reply({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  entryTranslation: {
                    primaryText: "глаз",
                    alternativeTexts: [],
                    baseText: "глаз",
                    note: null,
                  },
                  contentTranslations: [
                    {
                      fieldId: "definition",
                      text: "synthetic translated meaning",
                    },
                  ],
                }),
              },
            },
          ],
        });
      }
      if (req.url === "/rest/v1/rpc/complete_dictionary_translation_job_v1") {
        const body = JSON.parse(raw);
        published.push(body);
        reply(body.p_lease_token === newToken);
        completed.resolve(body);
        return;
      }
      if (req.url === "/rest/v1/rpc/heartbeat_dictionary_translation_job_v1")
        return reply(true);
      if (req.url === "/rest/v1/rpc/fail_dictionary_translation_job_v1")
        return reply(true);
      res.statusCode = 404;
      reply({ error: "unknown test endpoint" });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("test server did not listen");
    const origin = `http://127.0.0.1:${address.port}`;
    const start = () => {
      const child = spawn(process.execPath, [bundle], {
        cwd: process.cwd(),
        env: {
          NODE_ENV: "test",
          DICTIONARY_TRANSLATION_JOBS_ENABLED: "true",
          DICTIONARY_TRANSLATION_PROFILE: "luna6",
          TRANSLATION_PROVIDER: "openai",
          SUPABASE_URL: origin,
          SUPABASE_SECRET_KEY: "worker-test-key",
          AZURE_OPENAI_GPT6_LUNA_ENDPOINT: origin,
          AZURE_OPENAI_GPT6_LUNA_API_KEY_PRIMARY: "provider-test-key",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      children.push(child);
      child.stdout!.on("data", (data) => logs.push(String(data)));
      child.stderr!.on("data", (data) => logs.push(String(data)));
      return child;
    };
    try {
      const first = start();
      await firstModel.promise;
      const firstExit = exit(first);
      first.kill("SIGKILL");
      await firstExit;
      oldModelResponse?.destroy();
      // Real PostgreSQL tests separately prove lease expiry, reclaim and fencing.
      // This protocol fixture hands the recovered lease to a fresh OS process.
      token = newToken;
      claimed = false;
      const second = start();
      const publication = await completed.promise;
      expect(publication.p_lease_token).toBe(newToken);
      expect(publication.p_overlay.meanings[0].definition).toBe(
        "synthetic translated meaning",
      );
      expect(published).toHaveLength(1);
      const secondExit = exit(second);
      second.kill("SIGTERM");
      expect(await secondExit).toBe(0);
      expect(logs.join("")).not.toContain("worker-test-key");
      expect(logs.join("")).not.toContain("provider-test-key");
      expect(logs.join("")).not.toContain("synthetic source meaning");
    } finally {
      children.forEach((child) => {
        if (child.exitCode === null) child.kill("SIGKILL");
      });
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 15_000);
});
