import type {
  IAIProvider,
  TranslationResult,
  SpeechToTextResult,
  TextToSpeechResult,
  SpeechToTextOptions,
  TextToSpeechOptions,
} from '@constractor/types';

export class MockAIProvider implements IAIProvider {
  async translate(
    text: string,
    targetLanguage: string,
    sourceLanguage = 'en',
  ): Promise<TranslationResult> {
    return {
      translatedText: `[${targetLanguage.toUpperCase()}] ${text}`,
      sourceLanguage,
      targetLanguage,
      confidence: 0.99,
    };
  }

  async speechToText(
    _audioBuffer: Buffer,
    options?: SpeechToTextOptions,
  ): Promise<SpeechToTextResult> {
    return {
      transcript: `[Mock transcript in ${options?.language ?? 'en'}]`,
      confidence: 0.95,
      durationMs: 1000,
    };
  }

  async textToSpeech(
    text: string,
    options?: TextToSpeechOptions,
  ): Promise<TextToSpeechResult> {
    return {
      audioBuffer: Buffer.from(`mock-audio:${text}`),
      format: options?.format ?? 'mp3',
      durationMs: text.length * 50,
    };
  }
}
