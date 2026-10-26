import { afterEach, expect, test, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { buildTrainingVisualFixtureBundle } from "../playwright/support/trainingVisualFixtureProfile";
import { buildSenseCardDiagnosticReport, freezeSenseCardDiagnosticSnapshot } from "@/lib/feedback/diagnosticReportClient";

afterEach(() => { vi.unstubAllGlobals(); });
test("approved report browser fixture satisfies diagnostic capture contract", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const id = "40700000-0000-4000-8000-000000000001";
  const fixture = buildTrainingVisualFixtureBundle("answer", [{ id }], { diagnosticReportReady: true });
  const group = fixture.lookupGroups[id]!;
  const entry = group.entries[0]!;
  if (entry.kind !== "sense-card") throw new Error("expected sense card");
  await expect(buildSenseCardDiagnosticReport({ snapshot: freezeSenseCardDiagnosticSnapshot({ route: "training", group, entry }), kind: "rendering", comment: null })).resolves.toHaveProperty("reportId");
  vi.unstubAllGlobals();
});
