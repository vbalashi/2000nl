/** Closed, transport-independent Diagnostic Report v1 contract. */

export const DIAGNOSTIC_REPORT_SCHEMA_VERSION = "diagnostic-report-v1" as const;
export const DIAGNOSTIC_REPORT_MAX_BYTES = 65_536;
export const DIAGNOSTIC_CARD_CONTENT_MAX_BYTES = 48 * 1024;
export const DIAGNOSTIC_RECENT_EVENTS_MAX_BYTES = 32 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;
const BCP47 = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;
const RFC3339_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const feedbackProblemTypes = {
  "content-quality": ["wrong-sense", "bad-generated-definition", "other-content"],
  "translation-quality": [
    "bad-headword-translation",
    "bad-definition-translation",
    "bad-example-translation",
    "other-translation",
  ],
  rendering: ["rendering-layout-issue"],
  loading: ["loading-failure"],
  "training-action": ["training-action-failure"],
  other: ["other"],
} as const;

export type FeedbackKind = keyof typeof feedbackProblemTypes;
export type FeedbackProblemType = (typeof feedbackProblemTypes)[FeedbackKind][number];
export type ContentNodeKind =
  | "definition" | "usage-pattern" | "example" | "idiom"
  | "idiom-explanation" | "usage-note";
export type CardAtomRole = "headword" | ContentNodeKind | "displayed-translation";
export type ObservationStage =
  | "lookup-selection" | "lookup-fetch" | "translation-cache"
  | "translation-provider" | "audio-cache" | "audio-provider"
  | "review-mutation" | "transition-render" | "report-capture"
  | "report-persist" | "report-send";
export type SafeErrorCode =
  | "network-interrupted" | "timeout" | "unauthorized" | "forbidden"
  | "validation-rejected" | "provider-unavailable" | "render-failed"
  | "storage-failed" | "unknown";

export type DiagnosticTarget =
  | { kind: "entry"; entryId: string; contentRevision: string }
  | { kind: "sense-card"; entryId: string; cardTypeId: string; contentRevision: string; stateRevision: string }
  | { kind: "content-node"; entryId: string; contentNodeId: string; nodeKind: ContentNodeKind; sourceTextFingerprint: string }
  | {
      kind: "translation-artifact";
      targetKind: "entry" | "content-node";
      entryId: string;
      contentNodeId: string | null;
      translationId: string;
      sourceContentFingerprint: string | null;
      sourceTextFingerprint: string | null;
      targetLanguageCode: string;
      translationPolicyVersion: string;
      providerRevision: string | null;
    }
  | {
      kind: "training-action";
      entryId: string;
      cardTypeId: string;
      stateRevision: string;
      contentRevision: string;
      actionId: "start-learning" | "mark-known" | "undo-known" | "review-card";
      clientEventId: string;
      reviewResult: "fail" | "hard" | "success" | "easy" | null;
      activeKnownMarkId: string | null;
      knownMarkRevision: string | null;
    }
  | {
      kind: "app-operation";
      route: "training" | "library" | "statistics" | "settings" | "unknown";
      stage: ObservationStage;
      operationCorrelationId: string;
      entryId: string | null;
    };

export type DiagnosticSourceContext = null | {
  contractVersion: "diagnostic-source-context-v1";
  source: {
    kind: "youtube_video";
    provider: "youtube";
    externalId: string;
    languageCode: string | null;
  };
  location: null | {
    kind: "caption_phrase";
    startMs: number | null;
    endMs: number | null;
    phraseIndex: number | null;
    locatorConfidence: "canonical" | "derived" | "approximate" | null;
  };
};

export type DiagnosticCardAtom = {
  role: CardAtomRole;
  contentNodeId: string | null;
  text: string;
  truncated: boolean;
};

export type DiagnosticObservations = {
  capturedAt: string;
  timezoneOffsetMinutes: number;
  timezoneName: string;
  route: "training" | "library" | "statistics" | "settings" | "unknown";
  browserFamily: "chromium" | "safari" | "firefox" | "unknown";
  browserMajorVersion: number | null;
  osFamily: "android" | "ios" | "macos" | "windows" | "linux" | "unknown";
  osMajorVersion: number | null;
  isPwa: boolean;
  isOnline: boolean;
  correlationIds: string[];
  errorChain: Array<{
    category: "network" | "timeout" | "auth" | "validation" | "provider" | "render" | "storage" | "unknown";
    stage: ObservationStage;
    safeCode: SafeErrorCode;
    httpStatus: number | null;
    correlationId: string | null;
    appFrameFingerprints: string[];
  }>;
  recentEvents: Array<{
    stage: ObservationStage;
    relativeMs: number;
    durationMs: number;
    outcome: "started" | "succeeded" | "failed" | "cancelled" | "unknown";
    safeCode: SafeErrorCode | null;
    correlationId: string | null;
  }>;
  omittedEventCount: number;
  actionObservation: null | {
    clientObservedOutcome: "accepted" | "duplicate" | "state-conflict" | "network" | "timeout" | "server-error" | "unknown";
  };
};

export type DiagnosticReportV1 = {
  schemaVersion: typeof DIAGNOSTIC_REPORT_SCHEMA_VERSION;
  reportId: string;
  feedback: { kind: FeedbackKind; problemType: FeedbackProblemType; comment: string | null };
  target: DiagnosticTarget;
  sourceContext: DiagnosticSourceContext;
  cardContent: null | { atoms: DiagnosticCardAtom[]; omittedAtomCount: number };
  observations: DiagnosticObservations;
};

export type DiagnosticReportTransportV1 = DiagnosticReportV1 & { payloadHash: string };
export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function oneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === "string" && choices.includes(value as T);
}
function integer(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}
function boundedAscii(value: unknown, max: number) {
  return typeof value === "string" && value.length >= 1 && value.length <= max && /^[\x20-\x7e]+$/.test(value);
}
function utf8Bytes(value: string) { return new TextEncoder().encode(value).byteLength; }
function scalarLength(value: string) { return [...value].length; }
function validUuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
function validSha(value: unknown): value is string { return typeof value === "string" && SHA256.test(value); }
function validRevision(value: unknown) { return boundedAscii(value, 128); }
function validIdentifier(value: unknown): value is string { return typeof value === "string" && IDENTIFIER.test(value); }
function validCardType(value: unknown) { return typeof value === "string" && value.length <= 64 && /^[A-Za-z0-9._:-]+$/.test(value); }

function validateTarget(value: unknown): value is DiagnosticTarget {
  if (!record(value) || typeof value.kind !== "string") return false;
  const entryId = value.entryId;
  if (value.kind === "entry") return exact(value, ["kind", "entryId", "contentRevision"]) && validUuid(entryId) && validRevision(value.contentRevision);
  if (value.kind === "sense-card") return exact(value, ["kind", "entryId", "cardTypeId", "contentRevision", "stateRevision"]) && validUuid(entryId) && validCardType(value.cardTypeId) && validRevision(value.contentRevision) && (value.stateRevision === "untracked" || validUuid(value.stateRevision));
  if (value.kind === "content-node") return exact(value, ["kind", "entryId", "contentNodeId", "nodeKind", "sourceTextFingerprint"]) && validUuid(entryId) && validIdentifier(value.contentNodeId) && oneOf(value.nodeKind, ["definition", "usage-pattern", "example", "idiom", "idiom-explanation", "usage-note"] as const) && validSha(value.sourceTextFingerprint);
  if (value.kind === "translation-artifact") {
    if (!exact(value, ["kind", "targetKind", "entryId", "contentNodeId", "translationId", "sourceContentFingerprint", "sourceTextFingerprint", "targetLanguageCode", "translationPolicyVersion", "providerRevision"])) return false;
    if (!validUuid(entryId) || !validUuid(value.translationId) || !oneOf(value.targetKind, ["entry", "content-node"] as const) || typeof value.targetLanguageCode !== "string" || value.targetLanguageCode.length > 35 || !BCP47.test(value.targetLanguageCode) || !validRevision(value.translationPolicyVersion) || !(value.providerRevision === null || validRevision(value.providerRevision))) return false;
    return value.targetKind === "entry"
      ? value.contentNodeId === null && validSha(value.sourceContentFingerprint) && value.sourceTextFingerprint === null
      : validIdentifier(value.contentNodeId) && value.sourceContentFingerprint === null && validSha(value.sourceTextFingerprint);
  }
  if (value.kind === "training-action") {
    if (!exact(value, ["kind", "entryId", "cardTypeId", "stateRevision", "contentRevision", "actionId", "clientEventId", "reviewResult", "activeKnownMarkId", "knownMarkRevision"])) return false;
    if (!validUuid(entryId) || !validCardType(value.cardTypeId) || !(value.stateRevision === "untracked" || validUuid(value.stateRevision)) || !validRevision(value.contentRevision) || !oneOf(value.actionId, ["start-learning", "mark-known", "undo-known", "review-card"] as const) || !validUuid(value.clientEventId)) return false;
    if (value.actionId === "review-card") return oneOf(value.reviewResult, ["fail", "hard", "success", "easy"] as const) && value.activeKnownMarkId === null && value.knownMarkRevision === null;
    if (value.actionId === "undo-known") return value.reviewResult === null && validUuid(value.activeKnownMarkId) && validUuid(value.knownMarkRevision);
    return value.reviewResult === null && value.activeKnownMarkId === null && value.knownMarkRevision === null;
  }
  return value.kind === "app-operation" && exact(value, ["kind", "route", "stage", "operationCorrelationId", "entryId"]) && oneOf(value.route, ["training", "library", "statistics", "settings", "unknown"] as const) && oneOf(value.stage, observationStages) && validUuid(value.operationCorrelationId) && (value.entryId === null || validUuid(value.entryId));
}

const observationStages: readonly ObservationStage[] = ["lookup-selection", "lookup-fetch", "translation-cache", "translation-provider", "audio-cache", "audio-provider", "review-mutation", "transition-render", "report-capture", "report-persist", "report-send"];
const safeCodes: readonly SafeErrorCode[] = ["network-interrupted", "timeout", "unauthorized", "forbidden", "validation-rejected", "provider-unavailable", "render-failed", "storage-failed", "unknown"];

function validateSourceContext(value: unknown): value is DiagnosticSourceContext {
  if (value === null) return true;
  if (!record(value) || !exact(value, ["contractVersion", "source", "location"]) || value.contractVersion !== "diagnostic-source-context-v1" || !record(value.source) || !exact(value.source, ["kind", "provider", "externalId", "languageCode"]) || value.source.kind !== "youtube_video" || value.source.provider !== "youtube" || typeof value.source.externalId !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(value.source.externalId) || !(value.source.languageCode === null || (typeof value.source.languageCode === "string" && value.source.languageCode.length <= 35 && BCP47.test(value.source.languageCode)))) return false;
  if (value.location === null) return true;
  if (!record(value.location) || !exact(value.location, ["kind", "startMs", "endMs", "phraseIndex", "locatorConfidence"]) || value.location.kind !== "caption_phrase") return false;
  const nullableInt = (item: unknown, max: number) => item === null || integer(item, 0, max);
  if (!nullableInt(value.location.startMs, 86_400_000) || !nullableInt(value.location.endMs, 86_400_000) || !nullableInt(value.location.phraseIndex, 2_147_483_647) || !(value.location.locatorConfidence === null || oneOf(value.location.locatorConfidence, ["canonical", "derived", "approximate"] as const))) return false;
  return value.location.startMs === null || value.location.endMs === null || value.location.endMs >= value.location.startMs;
}

function validateCardContent(value: unknown, target: DiagnosticTarget): value is DiagnosticReportV1["cardContent"] {
  if (value === null) return target.kind === "app-operation";
  if (target.kind === "app-operation" || !record(value) || !exact(value, ["atoms", "omittedAtomCount"]) || !Array.isArray(value.atoms) || value.atoms.length < 1 || value.atoms.length > 32 || !integer(value.omittedAtomCount, 0, 2_147_483_647)) return false;
  const seen = new Set<string>();
  for (const atom of value.atoms) {
    if (!record(atom) || !exact(atom, ["role", "contentNodeId", "text", "truncated"]) || !oneOf(atom.role, ["headword", "definition", "usage-pattern", "example", "idiom", "idiom-explanation", "usage-note", "displayed-translation"] as const) || !(atom.contentNodeId === null || validIdentifier(atom.contentNodeId)) || typeof atom.text !== "string" || atom.text !== atom.text.normalize("NFC") || scalarLength(atom.text) > 1_500 || utf8Bytes(atom.text) > 6_000 || typeof atom.truncated !== "boolean") return false;
    const identity = `${atom.role}:${atom.contentNodeId ?? ""}:${atom.text}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
  }
  return utf8Bytes(canonicalJson(value)) <= DIAGNOSTIC_CARD_CONTENT_MAX_BYTES;
}

function validateObservations(value: unknown, target: DiagnosticTarget): value is DiagnosticObservations {
  if (!record(value) || !exact(value, ["capturedAt", "timezoneOffsetMinutes", "timezoneName", "route", "browserFamily", "browserMajorVersion", "osFamily", "osMajorVersion", "isPwa", "isOnline", "correlationIds", "errorChain", "recentEvents", "omittedEventCount", "actionObservation"])) return false;
  if (typeof value.capturedAt !== "string" || !RFC3339_MS.test(value.capturedAt) || Number.isNaN(Date.parse(value.capturedAt)) || !integer(value.timezoneOffsetMinutes, -840, 840) || typeof value.timezoneName !== "string" || value.timezoneName.length > 64 || !/^[A-Za-z0-9_+\/-]+$/.test(value.timezoneName)) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value.timezoneName }); } catch { return false; }
  if (!oneOf(value.route, ["training", "library", "statistics", "settings", "unknown"] as const) || !oneOf(value.browserFamily, ["chromium", "safari", "firefox", "unknown"] as const) || !(value.browserMajorVersion === null || integer(value.browserMajorVersion, 0, 2_147_483_647)) || !oneOf(value.osFamily, ["android", "ios", "macos", "windows", "linux", "unknown"] as const) || !(value.osMajorVersion === null || integer(value.osMajorVersion, 0, 2_147_483_647)) || typeof value.isPwa !== "boolean" || typeof value.isOnline !== "boolean") return false;
  if (!Array.isArray(value.correlationIds) || value.correlationIds.length > 8 || !value.correlationIds.every(validUuid) || new Set(value.correlationIds).size !== value.correlationIds.length || !Array.isArray(value.errorChain) || value.errorChain.length > 4 || !Array.isArray(value.recentEvents) || value.recentEvents.length > 30 || !integer(value.omittedEventCount, 0, 2_147_483_647)) return false;
  for (const cause of value.errorChain) {
    if (!record(cause) || !exact(cause, ["category", "stage", "safeCode", "httpStatus", "correlationId", "appFrameFingerprints"]) || !oneOf(cause.category, ["network", "timeout", "auth", "validation", "provider", "render", "storage", "unknown"] as const) || !oneOf(cause.stage, observationStages) || !oneOf(cause.safeCode, safeCodes) || !(cause.httpStatus === null || integer(cause.httpStatus, 100, 599)) || !(cause.correlationId === null || validUuid(cause.correlationId)) || !Array.isArray(cause.appFrameFingerprints) || cause.appFrameFingerprints.length > 8 || !cause.appFrameFingerprints.every(validSha)) return false;
  }
  for (const event of value.recentEvents) {
    if (!record(event) || !exact(event, ["stage", "relativeMs", "durationMs", "outcome", "safeCode", "correlationId"]) || !oneOf(event.stage, observationStages) || !integer(event.relativeMs, 0, 120_000) || !integer(event.durationMs, 0, 120_000) || !oneOf(event.outcome, ["started", "succeeded", "failed", "cancelled", "unknown"] as const) || !(event.safeCode === null || oneOf(event.safeCode, safeCodes)) || !(event.correlationId === null || validUuid(event.correlationId))) return false;
  }
  if (utf8Bytes(canonicalJson(value.recentEvents)) > DIAGNOSTIC_RECENT_EVENTS_MAX_BYTES) return false;
  if (target.kind === "training-action") return record(value.actionObservation) && exact(value.actionObservation, ["clientObservedOutcome"]) && oneOf(value.actionObservation.clientObservedOutcome, ["accepted", "duplicate", "state-conflict", "network", "timeout", "server-error", "unknown"] as const);
  return value.actionObservation === null;
}

export function parseDiagnosticReport(value: unknown): ParseResult<DiagnosticReportV1> {
  if (!record(value) || !exact(value, ["schemaVersion", "reportId", "feedback", "target", "sourceContext", "cardContent", "observations"])) return { ok: false, error: "invalid_report_shape" };
  if (value.schemaVersion !== DIAGNOSTIC_REPORT_SCHEMA_VERSION || !validUuid(value.reportId)) return { ok: false, error: "invalid_report_identity" };
  if (!record(value.feedback) || !exact(value.feedback, ["kind", "problemType", "comment"]) || !oneOf(value.feedback.kind, Object.keys(feedbackProblemTypes) as FeedbackKind[]) || !oneOf(value.feedback.problemType, feedbackProblemTypes[value.feedback.kind]) || !(value.feedback.comment === null || (typeof value.feedback.comment === "string" && value.feedback.comment === value.feedback.comment.normalize("NFC") && scalarLength(value.feedback.comment) <= 1_000 && utf8Bytes(value.feedback.comment) <= 4_096))) return { ok: false, error: "invalid_feedback" };
  if (!validateTarget(value.target)) return { ok: false, error: "invalid_target" };
  if (!validateSourceContext(value.sourceContext)) return { ok: false, error: "invalid_source_context" };
  if (!validateCardContent(value.cardContent, value.target)) return { ok: false, error: "invalid_card_content" };
  if (!validateObservations(value.observations, value.target)) return { ok: false, error: "invalid_observations" };
  if (utf8Bytes(canonicalJson(value)) > DIAGNOSTIC_REPORT_MAX_BYTES) return { ok: false, error: "payload_too_large" };
  return { ok: true, value: value as DiagnosticReportV1 };
}

export function parseDiagnosticReportTransport(value: unknown): ParseResult<DiagnosticReportTransportV1> {
  if (!record(value) || !exact(value, ["schemaVersion", "reportId", "feedback", "target", "sourceContext", "cardContent", "observations", "payloadHash"]) || !validSha(value.payloadHash)) return { ok: false, error: "invalid_transport_shape" };
  const { payloadHash, ...payload } = value;
  const parsed = parseDiagnosticReport(payload);
  return parsed.ok ? { ok: true, value: { ...parsed.value, payloadHash } } : parsed;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

export async function diagnosticPayloadHash(payload: DiagnosticReportV1): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyDiagnosticTransport(transport: DiagnosticReportTransportV1) {
  const { payloadHash, ...payload } = transport;
  return payloadHash === await diagnosticPayloadHash(payload);
}

function truncateText(input: string) {
  const normalized = input.normalize("NFC");
  let text = "";
  for (const scalar of normalized) {
    if (scalarLength(text) >= 1_500 || utf8Bytes(text + scalar) > 6_000) break;
    text += scalar;
  }
  return { text, truncated: text !== normalized };
}

export async function buildDiagnosticReport(input: Omit<DiagnosticReportV1, "schemaVersion" | "cardContent"> & { cardContent: null | { atoms: Array<Omit<DiagnosticCardAtom, "text" | "truncated"> & { text: string }>; omittedAtomCount?: number } }): Promise<DiagnosticReportTransportV1> {
  const comment = input.feedback.comment?.normalize("NFC") ?? null;
  if (comment !== null && (scalarLength(comment) > 1_000 || utf8Bytes(comment) > 4_096)) throw new Error("invalid_feedback");
  const sourceAtoms = input.cardContent?.atoms ?? [];
  const boundedAtoms = sourceAtoms.slice(0, 32).map((atom) => ({ ...atom, ...truncateText(atom.text) }));
  const make = (atoms: DiagnosticCardAtom[], events: DiagnosticObservations["recentEvents"]): DiagnosticReportV1 => ({
    schemaVersion: DIAGNOSTIC_REPORT_SCHEMA_VERSION,
    reportId: input.reportId,
    feedback: { ...input.feedback, comment },
    target: input.target,
    sourceContext: input.sourceContext,
    cardContent: input.cardContent === null ? null : { atoms, omittedAtomCount: sourceAtoms.length - atoms.length + (input.cardContent.omittedAtomCount ?? 0) },
    observations: { ...input.observations, recentEvents: events, omittedEventCount: input.observations.recentEvents.length - events.length + input.observations.omittedEventCount },
  });
  let atoms = boundedAtoms;
  let events = input.observations.recentEvents.slice(-30).reverse();
  while (atoms.length && (utf8Bytes(canonicalJson(make(atoms, []))) > DIAGNOSTIC_REPORT_MAX_BYTES || utf8Bytes(canonicalJson(make(atoms, []).cardContent)) > DIAGNOSTIC_CARD_CONTENT_MAX_BYTES)) atoms = atoms.slice(0, -1);
  while (events.length && (
    utf8Bytes(canonicalJson(events)) > DIAGNOSTIC_RECENT_EVENTS_MAX_BYTES ||
    utf8Bytes(canonicalJson(make(atoms, events))) > DIAGNOSTIC_REPORT_MAX_BYTES
  )) events = events.slice(0, -1);
  const payload = make(atoms, events);
  const parsed = parseDiagnosticReport(payload);
  if (!parsed.ok) throw new Error(parsed.error);
  return { ...parsed.value, payloadHash: await diagnosticPayloadHash(parsed.value) };
}
