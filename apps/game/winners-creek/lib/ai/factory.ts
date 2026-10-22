import type { AIProvider } from "./types";
import { getAIConfig } from "./config";
import { GeminiProvider } from "./providers/gemini";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";

let cachedProvider: AIProvider | null = null;

class UnconfiguredProvider implements AIProvider {
  name = "unconfigured";

  async generateStructuredCompletion<T>(): Promise<T> {
    throw new Error("AI services are not configured. GEMINI_API_KEY is required.");
  }

  async generateText(): Promise<string> {
    throw new Error("AI services are not configured. GEMINI_API_KEY is required.");
  }
}

export function getAIProvider(): AIProvider {
  if (cachedProvider) return cachedProvider;

  const aiConfig = getAIConfig();
  if (aiConfig.isConfigured && aiConfig.apiKey) {
    cachedProvider = new GeminiProvider(aiConfig.apiKey, aiConfig.textModel);
    return cachedProvider;
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    cachedProvider = new AnthropicProvider(anthropicKey);
    return cachedProvider;
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    cachedProvider = new OpenAIProvider(openAiKey);
    return cachedProvider;
  }

  cachedProvider = new UnconfiguredProvider();
  return cachedProvider;
}

export function resetAIProviderCache() {
  cachedProvider = null;
}
