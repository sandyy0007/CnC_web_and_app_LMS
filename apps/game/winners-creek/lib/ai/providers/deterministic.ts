import type { AIProvider } from "../types";

export class DeterministicEngine implements AIProvider {
  name = "deterministic-engine";

  async generateStructuredCompletion<T>(options: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    schemaDescription?: string;
  }): Promise<T> {
    // If the caller provided a fallback in userPrompt, parse or generate deterministic response
    try {
      const jsonMatch = options.userPrompt.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
      }
    } catch {
      // fallback
    }
    return {} as T;
  }

  async generateText(options: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
  }): Promise<string> {
    return `Deterministic Analysis: Processed prompt of ${options.userPrompt.length} chars.`;
  }
}
