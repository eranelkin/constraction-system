import type { ITranslationProvider } from '@constractor/types';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', he: 'Hebrew', ar: 'Arabic', ru: 'Russian', es: 'Spanish',
  fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ro: 'Romanian',
  uk: 'Ukrainian', pl: 'Polish', tr: 'Turkish', zh: 'Chinese',
};

export class GroqTranslationProvider implements ITranslationProvider {
  private readonly endpoint = 'https://api.groq.com/openai/v1/chat/completions';

  constructor(private readonly apiKey: string) {}

  async translate(text: string, targetLanguage: string): Promise<string> {
    const langName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage;

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `You are a translator. Translate the user's message to ${langName}. Return only the translated text with no explanation, preamble, or quotes.`,
          },
          { role: 'user', content: text },
        ],
        max_tokens: 1024,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Groq translation failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    return data.choices[0]?.message.content.trim() ?? text;
  }
}
