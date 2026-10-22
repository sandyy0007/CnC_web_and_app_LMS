import type { SpeechProvider } from "../types";

export class OpenAISpeechProvider implements SpeechProvider {
  name = "openai/whisper-1";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async transcribeAudio(audioBytes: Uint8Array, mimeType: string): Promise<{
    transcript: string;
    confidence?: number;
    words?: { word: string; start: number; end: number }[];
  }> {
    const ext = mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "mp4" : "wav";
    const blob = new Blob([audioBytes.buffer as ArrayBuffer], { type: mimeType });
    const formData = new FormData();
    formData.append("file", blob, `audio.${ext}`);
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Whisper transcription failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return {
      transcript: data.text ?? "",
      words: data.words,
    };
  }
}
