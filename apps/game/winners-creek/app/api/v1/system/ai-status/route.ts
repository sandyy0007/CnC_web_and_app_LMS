import { NextResponse } from "next/server";
import { getAIConfig } from "@/lib/ai/config";

export async function GET() {
  const config = getAIConfig();

  return NextResponse.json({
    provider: config.provider,
    configured: config.isConfigured,
    text_model: config.textModel,
    transcription_model: config.transcriptionModel,
    live_model: config.liveModel,
    tts_model: config.ttsModel,
    status: config.isConfigured ? "available" : "unconfigured",
  });
}
