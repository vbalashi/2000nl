import crypto from "crypto";

export type SourceContextParseResult =
  | { ok: true; value: Record<string, unknown> | null; version: "none" | "v1" | "v2" }
  | { ok: false; error: string; status: number };

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseSourceContext(
  value: unknown,
  userId: string,
): SourceContextParseResult {
  if (value === undefined || value === null) {
    return { ok: true, value: null, version: "none" };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "invalid_source_context", status: 400 };
  }

  const size = JSON.stringify(value).length;
  if (size > 16_384) {
    return { ok: false, error: "source_context_too_large", status: 413 };
  }

  const record = value as Record<string, unknown>;
  if (record.contractVersion !== "source-context-v2") {
    return { ok: true, value: record, version: "v1" };
  }

  const normalized = normalizeSourceContextV2(record, userId);
  if (!normalized.ok) return normalized;
  return { ok: true, value: normalized.value, version: "v2" };
}

function normalizeSourceContextV2(
  record: Record<string, unknown>,
  userId: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string; status: number } {
  const source = asRecord(record.source);
  const kind = asString(source.kind);
  if (!kind || !["youtube_video", "web_page", "text_document", "ebook"].includes(kind)) {
    return { ok: false, error: "unsupported_source_kind", status: 400 };
  }

  const normalizedSource = normalizeV2Source(source, kind, userId);
  if (!normalizedSource.ok) return normalizedSource;

  const artifact = normalizeV2Artifact(record.artifact);
  if (!artifact.ok) return artifact;
  const location = normalizeV2Location(record.location);
  if (!location.ok) return location;
  const selection = normalizeV2Selection(record.selection);
  if (!selection.ok) return selection;

  return {
    ok: true,
    value: stripUndefined({
      contractVersion: "source-context-v2",
      source: normalizedSource.value,
      artifact: artifact.value,
      location: location.value,
      selection: selection.value,
      context: selection.context,
    }),
  };
}

function normalizeV2Source(
  source: Record<string, unknown>,
  kind: string,
  userId: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string; status: number } {
  if (kind === "youtube_video") {
    const provider = asString(source.provider);
    const externalId = asString(source.externalId);
    if (provider !== "youtube" || !externalId || !/^[A-Za-z0-9_-]{11}$/.test(externalId)) {
      return { ok: false, error: "invalid_youtube_source", status: 400 };
    }
    return {
      ok: true,
      value: stripUndefined({
        kind,
        provider: "youtube",
        externalId,
        url: `https://www.youtube.com/watch?v=${externalId}`,
        languageCode: normalizeOptionalLanguageCode(source.languageCode),
      }),
    };
  }

  if (kind === "web_page") {
    const canonical = normalizePrivateWebUrl(source.canonicalUrl ?? source.url);
    if (!canonical) return { ok: false, error: "invalid_web_page_source", status: 400 };
    return {
      ok: true,
      value: stripUndefined({
        kind,
        provider: "web",
        externalId: privateSourceExternalId(userId, kind, canonical),
        canonicalUrl: canonical,
        languageCode: normalizeOptionalLanguageCode(source.languageCode),
      }),
    };
  }

  if (kind === "text_document") {
    const instanceId = boundedString(source.documentInstanceId, 160);
    const revision = boundedString(source.documentRevision, 160);
    if (!instanceId || !revision) {
      return { ok: false, error: "invalid_text_document_source", status: 400 };
    }
    return {
      ok: true,
      value: stripUndefined({
        kind,
        provider: "pontix",
        externalId: privateSourceExternalId(userId, kind, `${instanceId}:${revision}`),
        languageCode: normalizeOptionalLanguageCode(source.languageCode),
        documentInstanceId: instanceId,
        documentRevision: revision,
      }),
    };
  }

  const provider = boundedString(source.provider, 80);
  const externalId = boundedString(source.externalId, 160);
  if (!provider || !externalId) {
    return { ok: false, error: "invalid_ebook_source", status: 400 };
  }
  return {
    ok: true,
    value: stripUndefined({
      kind,
      provider,
      externalId: privateSourceExternalId(userId, kind, `${provider}:${externalId}`),
      languageCode: normalizeOptionalLanguageCode(source.languageCode),
    }),
  };
}

function normalizePrivateWebUrl(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.username = "";
  url.password = "";
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
  ) {
    url.port = "";
  }
  for (const key of Array.from(url.searchParams.keys())) {
    if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  return url.toString();
}

function privateSourceExternalId(userId: string, kind: string, identity: string) {
  return `private:${kind}:${crypto
    .createHash("sha256")
    .update(`${userId}:${kind}:${identity}`)
    .digest("hex")}`;
}

function normalizeV2Artifact(
  value: unknown,
): { ok: true; value?: Record<string, unknown> } | { ok: false; error: string; status: number } {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "invalid_source_artifact", status: 400 };
  }
  const artifact = value as Record<string, unknown>;
  const artifactKind = asString(artifact.artifactKind);
  if (artifactKind !== "caption_phrase_set") {
    return { ok: false, error: "unsupported_source_artifact", status: 400 };
  }
  const producer = boundedString(artifact.producer, 80);
  if (!producer) return { ok: false, error: "missing_artifact_producer", status: 400 };
  return {
    ok: true,
    value: stripUndefined({
      artifactKind,
      producer,
      snapshotRevisionId: boundedString(artifact.snapshotRevisionId, 160),
      textSourceId: boundedString(artifact.textSourceId, 160),
      textSourceRevisionId: boundedString(artifact.textSourceRevisionId, 160),
      textContentFingerprint: boundedString(artifact.textContentFingerprint, 160),
      timingEvidenceRevisionId: boundedString(artifact.timingEvidenceRevisionId, 160),
      phraseSetRevisionId: boundedString(artifact.phraseSetRevisionId, 160),
      builderVersion: boundedString(artifact.builderVersion, 80),
      languageCode: normalizeOptionalLanguageCode(artifact.languageCode),
      quality: boundedString(artifact.quality, 80),
    }),
  };
}

function normalizeV2Location(
  value: unknown,
): { ok: true; value?: Record<string, unknown> } | { ok: false; error: string; status: number } {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "invalid_source_location", status: 400 };
  }
  const location = value as Record<string, unknown>;
  const kind = asString(location.kind);
  if (!kind || !["caption_phrase", "text_selection"].includes(kind)) {
    return { ok: false, error: "unsupported_source_location", status: 400 };
  }
  const startMs = optionalNonNegativeInt(location.startMs);
  const endMs = optionalNonNegativeInt(location.endMs);
  if (startMs === false || endMs === false) {
    return { ok: false, error: "invalid_source_timing", status: 400 };
  }
  if (typeof startMs === "number" && typeof endMs === "number" && endMs < startMs) {
    return { ok: false, error: "invalid_source_timing", status: 400 };
  }
  const phraseIndex = optionalNonNegativeInt(location.phraseIndex);
  if (phraseIndex === false) {
    return { ok: false, error: "invalid_phrase_index", status: 400 };
  }
  const charStart = optionalNonNegativeInt(location.charStart);
  const charEnd = optionalNonNegativeInt(location.charEnd);
  if (charStart === false || charEnd === false) {
    return { ok: false, error: "invalid_source_location", status: 400 };
  }
  if (typeof charStart === "number" && typeof charEnd === "number" && charEnd < charStart) {
    return { ok: false, error: "invalid_source_location", status: 400 };
  }
  const locatorConfidence = asString(location.locatorConfidence);
  if (
    locatorConfidence &&
    !["canonical", "derived", "approximate"].includes(locatorConfidence)
  ) {
    return { ok: false, error: "invalid_locator_confidence", status: 400 };
  }
  return {
    ok: true,
    value: stripUndefined({
      kind,
      startMs: startMs ?? undefined,
      endMs: endMs ?? undefined,
      phraseIndex: phraseIndex ?? undefined,
      locatorConfidence,
      phraseTextHash: boundedString(location.phraseTextHash, 160),
      timingQuality: boundedString(location.timingQuality, 80),
      navigationId: boundedString(location.navigationId, 160),
      charStart: charStart ?? undefined,
      charEnd: charEnd ?? undefined,
    }),
  };
}

function normalizeV2Selection(
  value: unknown,
):
  | { ok: true; value?: Record<string, unknown>; context?: Record<string, unknown> }
  | { ok: false; error: string; status: number } {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "invalid_source_selection", status: 400 };
  }
  const selection = value as Record<string, unknown>;
  const clickedForm = boundedString(selection.clickedForm, 160);
  const tokenIndex = optionalNonNegativeInt(selection.tokenIndex);
  const charStart = optionalNonNegativeInt(selection.charStart);
  const charEnd = optionalNonNegativeInt(selection.charEnd);
  if (tokenIndex === false || charStart === false || charEnd === false) {
    return { ok: false, error: "invalid_source_selection", status: 400 };
  }
  if (typeof charStart === "number" && typeof charEnd === "number" && charEnd < charStart) {
    return { ok: false, error: "invalid_source_selection", status: 400 };
  }
  const contextText = boundedString(selection.contextText, 1000);
  return {
    ok: true,
    value: stripUndefined({
      clickedForm,
      tokenIndex: tokenIndex ?? undefined,
      charStart: charStart ?? undefined,
      charEnd: charEnd ?? undefined,
      contextTextHash: boundedString(selection.contextTextHash, 160),
      selectionHash: boundedString(selection.selectionHash, 160),
    }),
    context:
      clickedForm || contextText
        ? stripUndefined({ clickedForm, text: contextText })
        : undefined,
  };
}

function boundedString(value: unknown, maxLength: number) {
  const text = asString(value);
  return text ? text.slice(0, maxLength) : undefined;
}

function normalizeOptionalLanguageCode(value: unknown) {
  const text = boundedString(value, 16);
  return text ? text.replace("_", "-").toLowerCase() : undefined;
}

function optionalNonNegativeInt(value: unknown): number | null | false {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || (value as number) < 0) return false;
  return value as number;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null),
  ) as T;
}
