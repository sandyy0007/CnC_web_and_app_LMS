import type { AIProvider } from "../types";

export class AnthropicProvider implements AIProvider {
  name: string;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20241022") {
    this.apiKey = apiKey;
    this.model = model;
    this.name = `anthropic/${model}`;
  }

  async generateStructuredCompletion<T>(options: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    schemaDescription?: string;
  }): Promise<T> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        temperature: options.temperature ?? 0.2,
        system: `${options.systemPrompt}\nOutput strictly valid JSON matching this schema: ${options.schemaDescription ?? "standard JSON object"}. Do not include markdown code fences or backticks. Return raw JSON only.`,
        messages: [{ role: "user", content: options.userPrompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API request failed (${res.status}): ${errText}`);
    }

    const json = await res.json();
    const content = json.content?.[0]?.text;
    if (!content) {
      throw new Error("Anthropic API returned empty response content");
    }

    const clean = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    return JSON.parse(clean) as T;
  }

  async generateText(options: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
  }): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        temperature: options.temperature ?? 0.3,
        system: options.systemPrompt,
        messages: [{ role: "user", content: options.userPrompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API request failed (${res.status}): ${errText}`);
    }

    const json = await res.json();
    return json.content?.[0]?.text ?? "";
  }
}
