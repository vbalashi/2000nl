#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "../..");
const requireFromUi = createRequire(path.join(repoRoot, "apps/ui/package.json"));
const { Client } = requireFromUi("pg");

const DEFAULT_QUERIES = ["ontdekken", "de", "het", "zijn"];
const DEFAULT_GROUPS = ["headwords", "examples", "definitions", "alphabetical"];
const DEFAULT_LAYERS = ["sql", "http-2000nl", "audiofilms"];
const DEFAULT_2000NL_BASE = "https://2000.dilum.io/api/platform/v1";
const DEFAULT_AUDIOFILMS_BASE = "https://audiofilms-api.dilum.io";

function parseArgs(argv) {
  const options = {
    queries: DEFAULT_QUERIES,
    groups: DEFAULT_GROUPS,
    layers: DEFAULT_LAYERS,
    samples: 30,
    hotSamples: 100,
    hotQueries: ["de", "het"],
    languageCode: "nl",
    limit: 6,
    includeLookup: true,
    includeFullSearch: true,
    includeGroupSearch: true,
    randomize: true,
    idleMs: 0,
    output: null,
    summaryOutput: null,
    twoThousandNlBase: DEFAULT_2000NL_BASE,
    audiofilmsBase: DEFAULT_AUDIOFILMS_BASE,
    insecureTls: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[i];
    };

    if (arg === "--queries") options.queries = splitCsv(next());
    else if (arg === "--groups") options.groups = splitCsv(next());
    else if (arg === "--layers") options.layers = splitCsv(next());
    else if (arg === "--samples") options.samples = positiveInt(next(), arg);
    else if (arg === "--hot-samples") options.hotSamples = positiveInt(next(), arg);
    else if (arg === "--hot-queries") options.hotQueries = splitCsv(next());
    else if (arg === "--language-code") options.languageCode = next();
    else if (arg === "--limit") options.limit = positiveInt(next(), arg);
    else if (arg === "--idle-ms") options.idleMs = nonNegativeInt(next(), arg);
    else if (arg === "--output") options.output = next();
    else if (arg === "--summary-output") options.summaryOutput = next();
    else if (arg === "--2000nl-base") options.twoThousandNlBase = next().replace(/\/+$/, "");
    else if (arg === "--audiofilms-base") options.audiofilmsBase = next().replace(/\/+$/, "");
    else if (arg === "--no-lookup") options.includeLookup = false;
    else if (arg === "--no-full-search") options.includeFullSearch = false;
    else if (arg === "--no-group-search") options.includeGroupSearch = false;
    else if (arg === "--ordered") options.randomize = false;
    else if (arg === "--insecure-tls") options.insecureTls = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node db/scripts/dictionary_latency_benchmark.mjs [options]

Emits JSONL rows for dictionary latency attribution without printing secrets.

Options:
  --queries ontdekken,de,het,zijn       Query list. Default: ${DEFAULT_QUERIES.join(",")}
  --groups headwords,examples,...       Group list. Default: ${DEFAULT_GROUPS.join(",")}
  --layers sql,http-2000nl,audiofilms   Layers to measure. Default: ${DEFAULT_LAYERS.join(",")}
  --samples 30                          Samples per normal combination.
  --hot-queries de,het                  Queries that use --hot-samples.
  --hot-samples 100                     Samples for hot queries.
  --language-code nl                    Language code. Default: nl.
  --limit 6                             Lookup/search limit. Default: 6.
  --idle-ms 0                           Sleep before the first sample of each combination.
  --output path.jsonl                   Write JSONL to a file instead of stdout.
  --summary-output path.json            Write aggregate p50/p95/p99/max summary.
  --2000nl-base URL                     2000NL Platform base URL.
  --audiofilms-base URL                 AudioFilms API base URL.
  --no-lookup                           Skip lookup paths.
  --no-full-search                      Skip full grouped search paths.
  --no-group-search                     Skip per-group search paths.
  --ordered                             Disable randomized combination order per round.
  --insecure-tls                        Disable TLS certificate verification for diagnostics.

Required environment:
  SQL layer: SUPABASE_DB_URL or DATABASE_URL.
  2000NL HTTP layer: PLATFORM_CATALOG_ACCESS_TOKEN.
  AudioFilms layer: no local token required for the production proxy.

The script also loads .env.local and apps/ui/.env.local when present.`);
}

function splitCsv(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function positiveInt(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function nonNegativeInt(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = unquoteEnvValue(rawValue.trim());
  }
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function getDatabaseUrl() {
  const value = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!value) return null;
  if (value.includes("sslmode=")) return value;
  return `${value}${value.includes("?") ? "&" : "?"}sslmode=require`;
}

function buildCombos(options) {
  const combos = [];
  for (const query of options.queries) {
    for (const layer of options.layers) {
      if (options.includeLookup) {
        combos.push({ layer, path: "lookup", query, group: null });
      }
      if (options.includeFullSearch) {
        combos.push({ layer, path: "search", query, group: null });
      }
      if (options.includeGroupSearch) {
        for (const group of options.groups) {
          combos.push({ layer, path: "search", query, group });
        }
      }
    }
  }
  return combos;
}

function samplesForCombo(options, combo) {
  return options.hotQueries.includes(combo.query) ? options.hotSamples : options.samples;
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function sleep(ms) {
  if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
}

function createWriter(output) {
  if (!output) {
    return {
      write(row) {
        process.stdout.write(`${JSON.stringify(row)}\n`);
      },
      close() {},
    };
  }
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  const stream = fs.createWriteStream(output, { flags: "w" });
  return {
    write(row) {
      stream.write(`${JSON.stringify(row)}\n`);
    },
    close() {
      stream.end();
    },
  };
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { resultShape: typeof payload, resultCount: null, error: null };
  }
  if (Array.isArray(payload.items)) {
    return { resultShape: "items", resultCount: payload.items.length, error: payload.error || null };
  }
  if (Array.isArray(payload.groups)) {
    return { resultShape: "groups", resultCount: payload.groups.length, error: payload.error || null };
  }
  if (payload.items && Array.isArray(payload.items)) {
    return { resultShape: "items", resultCount: payload.items.length, error: payload.error || null };
  }
  return {
    resultShape: payload.error ? "error" : "object",
    resultCount: null,
    error: payload.error || payload.code || null,
  };
}

function parseServerTiming(value) {
  if (!value) return {};
  const timings = {};
  for (const part of value.split(",")) {
    const [namePart, ...params] = part.trim().split(";");
    const name = namePart.trim();
    if (!name) continue;
    const durParam = params.find((param) => param.trim().startsWith("dur="));
    if (!durParam) {
      timings[name] = null;
      continue;
    }
    const dur = Number(durParam.trim().slice(4));
    timings[name] = Number.isFinite(dur) ? dur : null;
  }
  return timings;
}

function selectedHeaders(headers) {
  const keys = [
    "server-timing",
    "x-request-id",
    "x-correlation-id",
    "x-vercel-id",
    "cf-ray",
    "cache-control",
  ];
  const result = {};
  for (const key of keys) {
    const value = headers.get(key);
    if (value) result[key] = value;
  }
  return result;
}

async function measureSql(client, combo, options) {
  if (combo.path === "lookup") {
    const result = await client.query(
      "select lookup_public_catalog_entries_v1($1, $2, $3) as result",
      [combo.query, options.languageCode, options.limit],
    );
    return { status: 200, payload: result.rows[0]?.result ?? null };
  }
  if (combo.group) {
    const result = await client.query(
      "select private.search_dictionary_group_keyset_v1(NULL, true, $1, $2, NULL, $3, $4, NULL) as result",
      [combo.query, options.languageCode, combo.group, options.limit],
    );
    const groupPayload = result.rows[0]?.result ?? null;
    return {
      status: 200,
      payload: {
        groups: groupPayload ? [groupPayload] : [],
      },
    };
  }
  const result = await client.query(
    "select search_public_dictionary_groups_v1($1, $2, NULL, $3, NULL) as result",
    [combo.query, options.languageCode, options.limit],
  );
  return { status: 200, payload: result.rows[0]?.result ?? null };
}

async function measureHttp2000Nl(combo, options, token, requestId) {
  const endpoint =
    combo.path === "lookup" ? "catalog/lookup" : "catalog/search";
  const body =
    combo.path === "lookup"
      ? {
          query: combo.query,
          languageCode: options.languageCode,
          intent: "external-click",
          limit: options.limit,
        }
      : {
          query: combo.query,
          languageCode: options.languageCode,
          ...(combo.group ? { group: combo.group } : {}),
          limit: options.limit,
        };
  return measureFetch(`${options.twoThousandNlBase}/${endpoint}`, body, {
    authorization: `Bearer ${token}`,
    "x-request-id": requestId,
  });
}

async function measureAudioFilms(combo, options, requestId) {
  const endpoint = combo.path === "lookup" ? "lookup" : "search";
  const body =
    combo.path === "lookup"
      ? {
          clickedForm: combo.query,
          sourceLanguageCode: options.languageCode,
          limit: options.limit,
        }
      : {
          clickedForm: combo.query,
          sourceLanguageCode: options.languageCode,
          ...(combo.group ? { group: combo.group } : {}),
          limit: options.limit,
        };
  return measureFetch(`${options.audiofilmsBase}/api/dict/${endpoint}`, body, {
    "x-request-id": requestId,
  });
}

async function measureFetch(url, body, extraHeaders) {
  const start = performance.now();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const headersMs = performance.now() - start;
  const text = await response.text();
  const totalMs = performance.now() - start;
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { error: "non_json_response", detail: text.slice(0, 160) };
  }
  return {
    status: response.status,
    payload,
    totalMs,
    ttfbMs: headersMs,
    headers: selectedHeaders(response.headers),
  };
}

async function main() {
  loadEnvFile(path.join(repoRoot, ".env.local"));
  loadEnvFile(path.join(repoRoot, "apps/ui/.env.local"));
  const options = parseArgs(process.argv.slice(2));
  if (options.insecureTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
  const runId = crypto.randomUUID();
  const writer = createWriter(options.output);
  const rows = [];
  const databaseUrl = getDatabaseUrl();
  const catalogToken = process.env.PLATFORM_CATALOG_ACCESS_TOKEN;

  if (options.layers.includes("sql") && !databaseUrl) {
    throw new Error("SQL layer requires SUPABASE_DB_URL or DATABASE_URL");
  }
  if (options.layers.includes("http-2000nl") && !catalogToken) {
    throw new Error("http-2000nl layer requires PLATFORM_CATALOG_ACCESS_TOKEN");
  }

  const client = databaseUrl
    ? new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })
    : null;
  if (client) await client.connect();

  const combos = buildCombos(options);
  const maxSamples = Math.max(...combos.map((combo) => samplesForCombo(options, combo)));
  const startedCombos = new Set();

  try {
    for (let sample = 1; sample <= maxSamples; sample += 1) {
      const eligible = combos.filter((combo) => sample <= samplesForCombo(options, combo));
      const round = options.randomize ? shuffle(eligible) : eligible;
      for (const combo of round) {
        const comboKey = `${combo.layer}:${combo.path}:${combo.query}:${combo.group || ""}`;
        const isFirst = !startedCombos.has(comboKey);
        if (isFirst) {
          startedCombos.add(comboKey);
          await sleep(options.idleMs);
        }
        const requestId = crypto.randomUUID();
        const rowBase = {
          timestamp: new Date().toISOString(),
          runId,
          sample,
          sampleKind: isFirst ? "first_after_idle" : "warm",
          layer: combo.layer,
          path: combo.path,
          query: combo.query,
          languageCode: options.languageCode,
          group: combo.group,
          limit: options.limit,
          requestId,
        };

        try {
          const start = performance.now();
          let measured;
          if (combo.layer === "sql") {
            measured = await measureSql(client, combo, options);
            measured.totalMs = performance.now() - start;
            measured.ttfbMs = null;
            measured.headers = {};
          } else if (combo.layer === "http-2000nl") {
            measured = await measureHttp2000Nl(combo, options, catalogToken, requestId);
          } else if (combo.layer === "audiofilms") {
            measured = await measureAudioFilms(combo, options, requestId);
          } else {
            throw new Error(`Unsupported layer: ${combo.layer}`);
          }

          const summary = summarizePayload(measured.payload);
          const serverTiming = measured.headers?.["server-timing"] || null;
          const row = {
            ...rowBase,
            ok: measured.status >= 200 && measured.status < 300 && !summary.error,
            status: measured.status,
            totalMs: roundMs(measured.totalMs),
            ttfbMs: measured.ttfbMs === null ? null : roundMs(measured.ttfbMs),
            serverTiming,
            serverTimingMs: parseServerTiming(serverTiming),
            responseHeaders: measured.headers || {},
            ...summary,
          };
          rows.push(row);
          writer.write(row);
        } catch (error) {
          const row = {
            ...rowBase,
            ok: false,
            status: null,
            totalMs: null,
            ttfbMs: null,
            serverTiming: null,
            serverTimingMs: {},
            responseHeaders: {},
            resultShape: "exception",
            resultCount: null,
            error: error instanceof Error ? error.message : String(error),
          };
          rows.push(row);
          writer.write(row);
        }
      }
    }
  } finally {
    if (client) await client.end();
    if (options.summaryOutput) {
      writeSummary(options.summaryOutput, rows);
    }
    writer.close();
  }
}

function roundMs(value) {
  return Math.round(value * 10) / 10;
}

function writeSummary(outputPath, rows) {
  const summary = summarizeRows(rows);
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
}

function summarizeRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = [
      row.layer,
      row.path,
      row.query,
      row.group || "",
      row.sampleKind,
    ].join("\u0000");
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
  }

  return [...groups.entries()]
    .map(([key, groupRows]) => {
      const [layer, pathName, query, group, sampleKind] = key.split("\u0000");
      const statusCounts = {};
      for (const row of groupRows) {
        const status = row.status === null ? "exception" : String(row.status);
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }
      const serverTimingNames = new Set();
      for (const row of groupRows) {
        for (const name of Object.keys(row.serverTimingMs || {})) {
          serverTimingNames.add(name);
        }
      }
      const serverTiming = {};
      for (const name of serverTimingNames) {
        serverTiming[name] = stats(
          groupRows
            .map((row) => row.serverTimingMs?.[name])
            .filter((value) => typeof value === "number"),
        );
      }
      return {
        layer,
        path: pathName,
        query,
        group: group || null,
        sampleKind,
        count: groupRows.length,
        ok: groupRows.filter((row) => row.ok).length,
        errors: groupRows.filter((row) => !row.ok).length,
        statusCounts,
        totalMs: stats(groupRows.map((row) => row.totalMs).filter((value) => typeof value === "number")),
        ttfbMs: stats(groupRows.map((row) => row.ttfbMs).filter((value) => typeof value === "number")),
        serverTimingMs: serverTiming,
      };
    })
    .sort((a, b) =>
      [a.layer, a.path, a.query, a.group || "", a.sampleKind].join("|").localeCompare(
        [b.layer, b.path, b.query, b.group || "", b.sampleKind].join("|"),
      ),
    );
}

function stats(values) {
  if (values.length === 0) {
    return { count: 0, p50: null, p95: null, p99: null, max: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: roundMs(percentile(sorted, 0.5)),
    p95: roundMs(percentile(sorted, 0.95)),
    p99: roundMs(percentile(sorted, 0.99)),
    max: roundMs(sorted[sorted.length - 1]),
  };
}

function percentile(sorted, p) {
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
