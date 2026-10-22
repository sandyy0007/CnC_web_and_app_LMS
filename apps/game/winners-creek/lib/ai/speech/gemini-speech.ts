import type { SpeechProvider } from "../types";
import { getAIConfig } from "../config";

export class GeminiSpeechProvider implements SpeechProvider {
  name: string;
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    const aiConfig = getAIConfig();
    this.apiKey = apiKey || aiConfig.apiKey || "";
    this.model = model || aiConfig.transcriptionModel;
    this.name = `gemini/${this.model}`;

    if (!this.apiKey) {
      throw new Error("AI services are not configured. GEMINI_API_KEY is missing.");
    }
  }

  async transcribeAudio(
    audioBytes: Uint8Array,
    mimeType: string,
  ): Promise<{
    transcript: string;
    confidence?: number;
    words?: { word: string; start: number; end: number }[];
  }> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const base64Audio = Buffer.from(audioBytes).toString("base64");

    const payload = {
      systemInstruction: {
        parts: [
          {
            text: "You are an expert audio speech-to-text transcription engine. Transcribe the provided audio accurately. Return only the raw spoken text transcript with no extra commentary or markdown formatting.",
          },
        ],
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: mimeType || "audio/webm",
                data: base64Audio,
              },
            },
            {
              text: "Transcribe this audio recording completely and accurately.",
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.0,
      },
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 401 || res.status === 403) {
        throw new Error(`AI_AUTH_ERROR: Gemini audio transcription unauthorized (${res.status}): ${errText}`);
      }
      if (res.status === 429) {
        throw new Error(`AI_RATE_LIMITED: Gemini rate limit exceeded (${res.status}): ${errText}`);
      }
      if (res.status === 404) {
        throw new Error(`AI_MODEL_UNAVAILABLE: Gemini transcription model '${this.model}' unavailable (${res.status}): ${errText}`);
      }
      throw new Error(`Gemini transcription failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const transcript = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    return {
      transcript,
      confidence: 0.95,
    };
  }
}
