export interface ITranslator {
  translate(text: string, targetLang: string): Promise<string>;
  translate(texts: string[], targetLang: string): Promise<string[]>;
}
