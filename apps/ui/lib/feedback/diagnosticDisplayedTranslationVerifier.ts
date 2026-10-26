import type {
  AuthenticatedSupabase,
  ServiceSupabase,
} from "@/lib/platform/serverSupabase";
import { performPlatformV2Lookup } from "@/lib/platform/platformV2LookupService";
import {
  canonicalJson,
  combineDiagnosticCardContentV1,
  type DiagnosticReportV1,
} from "../../../../packages/shared/diagnostic-report/v1";
import { reconstructDisplayedTranslationAtomsV1 } from "../../../../packages/shared/diagnostic-report/displayedTranslationArtifactV1";
import type { PlatformSenseCardEntryV2 } from "../../../../packages/shared/types/platformV2";

export async function verifyCurrentDisplayedTranslations(
  auth: AuthenticatedSupabase,
  service: ServiceSupabase,
  report: DiagnosticReportV1,
): Promise<
  | { ok: true }
  | { ok: false; status: number; error: string }
> {
  const submittedAtoms = report.cardContent?.atoms.filter(
    (atom) => atom.role === "displayed-translation",
  ) ?? [];
  const targetArtifact = report.target.kind === "translation-artifact"
    ? withoutDiagnosticTargetKind(report.target)
    : null;
  if (submittedAtoms.length === 0 && !targetArtifact) return { ok: true };

  const languageCodes = new Set(
    submittedAtoms.map((atom) => atom.artifact.targetLanguageCode),
  );
  if (targetArtifact) languageCodes.add(targetArtifact.targetLanguageCode);
  if (languageCodes.size !== 1) {
    return { ok: false, status: 400, error: "card_content_mismatch" };
  }
  const lookup = await performPlatformV2Lookup(
    { kind: "authenticated", auth, service },
    {
      entryId: report.target.entryId!,
      cardTypeId:
        "cardTypeId" in report.target
          ? report.target.cardTypeId
          : "word-to-definition",
      contentLanguageCode: null,
      translationTargetLanguageCode: [...languageCodes][0]!,
      intent: "training-review",
    },
  );
  if (lookup.status !== 200) {
    return { ok: false, status: 500, error: "translation_verification_failed" };
  }
  const entry = senseCardEntry(lookup.payload, report.target.entryId!);
  if (!entry) return { ok: false, status: 409, error: "stale_target" };
  const reportTranslationTargets = entry.capabilities.flatMap((capability) =>
    capability.actionId === "report-content" &&
    capability.target.kind === "translation"
      ? [capability.target]
      : [],
  );
  const entryTarget = reportTranslationTargets.find(
    (target) => target.targetKind === "entry",
  );
  const displayedTranslations = reconstructDisplayedTranslationAtomsV1({
    entryId: entry.entryId,
    translation: entry.translation,
    currentSourceContentFingerprint:
      entryTarget?.targetKind === "entry"
        ? entryTarget.sourceContentFingerprint
        : "",
    contentNodes: entry.contentNodes,
  });
  const sourceAttestation = await service.supabase.rpc(
    "read_platform_v2_report_atom_attestation",
    { p_user_id: auth.principal.userId, p_entry_id: report.target.entryId! },
  );
  if (sourceAttestation.error) {
    return { ok: false, status: 500, error: "translation_verification_failed" };
  }
  const attestation = Array.isArray(sourceAttestation.data)
    ? sourceAttestation.data[0]
    : sourceAttestation.data;
  if (!isReportAtomAttestation(attestation)) {
    return { ok: false, status: 500, error: "translation_verification_failed" };
  }
  const expectedCardContent = combineDiagnosticCardContentV1(
    attestation.cardContent,
    displayedTranslations,
  );
  if (canonicalJson(report.cardContent) !== canonicalJson(expectedCardContent)) {
    return { ok: false, status: 400, error: "card_content_mismatch" };
  }
  if (
    targetArtifact &&
    !reportTranslationTargets.some(
      (candidate) =>
        canonicalJson(withoutPlatformTargetKind(candidate)) ===
        canonicalJson(targetArtifact),
    )
  ) {
    return { ok: false, status: 409, error: "stale_target" };
  }
  return { ok: true };
}

function isReportAtomAttestation(value: unknown): value is {
  contentRevision: string;
  cardContent: NonNullable<DiagnosticReportV1["cardContent"]>;
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    contentRevision?: unknown;
    cardContent?: { atoms?: unknown; omittedAtomCount?: unknown };
  };
  return (
    typeof candidate.contentRevision === "string" &&
    Boolean(candidate.cardContent) &&
    Array.isArray(candidate.cardContent?.atoms) &&
    Number.isInteger(candidate.cardContent?.omittedAtomCount)
  );
}

function senseCardEntry(
  payload: unknown,
  entryId: string,
): PlatformSenseCardEntryV2 | null {
  if (!payload || typeof payload !== "object") return null;
  const groups = (payload as { groups?: unknown }).groups;
  if (!Array.isArray(groups)) return null;
  for (const group of groups) {
    if (!group || typeof group !== "object") continue;
    const entries = (group as { entries?: unknown }).entries;
    if (!Array.isArray(entries)) continue;
    const entry = entries.find(
      (candidate): candidate is PlatformSenseCardEntryV2 =>
        Boolean(candidate) &&
        typeof candidate === "object" &&
        (candidate as { kind?: unknown }).kind === "sense-card" &&
        (candidate as { entryId?: unknown }).entryId === entryId,
    );
    if (entry) return entry;
  }
  return null;
}

function withoutDiagnosticTargetKind(
  target: Extract<DiagnosticReportV1["target"], { kind: "translation-artifact" }>,
) {
  const { kind: _kind, ...artifact } = target;
  return artifact;
}

function withoutPlatformTargetKind(
  target: Extract<
    PlatformSenseCardEntryV2["capabilities"][number]["target"],
    { kind: "translation" }
  >,
) {
  const { kind: _kind, ...artifact } = target;
  return artifact;
}
