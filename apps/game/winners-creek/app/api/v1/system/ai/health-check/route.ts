import { NextResponse } from "next/server";
import { getAIConfig } from "@/lib/ai/config";

export async function POST() {
  const config = getAIConfig();

  if (!config.isConfigured || !config.apiKey) {
    return NextResponse.json(
      {
        status: "AI_NOT_CONFIGURED",
        error: "AI services are not configured. GEMINI_API_KEY is missing.",
      },
      { status: 503 },
    );
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${config.textModel}:generateContent?key=${config.apiKey}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: "ping" }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 5,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      if (
        res.status === 401 ||
        res.status === 403 ||
        (res.status === 400 && (errText.includes("API_KEY") || errText.includes("API key") || errText.includes("invalid")))
      ) {
        return NextResponse.json(
          {
            status: "AI_AUTH_ERROR",
            error: "Invalid or unauthorized Gemini API key.",
          },
          { status: 401 },
        );
      }

      if (res.status === 429) {
        return NextResponse.json(
          {
            status: "AI_RATE_LIMITED",
            error: "Gemini API rate limit exceeded.",
          },
          { status: 429 },
        );
      }

      if (res.status === 404) {
        return NextResponse.json(
          {
            status: "AI_MODEL_UNAVAILABLE",
            error: `Configured Gemini model '${config.textModel}' was not found or is unavailable.`,
          },
          { status: 404 },
        );
      }

      return NextResponse.json(
        {
          status: "AI_REQUEST_FAILED",
          error: `Gemini health check failed with status ${res.status}: ${errText}`,
        },
        { status: 502 },
      );
    }

    const data = await res.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      return NextResponse.json(
        {
          status: "AI_RESPONSE_EMPTY",
          error: "Gemini provider returned an empty response.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      status: "ok",
      provider: "gemini",
      model: config.textModel,
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json(
        {
          status: "AI_TIMEOUT",
          error: "Gemini health check timed out after 10 seconds.",
        },
        { status: 504 },
      );
    }

    return NextResponse.json(
      {
        status: "AI_PROVIDER_ERROR",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
