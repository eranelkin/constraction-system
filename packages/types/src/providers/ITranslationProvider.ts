export interface ITranslationProvider {
  translate(text: string, targetLanguage: string): Promise<string>;
}
