import type { IFieldExtractionProvider, ExtractedFields, FieldDefinition } from '@constractor/types';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', he: 'Hebrew', ar: 'Arabic', ru: 'Russian', es: 'Spanish',
  fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', zh: 'Chinese',
};

export class GroqFieldExtractionProvider implements IFieldExtractionProvider {
  private readonly endpoint = 'https://api.groq.com/openai/v1/chat/completions';

  constructor(private readonly apiKey: string) {}

  async extractFields(text: string, fields: FieldDefinition[], language = 'en'): Promise<ExtractedFields> {
    const fieldDescriptions = fields
      .map((f) => {
        const optionsList = f.options ? ` (options: ${f.options.join('|')})` : '';
        return `- ${f.name} (${f.type}${optionsList}): ${f.description}`;
      })
      .join('\n');

    const exampleKeys = fields.map((f) => `"${f.name}":"..."`).join(', ');
    const langName = LANGUAGE_NAMES[language] ?? language;
    const stringFields = fields.filter((f) => f.type === 'string').map((f) => f.name);
    const langInstruction = stringFields.length > 0
      ? `\n- Write values for string fields (${stringFields.join(', ')}) in ${langName}.`
      : '';

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `You extract structured data from voice-transcribed text for a form.

Fields to extract:
${fieldDescriptions}

Rules:
- Return ONLY a valid JSON object, no explanation, no markdown fences.
- Include only fields you are confident about. Omit fields that are unclear or not mentioned.
- For enum fields, the value must exactly match one of the listed options.${langInstruction}
- Example output format: {${exampleKeys}}`,
          },
          { role: 'user', content: text },
        ],
        max_tokens: 256,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Groq field extraction failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const raw = (data.choices[0]?.message.content ?? '').trim();
    const stripped = raw.replace(/^```(?:json)?|```$/gm, '').trim();

    try {
      const parsed = JSON.parse(stripped) as Record<string, unknown>;
      const result: ExtractedFields = {};
      for (const field of fields) {
        const val = parsed[field.name];
        if (typeof val === 'string' && val.trim()) {
          if (field.type === 'enum' && field.options && !field.options.includes(val)) continue;
          result[field.name] = val.trim();
        }
      }
      return result;
    } catch {
      return {};
    }
  }
}
