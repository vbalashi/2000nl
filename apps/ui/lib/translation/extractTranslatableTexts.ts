export type ExtractedItem = {
  path: Array<string | number>;
  text: string;
};

export function extractTranslatableTexts(word: any): ExtractedItem[] {
  const raw = word?.raw;
  const rawExample =
    typeof raw?.example === "string"
      ? raw.example
      : typeof raw?.example?.source === "string"
        ? raw.example.source
        : undefined;
  const meaning =
    raw?.meanings?.[0] && typeof raw.meanings[0] === "object"
      ? raw.meanings[0]
      : {
          definition:
            raw?.definition ??
            raw?.translation?.text ??
            raw?.notes ??
            rawExample,
          context:
            raw?.notes &&
            raw.notes !== raw?.definition &&
            raw.notes !== raw?.translation?.text
              ? raw.notes
              : undefined,
          examples: rawExample ? [rawExample] : [],
        };

  const out: ExtractedItem[] = [];
  const push = (path: Array<string | number>, text: unknown) => {
    if (typeof text !== "string") return;
    const trimmed = text.trim();
    if (!trimmed) return;
    out.push({ path, text: trimmed });
  };

  // Include Dutch article (de/het) with the headword so the translation provider
  // has the correct noun sense / gender context.
  const headword: unknown = word?.headword;
  const genderRaw: unknown = word?.gender;
  const gender =
    typeof genderRaw === "string" ? genderRaw.trim().toLowerCase() : "";
  const article = gender === "de" || gender === "het" ? gender : "";
  const combined =
    article && typeof headword === "string" && headword.trim()
      ? `${article} ${headword.trim()}`
      : headword;
  push(["headword"], combined);
  push(["meanings", 0, "definition"], meaning.definition);
  push(["meanings", 0, "context"], meaning.context);

  if (Array.isArray(meaning.examples)) {
    meaning.examples.forEach((ex: unknown, i: number) => {
      push(["meanings", 0, "examples", i], ex);
    });
  }

  if (Array.isArray(meaning.idioms)) {
    meaning.idioms.forEach((idiom: any, i: number) => {
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
