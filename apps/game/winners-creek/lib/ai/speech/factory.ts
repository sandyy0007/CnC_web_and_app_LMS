import type { SpeechProvider } from "../types";
import { getAIConfig } from "../config";
import { GeminiSpeechProvider } from "./gemini-speech";
import { OpenAISpeechProvider } from "./openai-speech";

export function getSpeechProvider(): SpeechProvider | null {
  const aiConfig = getAIConfig();
  if (aiConfig.isConfigured && aiConfig.apiKey) {
    return new GeminiSpeechProvider(aiConfig.apiKey, aiConfig.transcriptionModel);
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    return new OpenAISpeechProvider(openAiKey);
  }

  return null;
}
