import type { DictionaryMeaningTranslationRequestV1 } from "../../lib/translation/dictionaryMeaningTranslationContract";
export type EvalCase = {
  id: string;
  allowedStems: string[];
  baseAllowedStems: string[];
  alternativesUseful: boolean;
  entryExpected?: boolean;
  request: DictionaryMeaningTranslationRequestV1;
};
export type ModelProfile = {
  id: string;
  model: string;
  envSource: "project" | "shared";
  envPrefix: string;
  requestSettings: { temperature?: number; reasoning_effort?: string; max_tokens?: number; max_completion_tokens?: number };
  tariff: null;
};
export type RunManifest = {
  schemaVersion: "translation-eval-run-v1";
  runId: string;
  createdAt: string;
  sourceCommit: string;
  sourceDirty: boolean;
  suiteId: string;
  split: "development" | "validation";
  promptId: string;
  promptFingerprint: string;
  modelProfile: ModelProfile;
  repeat: number;
  maxCalls: number;
  maxOutputTokens: number;
  deadlineSeconds: number;
  sourceHashes: Record<string, string>;
  snapshotHashes: Record<string, string>;
  jobs: Array<{ jobId: string; caseId: string; repetition: number }>;
};
