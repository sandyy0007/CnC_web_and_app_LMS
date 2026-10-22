import type { AIProvider } from "../types";

export class OpenAIProvider implements AIProvider {
  name: string;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = process.env.OPENAI_MODEL ?? "gpt-4o") {
    this.apiKey = apiKey;
    this.model = model;
    this.name = `openai/${model}`;
  }

  async generateStructuredCompletion<T>(options: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    schemaDescription?: string;
  }): Promise<T> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: options.temperature ?? 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${options.systemPrompt}\nOutput strictly valid JSON matching this schema: ${options.schemaDescription ?? "standard JSON object"}` },
          { role: "user", content: options.userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API request failed (${res.status}): ${errText}`);
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI API returned empty response content");
    }

    return JSON.parse(content) as T;
  }

  async generateText(options: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
  }): Promise<string> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: options.temperature ?? 0.3,
        messages: [
          { role: "system", content: options.systemPrompt },
          { role: "user", content: options.userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API request failed (${res.status}): ${errText}`);
    }

    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? "";
  }
}
