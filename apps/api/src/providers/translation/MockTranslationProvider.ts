import type { ITranslationProvider } from '@constractor/types';

export class MockTranslationProvider implements ITranslationProvider {
  async translate(text: string, targetLanguage: string): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return `[${targetLanguage.toUpperCase()}] ${text}`;
  }
}
