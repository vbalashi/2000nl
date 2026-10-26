export function hidePerfectParticiple(
  text: string | null | undefined
): string | null | undefined {
  if (text == null) return text;

  // Dutch verb definitions sometimes include perfect auxiliary metadata like:
  // "( heeft opgelost ) ..." or "( is vertrokken ) ...".
  //
  // We keep the auxiliary but hide the participle so cards don't "give away" the answer.
  return text.replace(
    /(^|\s)\(\s*(is|heeft)\s+([\p{L}][\p{L}'’-]*)\s*\)/giu,
    (_match, prefix: string, aux: string) => `${prefix}( ${aux} ... )`
  );
}

