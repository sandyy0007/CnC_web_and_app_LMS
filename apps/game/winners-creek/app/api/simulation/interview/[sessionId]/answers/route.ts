import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { submitInterviewAnswer } from "@/lib/simulation/interview-service";
import { toApiError } from "@/lib/errors";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  try {
    const session = await requireSession();
    const { sessionId } = await ctx.params;
    const body = await req.json();

    const { questionId, answerTranscript } = body;
    if (!questionId || answerTranscript === undefined) {
      return NextResponse.json({ error: "Missing questionId or answerTranscript" }, { status: 400 });
    }

    const result = await submitInterviewAnswer(session, sessionId, questionId, answerTranscript);
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const { status, body } = toApiError(e);
    return NextResponse.json(body, { status });
  }
}
