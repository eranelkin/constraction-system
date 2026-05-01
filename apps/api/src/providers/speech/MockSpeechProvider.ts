import type { ISpeechProvider } from '@constractor/types';

export class MockSpeechProvider implements ISpeechProvider {
  async transcribe(_audioBuffer: Buffer, _mimeType: string, _language?: string): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 900));
    return 'This is a test voice message transcription.';
  }
}
