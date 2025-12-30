import { WordRaw } from "./types";

export type LinkTerm = {
  label: string;
  headword?: string;
};

export const getPrimaryMeaning = (raw: WordRaw) => {
  const firstMeaning = raw.meanings?.[0];
  const definition =
    firstMeaning?.definition ?? raw.headword ?? "Definitie niet beschikbaar.";

  // Prefer new 'examples' array, fallback to legacy 'example' string
  const examples =
    firstMeaning?.examples ??
    (firstMeaning?.example ? [firstMeaning.example] : []);
  const context = firstMeaning?.context;
  const idioms = firstMeaning?.idioms ?? [];

  const links = firstMeaning?.links ?? raw.links ?? [];

  const normalizedLinks = links
    .filter((item): item is LinkTerm => Boolean(item?.label))
    .map((item) => ({ label: item.label ?? "", headword: item.headword }));

  return { definition, context, examples, idioms, links: normalizedLinks };
};

export const getAllMeanings = (raw: WordRaw) => {
  if (!raw.meanings || raw.meanings.length === 0) {
    return [getPrimaryMeaning(raw)];
  }

  return raw.meanings.map((m) => {
    const definition = m.definition ?? "Definitie niet beschikbaar.";
    const examples = m.examples ?? (m.example ? [m.example] : []);
    const context = m.context;
    const idioms = m.idioms ?? [];

    // Merge specific links with global links? Usually links are per meaning or global.
    // Let's assume meaning links are sufficient or fallback to global if empty?
    // Current logic uses meaning links OR global links.
    const links = m.links ?? raw.links ?? [];

    const normalizedLinks = links
      .filter((item): item is LinkTerm => Boolean(item?.label))
      .map((item) => ({ label: item.label ?? "", headword: item.headword }));

    return { definition, context, examples, idioms, links: normalizedLinks };
  });
};

export type DefinitionSegment = {
  text: string;
  link: LinkTerm | null;
};

export const buildSegments = (
  text: string,
  links: LinkTerm[]
): DefinitionSegment[] => {
  if (!text) {
    return [{ text: "", link: null }];
  }

  const normalizedText = text.toLowerCase();
  const matches: Array<{ start: number; end: number; term: LinkTerm }> = [];

  links.forEach((term) => {
    if (!term.label) return;
    const label = term.label.toLowerCase();
    const position = normalizedText.indexOf(label);
    if (position === -1) {
      return;
    }
    matches.push({ start: position, end: position + term.label.length, term });
  });

  matches.sort((a, b) => a.start - b.start);

  const segments: DefinitionSegment[] = [];
  let cursor = 0;

  for (const match of matches) {
    if (match.start > cursor) {
      segments.push({ text: text.slice(cursor, match.start), link: null });
    }
    segments.push({
      text: text.slice(match.start, match.end),
      link: match.term,
    });
    cursor = match.end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), link: null });
  }

  if (segments.length === 0) {
    segments.push({ text, link: null });
  }

  return segments;
};
