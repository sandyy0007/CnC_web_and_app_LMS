import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { getPresentationDetail } from "@/lib/simulation/presentation-service";
import { generatePresentationQuestions, evaluateQAAnswer } from "@/lib/ai/evaluators/qa-evaluator";
import { getAIProvider } from "@/lib/ai/factory";
import { toApiError } from "@/lib/errors";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  try {
    const session = await requireSession();
    const { sessionId } = await ctx.params;
    const detail = await getPresentationDetail(session, sessionId);
    const provider = getAIProvider();

    const questions = await generatePresentationQuestions(
      detail.slides.map((s) => ({
        index: s.slideIndex,
        textContent: s.textContent ?? "",
        notes: s.notes,
      })),
      detail.presentation.scriptContent ?? "System Architecture overview",
      provider,
    );

    return NextResponse.json({ questions }, { status: 200 });
  } catch (e) {
    const { status, body } = toApiError(e);
    return NextResponse.json(body, { status });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  try {
    await requireSession();
    await ctx.params;
    const body = await req.json();
    const { question, answerTranscript } = body;

    if (!question || !answerTranscript) {
      return NextResponse.json({ error: "Missing question or answerTranscript" }, { status: 400 });
    }

    const provider = getAIProvider();
    const evaluation = await evaluateQAAnswer(question, answerTranscript, provider);

    return NextResponse.json({ evaluation }, { status: 200 });
  } catch (e) {
    const { status, body } = toApiError(e);
    return NextResponse.json(body, { status });
  }
}
