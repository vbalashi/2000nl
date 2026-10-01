export type NounArticle = "de" | "het";
export function toggleNounArticle(selected: readonly NounArticle[], article: NounArticle): NounArticle[] {
  return selected.includes(article) ? selected.filter(item => item !== article) : [...selected, article];
}
export function singleNounArticle(selected: readonly NounArticle[]): NounArticle | null {
  const unique = [...new Set(selected)];
  return unique.length === 1 ? unique[0] : null;
}
