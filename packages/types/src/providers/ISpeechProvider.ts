export interface ISpeechProvider {
  transcribe(audioBuffer: Buffer, mimeType: string, language?: string): Promise<string>;
}
