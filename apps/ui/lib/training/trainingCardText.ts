export const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const maskTargetWordInDefinition = (
  text: string,
  headword: string,
  placeholder = "...",
) => {
  const trimmedHeadword = headword.trim();
  if (!text || !trimmedHeadword) return text;

  const escaped = escapeRegExp(trimmedHeadword);
  const pattern = new RegExp(
    `(^|[^\\p{L}])(${escaped})(?:[’'’-]?[\\p{L}]{0,6})?(?!\\p{L})`,
    "giu",
  );

  return text.replace(pattern, (_match, prefix) => `${prefix}${placeholder}`);
};
