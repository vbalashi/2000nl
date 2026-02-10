#!/usr/bin/env node
/* eslint-disable no-console */

// Bulk re-translation script for word_entry_translations using the current LLM pipeline.
//
// Usage:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OPENAI_API_KEY=... \
//     node scripts/retranslate-translations.js
//
// If OPENAI_API_KEY is not set, this script will try to read it from `.env.local`.
//
// Options:
//   --limit <n>            Process at most N word entries (default: all)
//   --concurrency <n>      Number of parallel OpenAI requests (default: 2)
//   --min-delay-ms <n>     Minimum delay per worker between OpenAI requests (default: 250)
//   --target-lang <code>   Only translate this target_lang (e.g. en, ru) (default: all found)
//   --dry-run              Do not write to DB
//   --log-jsonl <path>     Append per-item results as JSONL for later review
//
// Notes:
// - Writes translations to provider='openai' rows (upsert on conflict).
// - Includes word_entries.part_of_speech in the prompt and fingerprint, like the API route.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const DEFAULT_OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_OPENAI_MODEL = "gpt-5.2";

// Keep in sync with apps/ui/app/api/translation/route.ts
const TRANSLATION_PIPELINE_VERSION = "note_v1";

const POS_DUTCH_LABELS = {
  zn: "zelfstandig naamwoord",
  ww: "werkwoord",
  bn: "bijvoeglijk naamwoord",
  bw: "bijwoord",
  vz: "voorzetsel",
  lidw: "lidwoord",
  vnw: "voornaamwoord",
  tw: "telwoord",
};

const LANGUAGE_LABELS = {
  en: "English",
  "en-us": "English",
  "en-gb": "English",
  nl: "Dutch",
  ru: "Russian",
};

function stripOptionalQuotes(value) {
  const v = String(value || "");
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function loadEnvLocalIfNeeded() {
  // Prefer explicit environment variables, but fall back to `.env.local` for scripts.
  // Supports running from either `apps/ui` or monorepo root.
  const candidates = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), "apps", "ui", ".env.local"),
  ];

  const envPath = candidates.find((p) => fs.existsSync(p));
  if (!envPath) return;

  const raw = fs.readFileSync(envPath, "utf8");
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = stripOptionalQuotes(trimmed.slice(eq + 1).trim());
    if (!key) continue;
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

function loadPromptText(filename) {
  const direct = path.join(process.cwd(), "lib", "translation", "prompts", filename);
  const fullPath = fs.existsSync(direct)
    ? direct
    : path.join(process.cwd(), "apps", "ui", "lib", "translation", "prompts", filename);
  try {
    return fs.readFileSync(fullPath, "utf8");
  } catch {
    return "";
  }
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function getOpenAiTranslationPromptFingerprint() {
  const system = loadPromptText("openai_translation_system_v1.txt");
  const userInstructions = loadPromptText("openai_translation_user_instructions_v1.txt");
  return sha256([system, userInstructions].join("\n---\n"));
}

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function normalizeLang(value) {
  return String(value || "").trim().toLowerCase().replace("_", "-");
}

function normalizePosCode(pos) {
  if (typeof pos !== "string") return "";
  return pos.trim().toLowerCase();
}

function posDutchLabelFromCode(posCode) {
  return POS_DUTCH_LABELS[posCode] || "";
}

function targetLanguageLabel(targetLang) {
  const normalized = normalizeLang(targetLang);
  return LANGUAGE_LABELS[normalized] || String(targetLang || "").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireEnv(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function supabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.");
  if (!serviceKey) {
    throw new Error(
      "Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)."
    );
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function extractTranslatableTexts(wordRow) {
  const raw = wordRow && wordRow.raw;
  const meaning = raw && raw.meanings && raw.meanings[0];
  if (!meaning || typeof meaning !== "object") return [];

  const out = [];
  const push = (p, text) => {
    if (typeof text !== "string") return;
    const trimmed = text.trim();
    if (!trimmed) return;
    out.push({ path: p, text: trimmed });
  };

  // Include Dutch article (de/het) with the headword to help disambiguation.
  const headword = wordRow && wordRow.headword;
  const genderRaw = wordRow && wordRow.gender;
  const gender = typeof genderRaw === "string" ? genderRaw.trim().toLowerCase() : "";
  const article = gender === "de" || gender === "het" ? gender : "";
  const combined =
    article && typeof headword === "string" && headword.trim()
      ? `${article} ${headword.trim()}`
      : headword;

  push(["headword"], combined);
  push(["meanings", 0, "definition"], meaning.definition);
  push(["meanings", 0, "context"], meaning.context);

  if (Array.isArray(meaning.examples)) {
    meaning.examples.forEach((ex, i) => push(["meanings", 0, "examples", i], ex));
  }
  if (Array.isArray(meaning.idioms)) {
    meaning.idioms.forEach((idiom, i) => {
      if (typeof idiom === "string") {
        push(["meanings", 0, "idioms", i], idiom);
        return;
      }
      if (!idiom || typeof idiom !== "object") return;
      push(["meanings", 0, "idioms", i, "expression"], idiom.expression);
      push(["meanings", 0, "idioms", i, "explanation"], idiom.explanation);
    });
  }

  return out;
}

function buildOverlay(items, translated) {
  const overlay = { meanings: [{}] };

  const setAtPath = (p, value) => {
    let cur = overlay;
    for (let i = 0; i < p.length; i++) {
      const key = p[i];
      const isLast = i === p.length - 1;
      if (isLast) {
        cur[key] = value;
        return;
      }
      const nextKey = p[i + 1];
      if (cur[key] == null) cur[key] = typeof nextKey === "number" ? [] : {};
      cur = cur[key];
    }
  };

  items.forEach((item, idx) => setAtPath(item.path, translated[idx] || ""));
  return overlay;
}

function computeFingerprint(items) {
  // Stable hash of what we sent to the translation provider (paths + texts)
  const payload = items.map((it) => ({ path: it.path, text: it.text }));
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function buildOpenAIMessages(texts, targetLang, context) {
  const label = targetLanguageLabel(targetLang);
  const pos = (context && context.partOfSpeech && String(context.partOfSpeech).trim()) || null;
  const posCode =
    (context && context.partOfSpeechCode && String(context.partOfSpeechCode).trim()) || null;

  const systemPrompt =
    loadPromptText("openai_translation_system_v1.txt").trim() ||
    "You are a translation engine. Translate all input texts faithfully, keeping punctuation and formatting. If partOfSpeech is provided, use it to disambiguate the headword sense. Also provide a brief contextual note (1-2 sentences) about the most common meaning of the headword vs its meaning in the specific example/context, when different.";
  const userInstructions =
    loadPromptText("openai_translation_user_instructions_v1.txt").trim() ||
    "Return only valid JSON with top-level keys: 'translations' (array aligned to input order) and 'note' (string or null). Keep 'note' to 1-2 sentences max; use null if no meaningful note applies.";

  return [
    {
      role: "system",
      content: systemPrompt,
    },
    {
      role: "user",
      content: JSON.stringify({
        targetLanguage: label,
        partOfSpeech: pos,
        partOfSpeechCode: posCode,
        texts,
        responseFormat: {
          translations: ["string"],
          note: "string | null",
        },
        instructions: userInstructions,
      }),
    },
  ];
}

function parseOpenAIResult(content, expectedCount) {
  let payload = null;
  try {
    payload = JSON.parse(content);
  } catch {
    throw new Error("OpenAI returned invalid JSON");
  }
  const translations = payload && payload.translations;
  if (!Array.isArray(translations)) throw new Error("OpenAI response missing translations array");
  if (translations.length !== expectedCount) {
    throw new Error(`OpenAI returned ${translations.length} translations for ${expectedCount} inputs`);
  }

  const noteRaw = payload && payload.note;
  const note = typeof noteRaw === "string" ? noteRaw.trim().slice(0, 800) : null;

  return {
    translations: translations.map((t) => (typeof t === "string" ? t : String(t))),
    note: note && note.length > 0 ? note : null,
  };
}

async function openAITranslateWithRetries({ apiKey, apiUrl, model, texts, targetLang, context }) {
  const maxRetries = toInt(process.env.OPENAI_MAX_RETRIES, 2);
  const timeoutMs = toInt(process.env.OPENAI_TIMEOUT_MS, 15000);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body = {
        model,
        temperature: 0,
        messages: buildOpenAIMessages(texts, targetLang, context),
      };
      if (String(model || "").startsWith("gpt-5")) body.reasoning_effort = "none";

      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const resBody = await res.text().catch(() => "");
        throw new Error(`OpenAI error ${res.status}: ${resBody || res.statusText}`);
      }

      const data = await res.json();
      const errMsg = data && data.error && data.error.message;
      if (errMsg) throw new Error(`OpenAI error: ${errMsg}`);

      const content = (((data || {}).choices || [])[0] || {}).message || {};
      const msg = content.content || "";
      if (!String(msg).trim()) throw new Error("OpenAI returned an empty translation");

      return parseOpenAIResult(String(msg), texts.length);
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      await sleep(300 * Math.pow(2, attempt));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Unreachable: retries exhausted");
}

async function listTranslationKeys(client, targetLangFilter) {
  const keys = [];
  const seen = new Set();
  const pageSize = 1000;
  let offset = 0;

  for (;;) {
    let q = client
      .from("word_entry_translations")
      .select("word_entry_id,target_lang")
      .order("word_entry_id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (targetLangFilter) q = q.eq("target_lang", normalizeLang(targetLangFilter));

    const { data, error } = await q;
    if (error) throw error;

    const rows = data || [];
    for (const row of rows) {
      const wordId = row.word_entry_id;
      const lang = row.target_lang;
      if (!wordId || !lang) continue;
      const k = `${wordId}:${lang}`;
      if (seen.has(k)) continue;
      seen.add(k);
      keys.push({ word_entry_id: wordId, target_lang: lang });
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return keys;
}

async function fetchWordEntriesByIds(client, ids) {
  const out = new Map();
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await client
      .from("word_entries")
      .select("id,headword,gender,part_of_speech,raw")
      .in("id", chunk);
    if (error) throw error;
    for (const row of data || []) out.set(row.id, row);
  }
  return out;
}

function createLimiter(concurrency) {
  let active = 0;
  const queue = [];

  const runNext = () => {
    if (active >= concurrency) return;
    const next = queue.shift();
    if (!next) return;
    active += 1;
    Promise.resolve()
      .then(next.fn)
      .then(
        (res) => next.resolve(res),
        (err) => next.reject(err)
      )
      .finally(() => {
        active -= 1;
        runNext();
      });
  };

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      runNext();
    });
}

function ensureLogDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  loadEnvLocalIfNeeded();

  if (hasFlag("--help") || hasFlag("-h")) {
    console.log("Usage: node scripts/retranslate-translations.js [options]");
    process.exit(0);
  }

  const targetLangFilter = getArg("--target-lang");
  const limit = toInt(getArg("--limit"), 0);
  const concurrency = toInt(getArg("--concurrency"), 2);
  const minDelayMs = toInt(getArg("--min-delay-ms"), 250);
  const dryRun = hasFlag("--dry-run");
  const logJsonlPath = getArg("--log-jsonl");

  const apiKey = process.env.OPENAI_API_KEY || requireEnv("OPENAI_API_KEY");
  const apiUrl = process.env.OPENAI_API_URL || DEFAULT_OPENAI_API_URL;
  const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;

  const client = supabaseAdmin();

  const keys = await listTranslationKeys(client, targetLangFilter);
  const uniqueWordIds = Array.from(new Set(keys.map((k) => k.word_entry_id)));
  const workCount = limit > 0 ? Math.min(uniqueWordIds.length, limit) : uniqueWordIds.length;

  console.log(
    `Found ${keys.length} translation keys across ${uniqueWordIds.length} word entries.` +
      (targetLangFilter ? ` (filtered to lang='${normalizeLang(targetLangFilter)}')` : "")
  );
  console.log(
    `Processing ${workCount} word entries (concurrency=${concurrency}, minDelayMs=${minDelayMs}, dryRun=${dryRun}).`
  );

  const wordIdsToProcess = uniqueWordIds.slice(0, workCount);
  const wordIdsToProcessSet = new Set(wordIdsToProcess);
  const wordMap = await fetchWordEntriesByIds(client, wordIdsToProcess);

  const langsByWordId = new Map();
  for (const k of keys) {
    if (!wordIdsToProcessSet.has(k.word_entry_id)) continue;
    const set = langsByWordId.get(k.word_entry_id) || new Set();
    set.add(k.target_lang);
    langsByWordId.set(k.word_entry_id, set);
  }

  if (logJsonlPath) ensureLogDir(logJsonlPath);
  const appendLog = (obj) => {
    if (!logJsonlPath) return;
    fs.appendFileSync(logJsonlPath, `${JSON.stringify(obj)}\n`, "utf8");
  };

  const limitRun = createLimiter(concurrency);
  const startedAt = Date.now();
  let done = 0;
  let failures = 0;
  let translatedRows = 0;
  const sampleComparisons = [];

  const wordIds = Array.from(langsByWordId.keys());

  // Each worker enforces its own minimum delay between OpenAI requests.
  const workerLastCallAt = Array(concurrency).fill(0);
  let workerIdx = 0;

  const tasks = wordIds.map((wordId) =>
    limitRun(async () => {
      const myWorker = workerIdx++ % concurrency;

      const word = wordMap.get(wordId);
      const langs = Array.from(langsByWordId.get(wordId) || []);
      done += 1;

      const pct = ((done / wordIds.length) * 100).toFixed(1);
      process.stdout.write(`\r${done}/${wordIds.length} (${pct}%) word entries processed...`);

      if (!word || !word.raw) {
        failures += 1;
        appendLog({ ok: false, word_entry_id: wordId, error: "word_entries.raw not found" });
        return;
      }

      const items = extractTranslatableTexts(word);
      const posCode = normalizePosCode(word.part_of_speech);
    const fingerprint = computeFingerprint([
      ...items,
      { path: ["__part_of_speech__"], text: posCode || "" },
      { path: ["__translation_pipeline_version__"], text: TRANSLATION_PIPELINE_VERSION },
      { path: ["__translation_prompt_fingerprint__", "openai"], text: getOpenAiTranslationPromptFingerprint() },
    ]);

      const context = {
        partOfSpeech: posDutchLabelFromCode(posCode) || null,
        partOfSpeechCode: posCode || null,
      };

      for (const dbLang of langs) {
        const targetLang = dbLang; // db stores normalized (lowercase, hyphenated)

        const waitForRateLimit = async () => {
          const last = workerLastCallAt[myWorker] || 0;
          const elapsed = Date.now() - last;
          if (elapsed < minDelayMs) await sleep(minDelayMs - elapsed);
          workerLastCallAt[myWorker] = Date.now();
        };

        try {
          let beforeSample = null;
          if (sampleComparisons.length < 10) {
            const { data } = await client
              .from("word_entry_translations")
              .select("provider,overlay,note,updated_at")
              .eq("word_entry_id", wordId)
              .eq("target_lang", normalizeLang(dbLang))
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            beforeSample = data || null;
          }

          await waitForRateLimit();

          const texts = items.map((i) => i.text);
          const result =
            texts.length === 0
              ? { translations: [], note: null }
              : await openAITranslateWithRetries({
                  apiKey,
                  apiUrl,
                  model,
                  texts,
                  targetLang,
                  context,
                });

          const overlay = buildOverlay(items, result.translations);
          const note = result.note || null;

          translatedRows += 1;

          if (!dryRun) {
            const { error: upsertError } = await client
              .from("word_entry_translations")
              .upsert(
                {
                  word_entry_id: wordId,
                  target_lang: normalizeLang(dbLang),
                  provider: "openai",
                  status: "ready",
                  overlay,
                  note,
                  source_fingerprint: fingerprint,
                  error_message: null,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "word_entry_id,target_lang,provider" }
              );
            if (upsertError) throw upsertError;
          }

          appendLog({
            ok: true,
            word_entry_id: wordId,
            target_lang: normalizeLang(dbLang),
            provider: "openai",
            note,
            fingerprint,
          });

          if (sampleComparisons.length < 10) {
            sampleComparisons.push({
              word_entry_id: wordId,
              target_lang: normalizeLang(dbLang),
              latest_provider: beforeSample?.provider || null,
              latest_headword: beforeSample?.overlay?.headword || null,
              latest_note: beforeSample?.note || null,
              new_headword: overlay.headword || null,
              new_note: note,
            });
          }
        } catch (err) {
          failures += 1;
          const message = String(err && err.message ? err.message : err).slice(0, 2000);
          appendLog({
            ok: false,
            word_entry_id: wordId,
            target_lang: normalizeLang(dbLang),
            provider: "openai",
            error: message,
          });

          if (!dryRun) {
            await client
              .from("word_entry_translations")
              .upsert(
                {
                  word_entry_id: wordId,
                  target_lang: normalizeLang(dbLang),
                  provider: "openai",
                  status: "failed",
                  overlay: null,
                  note: null,
                  source_fingerprint: fingerprint,
                  error_message: message,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "word_entry_id,target_lang,provider" }
              )
              .catch(() => {});
          }
        }
      }
    })
  );

  await Promise.all(tasks);
  process.stdout.write("\n");

  const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log("Summary:");
  console.log(`- Word entries processed: ${wordIds.length}`);
  console.log(`- Translation rows attempted: ${translatedRows + failures}`);
  console.log(`- Failures: ${failures}`);
  console.log(`- Duration: ${durationSec}s`);
  console.log(`- Model: ${model}`);
  console.log(`- Pipeline fingerprint version: ${TRANSLATION_PIPELINE_VERSION}`);

  if (sampleComparisons.length) {
    console.log("Sample comparisons (latest row vs new OpenAI row):");
    for (const s of sampleComparisons) {
      console.log(
        `- ${s.word_entry_id} lang=${s.target_lang} latest_provider=${s.latest_provider} ` +
          `latest_headword=${JSON.stringify(s.latest_headword)} new_headword=${JSON.stringify(
            s.new_headword
          )}`
      );
      if (s.latest_note || s.new_note) {
        console.log(
          `  note: latest=${JSON.stringify(s.latest_note)} new=${JSON.stringify(s.new_note)}`
        );
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
