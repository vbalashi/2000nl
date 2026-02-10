#!/usr/bin/env node
/* eslint-disable no-console */

// Translation eval loop:
// 1) Translate a small curated set of tricky cases using the same OpenAI prompt as production.
// 2) Ask a separate LLM judge to score/critique outputs.
// 3) Edit prompt files, rerun, iterate.
//
// Usage:
//   node scripts/eval-translation-prompt.js
//
// Optional:
//   OPENAI_MODEL=gpt-5.2
//   OPENAI_JUDGE_MODEL=gpt-5.2
//   --case <id>
//   --min-score 85
//   --log-jsonl /tmp/translation-eval.jsonl

const fs = require("fs");
const path = require("path");

const cases = require("./translation-eval-cases");

const DEFAULT_OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_OPENAI_MODEL = "gpt-5.2";
const DEFAULT_JUDGE_MODEL = "gpt-5.2";

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

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeLang(lang) {
  return String(lang || "").trim().toLowerCase().replace("_", "-");
}

function targetLanguageLabel(targetLang) {
  const normalized = normalizeLang(targetLang);
  return LANGUAGE_LABELS[normalized] || String(targetLang || "").trim();
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
    { role: "system", content: systemPrompt },
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

function parseJson(content, errPrefix) {
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`${errPrefix} returned invalid JSON`);
  }
}

function parseOpenAITranslationResult(content, expectedCount) {
  const payload = parseJson(content, "OpenAI");
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

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function openaiChat({ apiKey, apiUrl, model, messages, timeoutMs, maxRetries }) {
  const url = apiUrl || DEFAULT_OPENAI_API_URL;
  const retries = Number.isFinite(maxRetries) ? maxRetries : 2;
  const tmo = Number.isFinite(timeoutMs) ? timeoutMs : 15000;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), tmo);

    try {
      const body = { model, temperature: 0, messages };
      if (String(model || "").startsWith("gpt-5")) body.reasoning_effort = "none";

      const res = await fetch(url, {
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

      const msg = (((data || {}).choices || [])[0] || {}).message || {};
      const content = msg.content || "";
      if (!String(content).trim()) throw new Error("OpenAI returned empty content");
      return String(content);
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(300 * Math.pow(2, attempt));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Unreachable");
}

function extractTranslatableTexts(word) {
  const raw = word && word.raw;
  const meaning = raw && raw.meanings && raw.meanings[0];
  if (!meaning || typeof meaning !== "object") return [];

  const out = [];
  const push = (pathArr, text) => {
    if (typeof text !== "string") return;
    const trimmed = text.trim();
    if (!trimmed) return;
    out.push({ path: pathArr, text: trimmed });
  };

  const headword = word && word.headword;
  const genderRaw = word && word.gender;
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

function judgeMessages({ targetLang, context, texts, translations, note, expectations }) {
  const label = targetLanguageLabel(targetLang);
  const rubric = [
    "Score 0-100 and decide pass/fail for Dutch -> target translation quality.",
    "Be strict about part of speech and sense disambiguation; do not reward hallucinated meanings.",
    "Examples must preserve meaning, polarity (esp. negation), and key function words.",
    "Idioms should be idiomatic: use equivalent idiom or a natural paraphrase, not literal word-for-word.",
    "Do not require one 'perfect' phrasing; multiple valid translations can be OK.",
  ].join(" ");

  return [
    {
      role: "system",
      content:
        "You are a meticulous bilingual translation QA reviewer. Return ONLY valid JSON.",
    },
    {
      role: "user",
      content: JSON.stringify({
        targetLanguage: label,
        context,
        texts,
        translations,
        note,
        expectations,
        rubric,
        responseFormat: {
          score: "number (0-100)",
          pass: "boolean",
          issues: [{ severity: "low|medium|high", text: "string" }],
          suggestedPromptTweaks: "string (short, actionable)",
        },
        instructions:
          "Return only valid JSON with top-level keys: score, pass, issues, suggestedPromptTweaks.",
      }),
    },
  ];
}

function appendJsonl(logPath, obj) {
  if (!logPath) return;
  fs.appendFileSync(logPath, `${JSON.stringify(obj)}\n`, "utf8");
}

async function main() {
  loadEnvLocalIfNeeded();

  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    console.error("Missing OPENAI_API_KEY");
    process.exit(2);
  }

  const apiUrl = process.env.OPENAI_API_URL || DEFAULT_OPENAI_API_URL;
  const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  const judgeModel = process.env.OPENAI_JUDGE_MODEL || DEFAULT_JUDGE_MODEL;

  const onlyCase = getArg("--case");
  const minScore = toInt(getArg("--min-score"), 85);
  const logJsonl = getArg("--log-jsonl");

  const selected = (cases || []).filter((c) => !onlyCase || c.id === onlyCase);
  if (!selected.length) {
    console.error(`No cases selected${onlyCase ? ` (unknown id: ${onlyCase})` : ""}`);
    process.exit(2);
  }

  let failed = 0;
  const scores = [];

  for (const c of selected) {
    const word = c.word || {};
    const items = extractTranslatableTexts(word);
    const texts = items.map((i) => i.text);
    const targetLang = c.targetLang || "ru";

    const posCode = String(word.part_of_speech || "").trim().toLowerCase();
    const context = {
      partOfSpeech: POS_DUTCH_LABELS[posCode] || null,
      partOfSpeechCode: posCode || null,
    };

    const t0 = Date.now();
    const translationContent = await openaiChat({
      apiKey,
      apiUrl,
      model,
      messages: buildOpenAIMessages(texts, targetLang, context),
    });
    const translated = parseOpenAITranslationResult(translationContent, texts.length);

    const judgeContent = await openaiChat({
      apiKey,
      apiUrl,
      model: judgeModel,
      messages: judgeMessages({
        targetLang,
        context,
        texts,
        translations: translated.translations,
        note: translated.note,
        expectations: c.expectations || "",
      }),
    });
    const judged = parseJson(judgeContent, "Judge");

    const score = Number(judged && judged.score);
    const pass = Boolean(judged && judged.pass) && Number.isFinite(score) && score >= minScore;
    scores.push(Number.isFinite(score) ? score : 0);

    const ms = Date.now() - t0;
    console.log(
      `${pass ? "PASS" : "FAIL"} [${c.id}] score=${Number.isFinite(score) ? score : "?"} ms=${ms}`
    );

    if (!pass) {
      failed++;
      const issues = Array.isArray(judged.issues) ? judged.issues : [];
      for (const it of issues.slice(0, 8)) {
        const sev = it && it.severity ? String(it.severity) : "unknown";
        const text = it && it.text ? String(it.text) : "";
        if (text) console.log(`- ${sev}: ${text}`);
      }
      if (judged && judged.suggestedPromptTweaks) {
        console.log(`Suggested prompt tweaks: ${String(judged.suggestedPromptTweaks).trim()}`);
      }
    }

    appendJsonl(logJsonl, {
      id: c.id,
      targetLang,
      context,
      texts,
      translations: translated.translations,
      note: translated.note,
      judge: judged,
      ms,
      model,
      judgeModel,
    });
  }

  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  console.log(`Summary: cases=${selected.length} failed=${failed} avgScore=${avg.toFixed(1)}`);

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
