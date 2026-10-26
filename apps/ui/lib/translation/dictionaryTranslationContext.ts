import type { OpenAITranslationContext } from "./openaiTranslationContract";

const POS_DUTCH_LABELS: Record<string, string> = {
  zn: "zelfstandig naamwoord",
  ww: "werkwoord",
  bn: "bijvoeglijk naamwoord",
  bw: "bijwoord",
  vz: "voorzetsel",
  lidw: "lidwoord",
  vnw: "voornaamwoord",
  tw: "telwoord",
};

export function normalizePartOfSpeechCode(pos: unknown) {
  return typeof pos === "string" ? pos.trim().toLowerCase() : "";
}

export function dictionaryTranslationContext(
  pos: unknown,
): OpenAITranslationContext {
  const partOfSpeechCode = normalizePartOfSpeechCode(pos);
  return {
    partOfSpeech: POS_DUTCH_LABELS[partOfSpeechCode] ?? null,
    partOfSpeechCode: partOfSpeechCode || null,
  };
}
