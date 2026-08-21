import { platformV2AuthenticatedJsonHeaders } from "@/lib/platform/platformV2Http";
import { supabase } from "@/lib/supabaseClient";
import {
  buildDiagnosticReport,
  type DiagnosticCardAtom,
  type DiagnosticReportTransportV1,
  type FeedbackKind,
  type FeedbackProblemType,
} from "../../../../packages/shared/diagnostic-report/v1";
import type {
  PlatformActionV2Request,
  PlatformContentNodeV2,
  PlatformHeadwordGroupV2,
  PlatformSenseCardEntryV2,
} from "../../../../packages/shared/types/platformV2";
import { reconstructDisplayedTranslationAtomsV1 } from "../../../../packages/shared/diagnostic-report/displayedTranslationArtifactV1";

const RECORD_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SEND_LEASE_MS = 30_000;
const RETRY_FLOOR_MS = 60_000;
const RETRY_CAP_MS = 60 * 60 * 1000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

export type SenseCardTrainingOperation = Readonly<{
  request: PlatformActionV2Request;
  observedOutcome:
    | "accepted"
    | "duplicate"
    | "state-conflict"
    | "network"
    | "timeout"
    | "server-error"
    | "unknown";
}>;
export type SenseCardDiagnosticSnapshot = Readonly<{
  route: "training" | "library";
  headword: string;
  entry: PlatformSenseCardEntryV2;
  operation: SenseCardTrainingOperation | null;
}>;
export type SenseCardReportDeliveryState = "editing" | "sending" | "sent" | "queued" | "scheduled" | "retry" | "rejected";
export type DiagnosticReportOutboxRecord = {
  reportId: string;
  principalId: string;
  report: DiagnosticReportTransportV1;
  status: "queued" | "sending" | "retry_wait" | "rejected";
  createdAt: number;
  expiresAt: number;
  attemptCount: number;
  retryAt: number;
  leaseToken: string | null;
  leaseUntil: number | null;
};
export type DiagnosticReportFinish =
  | { kind: "accepted" }
  | { kind: "permanent" }
  | { kind: "temporary"; retryAt: number };
export type DiagnosticReportOutboxStore = {
  get(reportId: string): Promise<DiagnosticReportOutboxRecord | null>;
  insertOrLoadExact(record: DiagnosticReportOutboxRecord): Promise<DiagnosticReportOutboxRecord | null>;
  list(): Promise<DiagnosticReportOutboxRecord[]>;
  claim(reportId: string, principalId: string, now: number, leaseToken: string, leaseUntil: number): Promise<DiagnosticReportOutboxRecord | null>;
  finish(reportId: string, principalId: string, leaseToken: string, result: DiagnosticReportFinish): Promise<boolean>;
  purgeExpired(reportId: string, now: number): Promise<boolean>;
};
type ReportEnvironment = {
  timezoneOffsetMinutes: number;
  timezoneName: string;
  browserFamily: "chromium" | "safari" | "firefox" | "unknown";
  browserMajorVersion: number | null;
  osFamily: "android" | "ios" | "macos" | "windows" | "linux" | "unknown";
  osMajorVersion: number | null;
  isPwa: boolean;
  isOnline: boolean;
};

export function freezeSenseCardDiagnosticSnapshot(input: {
  route: "training" | "library";
  group: PlatformHeadwordGroupV2;
  entry: PlatformSenseCardEntryV2;
  operation?: SenseCardTrainingOperation | null;
}): SenseCardDiagnosticSnapshot {
  return Object.freeze({
    route: input.route,
    headword: input.group.header.text.normalize("NFC"),
    entry: structuredClone(input.entry),
    operation: input.operation ? structuredClone(input.operation) : null,
  });
}

export async function buildSenseCardDiagnosticReport(input: {
  snapshot: SenseCardDiagnosticSnapshot;
  kind: FeedbackKind;
  comment: string | null;
  now?: Date;
  reportId?: string;
  environment?: ReportEnvironment;
}): Promise<DiagnosticReportTransportV1> {
  const { snapshot } = input;
  if (!snapshot.entry.reportContentRevision) throw new Error("unverifiable_report_content");
  const environment = input.environment ?? readReportEnvironment();
  const operation = input.kind === "training-action" ? snapshot.operation : null;
  const reportId = input.reportId ?? crypto.randomUUID();
  const target = operation
    ? trainingActionTarget(
        operation.request,
        snapshot.entry.reportContentRevision,
      )
    : {
        kind: "entry" as const,
        entryId: snapshot.entry.entryId,
        contentRevision: snapshot.entry.reportContentRevision,
      };
  return buildDiagnosticReport({
    reportId,
    feedback: {
      kind: input.kind,
      problemType: problemTypeFor(input.kind),
      comment: input.comment?.trim() || null,
    },
    target,
    sourceContext: null,
    cardContent: { atoms: projectReportAtoms(snapshot), omittedAtomCount: 0 },
    observations: {
      capturedAt: (input.now ?? new Date()).toISOString(),
      timezoneOffsetMinutes: environment.timezoneOffsetMinutes,
      timezoneName: environment.timezoneName,
      route: snapshot.route,
      browserFamily: environment.browserFamily,
      browserMajorVersion: environment.browserMajorVersion,
      osFamily: environment.osFamily,
      osMajorVersion: environment.osMajorVersion,
      isPwa: environment.isPwa,
      isOnline: environment.isOnline,
      correlationIds: [], errorChain: [], recentEvents: [], omittedEventCount: 0,
      actionObservation: operation
        ? { clientObservedOutcome: operation.observedOutcome }
        : null,
    },
  });
}

function trainingActionTarget(
  request: PlatformActionV2Request,
  contentRevision: string,
) {
  return {
    kind: "training-action" as const,
    entryId: request.target.entryId,
    cardTypeId: request.target.cardTypeId,
    stateRevision: request.target.stateRevision,
    contentRevision,
    actionId: request.actionId,
    clientEventId: request.clientEventId,
    reviewResult: request.actionId === "review-card" ? request.reviewResult : null,
    activeKnownMarkId:
      request.actionId === "undo-known" ? request.target.activeKnownMarkId : null,
    knownMarkRevision:
      request.actionId === "undo-known" ? request.target.knownMarkRevision : null,
  };
}

export async function queueSenseCardDiagnosticReport(input: {
  snapshot: SenseCardDiagnosticSnapshot;
  kind: FeedbackKind;
  comment: string | null;
}): Promise<{ state: Extract<SenseCardReportDeliveryState, "sent" | "queued" | "scheduled" | "rejected"> }> {
  const report = await buildSenseCardDiagnosticReport(input);
  return queuePreparedSenseCardDiagnosticReport(report);
}

export async function queuePreparedSenseCardDiagnosticReport(
  report: DiagnosticReportTransportV1,
): Promise<{ state: Extract<SenseCardReportDeliveryState, "sent" | "queued" | "scheduled" | "rejected"> }> {
  const principalId = await readCurrentPrincipalId();
  if (!principalId) return { state: "rejected" };
  const now = Date.now();
  const store = indexedDbDiagnosticReportStore();
  const record: DiagnosticReportOutboxRecord = {
    reportId: report.reportId, principalId, report, status: "queued", createdAt: now,
    expiresAt: now + RECORD_TTL_MS, attemptCount: 0, retryAt: now,
    leaseToken: null, leaseUntil: null,
  };
  const stored = await store.insertOrLoadExact(record);
  if (!stored) return { state: "rejected" };
  installOutboxResumeTriggers(store);
  if (typeof navigator !== "undefined" && !navigator.onLine) return { state: "queued" };
  if (stored.status === "retry_wait" && stored.retryAt > now) return { state: "scheduled" };
  const state = await deliverStoredDiagnosticReport({ store, record: stored, principalId, now, send: sendDiagnosticReport });
  await rescheduleDiagnosticReportRetry(store);
  return { state };
}

export async function deliverStoredDiagnosticReport(input: {
  store: DiagnosticReportOutboxStore;
  record: DiagnosticReportOutboxRecord;
  principalId: string;
  now: number;
  send: (report: DiagnosticReportTransportV1, principalId: string) => Promise<{ kind: "accepted" | "temporary" | "permanent" }>;
  completedAt?: () => number;
  random?: () => number;
}): Promise<"sent" | "queued" | "scheduled" | "rejected"> {
  const { store, now, principalId } = input;
  if (input.record.principalId !== principalId) return "queued";
  if (input.record.expiresAt <= now) {
    await store.purgeExpired(input.record.reportId, now);
    return "rejected";
  }
  const leaseToken = crypto.randomUUID();
  const sending = await store.claim(
    input.record.reportId,
    principalId,
    now,
    leaseToken,
    now + SEND_LEASE_MS,
  );
  if (!sending) {
    const current = await store.get(input.record.reportId);
    return current?.status === "rejected" ? "rejected" : "queued";
  }
  let result: { kind: "accepted" | "temporary" | "permanent" };
  try { result = await input.send(sending.report, principalId); }
  catch { result = { kind: "temporary" }; }
  const completedAt = Math.max(now, input.completedAt?.() ?? Date.now());
  const baseDelay = Math.min(RETRY_CAP_MS, RETRY_FLOOR_MS * 2 ** Math.min(6, Math.max(0, sending.attemptCount - 1)));
  const delay = Math.min(
    RETRY_CAP_MS,
    Math.max(
      RETRY_FLOOR_MS,
      Math.round(baseDelay * (0.9 + (input.random?.() ?? Math.random()) * 0.2)),
    ),
  );
  const finish: DiagnosticReportFinish = result.kind === "temporary"
    ? { kind: "temporary", retryAt: completedAt + delay }
    : result.kind === "accepted"
      ? { kind: "accepted" }
      : { kind: "permanent" };
  const finalized = await store.finish(sending.reportId, principalId, leaseToken, finish);
  if (!finalized) return "queued";
  return result.kind === "accepted" ? "sent" : result.kind === "permanent" ? "rejected" : "scheduled";
}

export async function drainDiagnosticReportOutbox(store: DiagnosticReportOutboxStore, now = Date.now()) {
  const principalId = await readCurrentPrincipalId();
  if (!principalId) return;
  for (const record of await store.list()) {
    if (record.expiresAt <= now) { await store.purgeExpired(record.reportId, now); continue; }
    if (record.principalId !== principalId) continue;
    if (record.status === "rejected" || record.retryAt > now) continue;
    await deliverStoredDiagnosticReport({ store, record, principalId, now, send: sendDiagnosticReport });
  }
  await rescheduleDiagnosticReportRetry(store);
}

export function scheduleNearestDiagnosticReportRetry(input: {
  records: readonly DiagnosticReportOutboxRecord[];
  principalId: string;
  now: number;
  onDue: () => void;
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  const next = input.records
    .filter((record) =>
      record.principalId === input.principalId &&
      record.status === "retry_wait" &&
      record.expiresAt > input.now,
    )
    .sort((left, right) => left.retryAt - right.retryAt)[0];
  if (!next) return () => undefined;
  const setTimer = input.setTimer ?? setTimeout;
  const clearTimer = input.clearTimer ?? clearTimeout;
  const timer = setTimer(
    input.onDue,
    Math.min(MAX_TIMER_DELAY_MS, Math.max(0, next.retryAt - input.now)),
  );
  return () => clearTimer(timer);
}

let cancelScheduledRetry: (() => void) | null = null;
async function rescheduleDiagnosticReportRetry(store: DiagnosticReportOutboxStore) {
  cancelScheduledRetry?.();
  cancelScheduledRetry = null;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const principalId = await readCurrentPrincipalId();
  if (!principalId) return;
  cancelScheduledRetry = scheduleNearestDiagnosticReportRetry({
    records: await store.list(),
    principalId,
    now: Date.now(),
    onDue: () => {
      cancelScheduledRetry = null;
      void drainDiagnosticReportOutbox(store).catch(() => undefined);
    },
  });
}

export function startDiagnosticReportOutboxDelivery() {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return;
  try {
    const store = indexedDbDiagnosticReportStore();
    installOutboxResumeTriggers(store);
    void drainDiagnosticReportOutbox(store).catch(() => undefined);
  } catch {
    // Reporting must never block the learner when durable browser storage is unavailable.
  }
}

function problemTypeFor(kind: FeedbackKind): FeedbackProblemType {
  return ({
    "translation-quality": "other-translation", "content-quality": "other-content",
    rendering: "rendering-layout-issue", loading: "loading-failure",
    "training-action": "training-action-failure", other: "other",
  } as const)[kind];
}

function projectReportAtoms(snapshot: SenseCardDiagnosticSnapshot): DiagnosticCardAtom[] {
  const entry = snapshot.entry;
  const ordered = [...entry.contentNodes].sort((a, b) => a.order - b.order);
  const children = new Map<string, PlatformContentNodeV2[]>();
  for (const node of ordered) if (node.parentContentNodeId) children.set(node.parentContentNodeId, [...(children.get(node.parentContentNodeId) ?? []), node]);
  const roots = ordered.filter((node) => !node.parentContentNodeId);
  const atoms: DiagnosticCardAtom[] = [sourceAtom("headword", null, snapshot.headword)];
  for (const kind of ["definition", "usage-pattern"] as const) for (const node of roots.filter((item) => item.kind === kind)) atoms.push(sourceNodeAtom(node));
  for (const idiom of roots.filter((node) => node.kind === "idiom")) {
    atoms.push(sourceNodeAtom(idiom));
    for (const child of children.get(idiom.contentNodeId) ?? []) if (child.kind === "idiom-explanation" || child.kind === "example") atoms.push(sourceNodeAtom(child));
  }
  for (const node of roots.filter((item) => item.kind === "example")) atoms.push(sourceNodeAtom(node));
  for (const node of roots.filter((item) => item.kind === "usage-note")) atoms.push(sourceNodeAtom(node));
  atoms.push(...displayedTranslationAtoms(entry));
  return atoms;
}
function sourceNodeAtom(node: PlatformContentNodeV2): DiagnosticCardAtom { return sourceAtom(node.kind, node.contentNodeId, node.text); }
function sourceAtom(role: Exclude<DiagnosticCardAtom["role"], "displayed-translation">, contentNodeId: string | null, text: string): DiagnosticCardAtom {
  return { role, contentNodeId, text: text.normalize("NFC"), truncated: false };
}
function displayedTranslationAtoms(entry: PlatformSenseCardEntryV2): DiagnosticCardAtom[] {
  const entryTarget = entry.capabilities.find(
    (capability) => capability.actionId === "report-content" &&
      capability.target.kind === "translation" &&
      capability.target.targetKind === "entry",
  );
  return reconstructDisplayedTranslationAtomsV1({
    entryId: entry.entryId,
    translation: entry.translation,
    currentSourceContentFingerprint:
      entryTarget?.actionId === "report-content" &&
      entryTarget.target.kind === "translation" &&
      entryTarget.target.targetKind === "entry"
        ? entryTarget.target.sourceContentFingerprint
        : "",
    contentNodes: entry.contentNodes,
  });
}

async function sendDiagnosticReport(
  report: DiagnosticReportTransportV1,
  principalId: string,
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<{ kind: "temporary" }>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: "temporary" });
    }, 10_000);
  });
  const attempt = (async () => {
    try {
      if (await readCurrentPrincipalId() !== principalId) return { kind: "temporary" as const };
      const headers = await platformV2AuthenticatedJsonHeaders();
      if (await readCurrentPrincipalId() !== principalId) return { kind: "temporary" as const };
      const response = await fetch("/api/feedback/reports", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers, body: JSON.stringify(report), signal: controller.signal,
      });
      return classifyDiagnosticReportResponse(response, report.reportId);
    } catch {
      return { kind: "temporary" as const };
    }
  })();
  try {
    return await Promise.race([attempt, timedOut]);
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}

async function readCurrentPrincipalId() {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

export async function classifyDiagnosticReportResponse(
  response: Response,
  expectedReportId: string,
): Promise<{ kind: "accepted" | "temporary" | "permanent" }> {
  if (response.ok) {
    try {
      const receipt = await response.json() as {
        status?: unknown;
        reportId?: unknown;
      };
      return (receipt.status === "accepted" || receipt.status === "duplicate") &&
        receipt.reportId === expectedReportId
        ? { kind: "accepted" }
        : { kind: "temporary" };
    } catch {
      return { kind: "temporary" };
    }
  }
  if (response.status === 401 || response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500) {
    return { kind: "temporary" };
  }
  return { kind: "permanent" };
}

function readReportEnvironment(): ReportEnvironment {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const browser = /Firefox\/(\d+)/.exec(ua) ?? /(?:Chrome|CriOS)\/(\d+)/.exec(ua) ?? /Version\/(\d+).+Safari/.exec(ua);
  const os = /Android (\d+)/.exec(ua) ?? /OS (\d+)_/.exec(ua) ?? /Mac OS X (\d+)[_.]/.exec(ua) ?? /Windows NT (\d+)/.exec(ua);
  return {
    timezoneOffsetMinutes: new Date().getTimezoneOffset(), timezoneName: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    browserFamily: /Firefox\//.test(ua) ? "firefox" : /(?:Chrome|CriOS)\//.test(ua) ? "chromium" : /Safari\//.test(ua) ? "safari" : "unknown",
    browserMajorVersion: browser ? Number(browser[1]) : null,
    osFamily: /Android/.test(ua) ? "android" : /iPhone|iPad/.test(ua) ? "ios" : /Mac OS X/.test(ua) ? "macos" : /Windows/.test(ua) ? "windows" : /Linux/.test(ua) ? "linux" : "unknown",
    osMajorVersion: os ? Number(os[1]) : null,
    isPwa: typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches,
    isOnline: typeof navigator === "undefined" || navigator.onLine,
  };
}

let sharedStore: DiagnosticReportOutboxStore | null = null;
function indexedDbDiagnosticReportStore(): DiagnosticReportOutboxStore {
  if (sharedStore) return sharedStore;
  if (typeof indexedDB === "undefined") throw new Error("diagnostic_outbox_unavailable");
  const db = openOutboxDb();
  const request = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) => {
    const database = await db;
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction("reports", mode);
      const operation = run(transaction.objectStore("reports"));
      let result: T;
      operation.onsuccess = () => { result = operation.result; };
      operation.onerror = () => reject(operation.error ?? new Error("diagnostic_outbox_failed"));
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error ?? new Error("diagnostic_outbox_failed"));
      transaction.onerror = () => reject(transaction.error ?? new Error("diagnostic_outbox_failed"));
    });
  };
  sharedStore = {
    get: async (id) => (await request("readonly", (store) => store.get(id))) ?? null,
    insertOrLoadExact: (record) => insertOrLoadExactIndexedDbRecord(db, record),
    list: async () => request("readonly", (store) => store.getAll()),
    claim: (id, principalId, now, leaseToken, leaseUntil) =>
      claimIndexedDbRecord(db, id, principalId, now, leaseToken, leaseUntil),
    finish: (id, principalId, leaseToken, result) =>
      finishIndexedDbRecord(db, id, principalId, leaseToken, result),
    purgeExpired: (id, now) => purgeExpiredIndexedDbRecord(db, id, now),
  };
  return sharedStore;
}
function insertOrLoadExactIndexedDbRecord(
  db: Promise<IDBDatabase>,
  record: DiagnosticReportOutboxRecord,
) {
  return db.then((database) => new Promise<DiagnosticReportOutboxRecord | null>((resolve, reject) => {
    const transaction = database.transaction("reports", "readwrite");
    const store = transaction.objectStore("reports");
    const read = store.get(record.reportId);
    let result: DiagnosticReportOutboxRecord | null = null;
    read.onsuccess = () => {
      const current = read.result as DiagnosticReportOutboxRecord | undefined;
      if (!current) {
        result = record;
        store.add(record);
        return;
      }
      if (
        current.principalId === record.principalId &&
        current.report.payloadHash === record.report.payloadHash &&
        JSON.stringify(current.report) === JSON.stringify(record.report)
      ) {
        result = current;
      }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error ?? new Error("diagnostic_outbox_failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("diagnostic_outbox_failed"));
  }));
}
function claimIndexedDbRecord(
  db: Promise<IDBDatabase>,
  reportId: string,
  principalId: string,
  now: number,
  leaseToken: string,
  leaseUntil: number,
) {
  return db.then((database) => new Promise<DiagnosticReportOutboxRecord | null>((resolve, reject) => {
    const transaction = database.transaction("reports", "readwrite");
    const store = transaction.objectStore("reports");
    const read = store.get(reportId);
    let claimed: DiagnosticReportOutboxRecord | null = null;
    read.onsuccess = () => {
      const current = read.result as DiagnosticReportOutboxRecord | undefined;
      if (!current || current.principalId !== principalId || current.expiresAt <= now || current.status === "rejected" || (current.leaseUntil !== null && current.leaseUntil > now)) return;
      claimed = { ...current, status: "sending", leaseToken, leaseUntil, attemptCount: current.attemptCount + 1 };
      store.put(claimed);
    };
    transaction.oncomplete = () => resolve(claimed);
    transaction.onerror = () => reject(transaction.error ?? new Error("diagnostic_outbox_failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("diagnostic_outbox_failed"));
  }));
}

function finishIndexedDbRecord(
  db: Promise<IDBDatabase>,
  reportId: string,
  principalId: string,
  leaseToken: string,
  result: DiagnosticReportFinish,
) {
  return db.then((database) => new Promise<boolean>((resolve, reject) => {
    const transaction = database.transaction("reports", "readwrite");
    const store = transaction.objectStore("reports");
    const read = store.get(reportId);
    let finished = false;
    read.onsuccess = () => {
      const current = read.result as DiagnosticReportOutboxRecord | undefined;
      if (!current || current.principalId !== principalId || current.leaseToken !== leaseToken) return;
      finished = true;
      if (result.kind === "accepted") {
        store.delete(reportId);
      } else if (result.kind === "permanent") {
        store.put({ ...current, status: "rejected", leaseToken: null, leaseUntil: null });
      } else {
        store.put({ ...current, status: "retry_wait", retryAt: result.retryAt, leaseToken: null, leaseUntil: null });
      }
    };
    transaction.oncomplete = () => resolve(finished);
    transaction.onerror = () => reject(transaction.error ?? new Error("diagnostic_outbox_failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("diagnostic_outbox_failed"));
  }));
}

function purgeExpiredIndexedDbRecord(
  db: Promise<IDBDatabase>,
  reportId: string,
  now: number,
) {
  return db.then((database) => new Promise<boolean>((resolve, reject) => {
    const transaction = database.transaction("reports", "readwrite");
    const store = transaction.objectStore("reports");
    const read = store.get(reportId);
    let purged = false;
    read.onsuccess = () => {
      const current = read.result as DiagnosticReportOutboxRecord | undefined;
      if (!current || current.expiresAt > now) return;
      purged = true;
      store.delete(reportId);
    };
    transaction.oncomplete = () => resolve(purged);
    transaction.onerror = () => reject(transaction.error ?? new Error("diagnostic_outbox_failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("diagnostic_outbox_failed"));
  }));
}
function openOutboxDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("2000nl-diagnostic-report-outbox", 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("reports")) request.result.createObjectStore("reports", { keyPath: "reportId" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("diagnostic_outbox_unavailable"));
  });
}

let resumeTriggersInstalled = false;
function installOutboxResumeTriggers(store: DiagnosticReportOutboxStore) {
  if (resumeTriggersInstalled || typeof window === "undefined") return;
  resumeTriggersInstalled = true;
  const drain = () => void drainDiagnosticReportOutbox(store).catch(() => undefined);
  window.addEventListener("online", drain);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") drain(); });
  supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") drain(); });
}
