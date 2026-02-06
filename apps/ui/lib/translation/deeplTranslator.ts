import { ITranslator } from "./ITranslator";

type DeepLTranslatorOptions = {
  apiKey: string;
  apiUrl?: string;
};

function normalizeLang(lang: string) {
  return lang.trim().replace("_", "-").toUpperCase();
}

function escapeXml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(text: string) {
  return text
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function buildContextXml(texts: string[]) {
  const body = texts
    .map((text, index) => `<t id=\"${index}\">${escapeXml(text)}</t>`)
    .join("");
  return `<translations>${body}</translations>`;
}

function parseContextXml(xml: string, expectedCount: number) {
  const out: Array<string | undefined> = new Array(expectedCount).fill(undefined);
  const re = /<t\b[^>]*\bid="(\d+)"[^>]*>([\s\S]*?)<\/t>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const idx = Number(match[1]);
    if (!Number.isFinite(idx) || idx < 0 || idx >= expectedCount) continue;
    const raw = match[2] ?? "";
    out[idx] = unescapeXml(raw.trim());
  }

  const missing = out.findIndex((v) => typeof v !== "string");
  if (missing !== -1) {
    throw new Error(
      `DeepL returned incomplete XML translation (missing index ${missing})`
    );
  }

  return out as string[];
}

export class DeepLTranslator implements ITranslator {
  private apiKey: string;
  private apiUrl: string;

  constructor(options: DeepLTranslatorOptions) {
    this.apiKey = options.apiKey;
    this.apiUrl = options.apiUrl ?? "https://api-free.deepl.com/v2/translate";
  }

  async translate(text: string, targetLang: string): Promise<string>;
  async translate(texts: string[], targetLang: string): Promise<string[]>;
  async translate(textOrTexts: string | string[], targetLang: string) {
    const texts = Array.isArray(textOrTexts) ? textOrTexts : [textOrTexts];
    if (!this.apiKey) {
      throw new Error("DEEPL_API_KEY is not configured");
    }

    const params = new URLSearchParams();
    params.set("target_lang", normalizeLang(targetLang));
    params.set("tag_handling", "xml");
    params.set("preserve_formatting", "1");
    params.append("text", buildContextXml(texts));

    const res = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `DeepL-Auth-Key ${this.apiKey}`,
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`DeepL error ${res.status}: ${body || res.statusText}`);
    }

    const data = (await res.json()) as { translations?: Array<{ text: string }> };
    const translatedXml = data.translations?.[0]?.text ?? "";
    if (!translatedXml.trim()) {
      throw new Error("DeepL returned an empty translation");
    }

    const translated = parseContextXml(translatedXml, texts.length);
    return Array.isArray(textOrTexts) ? translated : translated[0] ?? "";
  }
}
