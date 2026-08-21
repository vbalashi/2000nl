#!/usr/bin/env node
/* eslint-disable no-console */

import fs from "node:fs";
import path from "node:path";
import { OpenAITranslator } from "../lib/translation/openaiTranslator";
import { loadTranslationConfigFromEnv } from "../lib/translation/translationProvider";
import {
  prepareTranslationEvalRun,
  evaluateDictionaryMeaningPrimaryText,
  prepareDictionaryMeaningEvalCase,
  type PreparedTranslationEvalCase,
} from "./translationEvalHarness";
import { translationEvalCases } from "./translationEvalCases";

function getArg(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function stripOptionalQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function loadEnvLocalIfNeeded() {
  const candidates = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), "apps", "ui", ".env.local"),
  ];
  const envPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!envPath) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = stripOptionalQuotes(trimmed.slice(separator + 1).trim());
    if (key && !process.env[key]) process.env[key] = value;
  }
}

function appendJsonl(filename: string | null, value: unknown) {
  if (!filename) return;
  fs.appendFileSync(filename, `${JSON.stringify(value)}\n`, "utf8");
}

function dryRunRecord(item: PreparedTranslationEvalCase) {
  return {
    id: item.id,
    targetLang: item.targetLang,
    context: item.context,
    texts: item.texts,
    expectations: item.expectations,
    request: JSON.parse(item.messages[1].content),
  };
}

async function main() {
  loadEnvLocalIfNeeded();
  const selected = prepareTranslationEvalRun(translationEvalCases, {
    caseId: getArg("--case"),
    casePrefix: getArg("--case-prefix"),
  });
  if (selected.length === 0) {
    throw new Error("No translation evaluation cases matched the selection");
  }

  const useMeaningContract = hasFlag("--meaning-contract");

  if (hasFlag("--dry-run")) {
    console.log(
      JSON.stringify(
        useMeaningContract
          ? translationEvalCases
              .filter((item) => selected.some((prepared) => prepared.id === item.id))
              .map(prepareDictionaryMeaningEvalCase)
          : selected.map(dryRunRecord),
        null,
        2,
      ),
    );
    return;
  }

  const config = loadTranslationConfigFromEnv();
  const apiKey = config.apiKeys.openai ?? "";
  const apiUrl = config.apiUrls?.openai ?? "";
  const model = config.models?.openai;
  if (!apiKey) throw new Error("Azure OpenAI API key is not configured");
  if (!apiUrl.toLowerCase().includes(".openai.azure.com")) {
    throw new Error("Translation evaluation requires the private Azure OpenAI endpoint");
  }

  const translator = new OpenAITranslator({
    apiKey,
    apiUrl,
    model,
    maxRetries: 1,
    timeoutMs: 60_000,
  });
  const logJsonl = getArg("--log-jsonl");
  let failed = false;

  for (const item of selected) {
    const startedAt = Date.now();
    const sourceCase = translationEvalCases.find((candidate) => candidate.id === item.id)!;
    if (useMeaningContract) {
      const meaningCase = prepareDictionaryMeaningEvalCase(sourceCase);
      const result = await translator.translateDictionaryMeaning(meaningCase.request);
      const evaluation = evaluateDictionaryMeaningPrimaryText(
        result.entryTranslation?.primaryText ?? null,
        item.expectations,
      );
      failed ||= evaluation.status === "evaluated" && !evaluation.passed;
      const record = {
        id: item.id,
        targetLang: item.targetLang,
        expectations: item.expectations,
        request: meaningCase.request,
        result: {
          entryTranslation: result.entryTranslation,
          contentTranslations: result.contentTranslations,
        },
        model: result.meta.model ?? model ?? null,
        providerUsed: result.meta.providerUsed,
        evaluation,
        elapsedMs: Date.now() - startedAt,
      };
      console.log(JSON.stringify(record, null, 2));
      appendJsonl(logJsonl, record);
      continue;
    }
    const result = await translator.translateWithContextAndNote(item.texts, item.targetLang, item.context);
    const record = {
      id: item.id,
      targetLang: item.targetLang,
      context: item.context,
      texts: item.texts,
      expectations: item.expectations,
      result: {
        translations: result.translations,
        literalTranslations: result.literalTranslations ?? null,
        note: result.note,
      },
      model: result.meta?.model ?? model ?? null,
      providerUsed: result.meta?.providerUsed ?? null,
      elapsedMs: Date.now() - startedAt,
    };
    console.log(JSON.stringify(record, null, 2));
    appendJsonl(logJsonl, record);
  }
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
