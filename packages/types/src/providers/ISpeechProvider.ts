export interface ISpeechProvider {
  transcribe(audioBuffer: Buffer, mimeType: string): Promise<string>;
}
