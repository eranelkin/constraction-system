export interface TranslationResult {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  confidence: number;
}

export interface SpeechToTextResult {
  transcript: string;
  confidence: number;
  durationMs: number;
}

export interface TextToSpeechResult {
  audioBuffer: Buffer;
  format: 'mp3' | 'wav' | 'ogg';
  durationMs: number;
}

export interface SpeechToTextOptions {
  language?: string;
  format?: 'mp3' | 'wav' | 'ogg';
}

export interface TextToSpeechOptions {
  language?: string;
  voice?: string;
  format?: 'mp3' | 'wav' | 'ogg';
}

export interface IAIProvider {
  translate(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string,
  ): Promise<TranslationResult>;

  speechToText(
    audioBuffer: Buffer,
    options?: SpeechToTextOptions,
  ): Promise<SpeechToTextResult>;

  textToSpeech(
    text: string,
    options?: TextToSpeechOptions,
  ): Promise<TextToSpeechResult>;
}
