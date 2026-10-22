export interface AIConfig {
  provider: "gemini";
  isConfigured: boolean;
  textModel: string;
  transcriptionModel: string;
  liveModel: string;
  ttsModel: string;
  apiKey?: string;
}

export function getAIConfig(): AIConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const isConfigured = Boolean(apiKey && apiKey.length > 0);

  return {
    provider: "gemini",
    isConfigured,
    apiKey: apiKey || undefined,
    textModel: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    transcriptionModel: process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3.5-transcribe",
    liveModel: process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live",
    ttsModel: process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts",
  };
}

export function validateAndLogAIStartup(): void {
  const config = getAIConfig();
  console.log("AI Provider: Gemini");
  console.log(`Text Model: ${config.isConfigured ? "configured" : "unconfigured"}`);
  console.log(`Transcription: ${config.isConfigured ? "configured" : "unconfigured"}`);
  console.log(`Live Interview: ${config.isConfigured ? "configured" : "unconfigured"}`);
  console.log(`TTS: ${config.isConfigured ? "configured" : "unconfigured"}`);
}
