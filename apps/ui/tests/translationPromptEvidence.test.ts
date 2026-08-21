import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { getOpenAiDictionaryMeaningPromptFingerprint } from "@/lib/translation/prompts/promptFingerprint";
import {
  prepareDictionaryMeaningEvalCase,
  requestFingerprint,
} from "@/scripts/translationEvalHarness";
import { translationEvalCases } from "@/scripts/translationEvalCases";

const evidenceDirectory = path.resolve(
  process.cwd(),
  "../../docs/architecture/evidence/issue-196",
);
const evidencePath = path.join(
  evidenceDirectory,
  "live-eval-current-prompt.json",
);

describe("issue #196 live prompt evidence", () => {
  test("preserves six safe typisch runs and executable neighboring results", () => {
    const raw = fs.readFileSync(evidencePath, "utf8");
    const evidence = JSON.parse(raw);
    const typisch = translationEvalCases.find(
      (item) => item.id === "typisch_bn_strange",
    )!;
    const exactRequest = prepareDictionaryMeaningEvalCase(typisch).request;

    expect(evidence).toMatchObject({
      schemaVersion: "translation-meaning-live-eval-v1",
      fixedPoint: "1f7e5e33ccac33c7d7b902191c0af1b12a3ef558",
      promptFingerprint: getOpenAiDictionaryMeaningPromptFingerprint(),
      source: {
        entryId: exactRequest.entryId,
        sourceContentFingerprint: exactRequest.sourceContentFingerprint,
      },
      typisch: {
        request: exactRequest,
        requestFingerprint: requestFingerprint(exactRequest),
      },
    });
    expect(evidence.typisch.runs).toHaveLength(6);
    for (const run of evidence.typisch.runs) {
      expect(Object.keys(run).sort()).toEqual([
        "baseText",
        "evaluation",
        "primaryText",
      ]);
      expect(run.evaluation).toMatchObject({
        status: "evaluated",
        passed: true,
      });
    }

    const neighborIds = [
      "goed_zn_goods",
      "goed_zn_moral_good",
      "goed_zn_cloth",
    ];
    expect(evidence.neighbors.map((item: { id: string }) => item.id)).toEqual(
      neighborIds,
    );
    for (const neighbor of evidence.neighbors) {
      const sourceCase = translationEvalCases.find(
        (item) => item.id === neighbor.id,
      )!;
      const request = prepareDictionaryMeaningEvalCase(sourceCase).request;
      expect(neighbor).toMatchObject({
        request,
        requestFingerprint: requestFingerprint(request),
        evaluation: { status: "evaluated", passed: true },
      });
      expect(Object.keys(neighbor).sort()).toEqual([
        "baseText",
        "evaluation",
        "id",
        "primaryText",
        "request",
        "requestFingerprint",
      ]);
    }

    expect(raw).not.toMatch(
      /api[-_]?key|authorization|credential|headers|providerRaw|contentTranslations/i,
    );
    expect(Buffer.byteLength(raw, "utf8")).toBeLessThanOrEqual(32 * 1024);
  });

  test("binds the checked-in artifact to its sha256 sidecar", () => {
    const raw = fs.readFileSync(evidencePath);
    const expected = fs
      .readFileSync(path.join(evidenceDirectory, "live-eval-current-prompt.sha256"), "utf8")
      .trim();

    expect(crypto.createHash("sha256").update(raw).digest("hex")).toBe(expected);
  });
});
