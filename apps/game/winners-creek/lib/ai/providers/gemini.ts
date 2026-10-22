import type { AIProvider } from "../types";
import { getAIConfig } from "../config";

export class GeminiProvider implements AIProvider {
  name: string;
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    const aiConfig = getAIConfig();
    this.apiKey = apiKey || aiConfig.apiKey || "";
    this.model = model || aiConfig.textModel;
    this.name = `gemini/${this.model}`;

    if (!this.apiKey) {
      throw new Error("AI services are not configured. GEMINI_API_KEY is missing.");
    }
  }

  async generateStructuredCompletion<T>(options: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    schemaDescription?: string;
  }): Promise<T> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const promptText = options.schemaDescription
      ? `${options.userPrompt}\n\nStrict requirement: Output valid JSON adhering to schema: ${options.schemaDescription}`
      : options.userPrompt;

    const payload = {
      systemInstruction: {
        parts: [{ text: options.systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: promptText }],
        },
      ],
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        responseMimeType: "application/json",
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
        throw new Error(`AI_AUTH_ERROR: Gemini request unauthorized (${res.status}): ${errText}`);
      }
      if (res.status === 429) {
        throw new Error(`AI_RATE_LIMITED: Gemini rate limit exceeded (${res.status}): ${errText}`);
      }
      if (res.status === 404) {
        throw new Error(`AI_MODEL_UNAVAILABLE: Gemini model '${this.model}' unavailable (${res.status}): ${errText}`);
      }
      throw new Error(`Gemini API request failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error("Gemini API returned an empty completion part.");
    }

    let clean = candidateText.trim();
    if (clean.startsWith("```json")) {
      clean = clean.slice(7);
    }
    if (clean.startsWith("```")) {
      clean = clean.slice(3);
    }
    if (clean.endsWith("```")) {
      clean = clean.slice(0, -3);
    }
    clean = clean.trim();

    return JSON.parse(clean) as T;
  }

  async generateText(options: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
  }): Promise<string> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const payload = {
      systemInstruction: {
        parts: [{ text: options.systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: options.userPrompt }],
        },
      ],
      generationConfig: {
        temperature: options.temperature ?? 0.7,
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
        throw new Error(`AI_AUTH_ERROR: Gemini request unauthorized: ${errText}`);
      }
      if (res.status === 429) {
        throw new Error(`AI_RATE_LIMITED: Gemini rate limit exceeded: ${errText}`);
      }
      if (res.status === 404) {
        throw new Error(`AI_MODEL_UNAVAILABLE: Gemini model unavailable: ${errText}`);
      }
      throw new Error(`Gemini API text generation failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }
}
