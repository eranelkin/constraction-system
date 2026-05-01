import type { ISpeechProvider } from '@constractor/types';

export class GroqSpeechProvider implements ISpeechProvider {
  private readonly endpoint = 'https://api.groq.com/openai/v1/audio/transcriptions';

  constructor(private readonly apiKey: string) {}

  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: mimeType }), 'voice.m4a');
    form.append('model', 'whisper-large-v3-turbo');
    form.append('response_format', 'json');

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Groq transcription failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as { text: string };
    return data.text.trim();
  }
}
