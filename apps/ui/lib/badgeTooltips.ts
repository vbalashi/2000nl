export type BadgeTooltipLang = "ru" | "en" | "de" | "fr" | "uk";

// Part-of-speech codes used by the UI / DB.
export type PartOfSpeechCode =
  | "zn"
  | "ww"
  | "bn"
  | "bw"
  | "vz"
  | "lidw"
  | "vnw"
  | "tw";

const POS_TOOLTIP_TRANSLATIONS: Record<
  PartOfSpeechCode,
  Record<BadgeTooltipLang, string>
> = {
  // zn = zelfstandig naamwoord
  zn: {
    en: "noun",
    de: "Substantiv",
    fr: "nom",
    ru: "существительное",
    uk: "іменник",
  },
  // ww = werkwoord
  ww: {
    en: "verb",
    de: "Verb",
    fr: "verbe",
    ru: "глагол",
    uk: "дієслово",
  },
  // bn = bijvoeglijk naamwoord
  bn: {
    en: "adjective",
    de: "Adjektiv",
    fr: "adjectif",
    ru: "прилагательное",
    uk: "прикметник",
  },
  // bw = bijwoord
  bw: {
    en: "adverb",
    de: "Adverb",
    fr: "adverbe",
    ru: "наречие",
    uk: "прислівник",
  },
  // vz = voorzetsel
  vz: {
    en: "preposition",
    de: "Präposition",
    fr: "préposition",
    ru: "предлог",
    uk: "прийменник",
  },
  // lidw = lidwoord
  lidw: {
    en: "article",
    de: "Artikel",
    fr: "article",
    ru: "артикль",
    uk: "артикль",
  },
  // vnw = voornaamwoord
  vnw: {
    en: "pronoun",
    de: "Pronomen",
    fr: "pronom",
    ru: "местоимение",
    uk: "займенник",
  },
  // tw = telwoord
  tw: {
    en: "numeral",
    de: "Zahlwort",
    fr: "numéral",
    ru: "числительное",
    uk: "числівник",
  },
};

const GENERIC_BADGE_TOOLTIPS: Record<
  string,
  Record<BadgeTooltipLang, string>
> = {
  idiom: {
    en: "idiom",
    de: "Redewendung",
    fr: "idiome",
    ru: "идиома или устойчивое выражение",
    uk: "ідіома",
  },
  idiom_definition: {
    en: "idiom definition",
    de: "Bedeutung der Redewendung",
    fr: "définition de l’idiome",
    ru: "значение идиомы",
    uk: "значення ідіоми",
  },
};

function normalizeLang(
  lang: string | null | undefined
): BadgeTooltipLang | null {
  if (!lang || lang === "off") return null;
  if (lang === "ru" || lang === "en" || lang === "de" || lang === "fr" || lang === "uk") {
    return lang;
  }
  return null;
}

export function getPosBadgeTooltip(opts: {
  posCode: string | null | undefined;
  translationLang: string | null | undefined;
}): string | undefined {
  const lang = normalizeLang(opts.translationLang);
  if (!lang) return undefined;

  const key = (opts.posCode ?? "").toLowerCase() as PartOfSpeechCode;
  const translated = POS_TOOLTIP_TRANSLATIONS[key]?.[lang];
  return translated;
}

export function getGenericBadgeTooltip(opts: {
  key: "idiom" | "idiom_definition";
  translationLang: string | null | undefined;
}): string | undefined {
  const lang = normalizeLang(opts.translationLang);
  if (!lang) return undefined;
  return GENERIC_BADGE_TOOLTIPS[opts.key][lang];
}
